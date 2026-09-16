import { AgvStatus, TaskStatus } from '../types/index.ts'
import { astar, pathTravelTime } from '../routing/Graph.ts'
import { nextId } from '../utils/id.ts'
import { EventType } from './SimulationEvent.ts'
import type { SimulationEvent } from './SimulationEvent.ts'
import type { SimulationEngine } from './SimulationEngine.ts'
import { createMaterial } from './SimulationWorld.ts'
import { markAgvStatus, markConveyorOccupancy, markStackerBusy } from '../statistics/StatisticsEngine.ts'
import type { ConveyorRuntime, MaterialRuntime, StackerJob, StackerRuntime } from './runtimeTypes.ts'

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    return payload as Record<string, unknown>
  }
  return {}
}

function stringField(payload: unknown, key: string): string | undefined {
  const value = asRecord(payload)[key]
  return typeof value === 'string' ? value : undefined
}

function numberField(payload: unknown, key: string): number | undefined {
  const value = asRecord(payload)[key]
  return typeof value === 'number' ? value : undefined
}

function stringArrayField(payload: unknown, key: string): string[] {
  const value = asRecord(payload)[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function tryEnterConveyor(
  engine: SimulationEngine,
  conveyor: ConveyorRuntime,
  material: MaterialRuntime,
  time: number,
): boolean {
  if (conveyor.occupancy.length >= conveyor.capacity) {
    return false
  }
  markConveyorOccupancy(conveyor, time)
  const travelTime = conveyor.length / conveyor.speed
  const exitTime = time + travelTime
  material.enterTime = time
  material.waitingTime = time - material.createdTime
  material.locationId = conveyor.id
  conveyor.occupancy.push({ materialId: material.id, enterTime: time, exitTime })
  engine.scheduleEvent({
    time: exitTime,
    type: EventType.ConveyorExit,
    targetId: conveyor.id,
    payload: { materialId: material.id },
  })
  return true
}

function occupySlot(
  engine: SimulationEngine,
  stacker: StackerRuntime,
  kind: 'inbound' | 'outbound',
): StackerJob | undefined {
  const rack = stacker.rackId ? engine.world.racks.get(stacker.rackId) : [...engine.world.racks.values()][0]
  if (!rack) {
    return undefined
  }
  if (kind === 'inbound') {
    const slot = rack.locations.find((location) => !location.occupied)
    if (!slot) {
      return undefined
    }
    return {
      id: nextId('job'),
      kind,
      column: slot.column,
      level: slot.level,
      createdTime: engine.getCurrentTime(),
    }
  }
  const slot = rack.locations.find((location) => location.occupied)
  if (!slot) {
    return undefined
  }
  return {
    id: nextId('job'),
    kind,
    column: slot.column,
    level: slot.level,
    createdTime: engine.getCurrentTime(),
  }
}

function startStackerIfIdle(engine: SimulationEngine, stacker: StackerRuntime, time: number): void {
  if (stacker.busy) {
    return
  }
  const job = stacker.queue[0]
  if (!job) {
    return
  }
  const horizontal = Math.abs(job.column - stacker.currentColumn) * stacker.bayWidth
  const vertical = Math.abs(job.level - stacker.currentLevel) * stacker.levelHeight
  const travelTime = Math.max(
    horizontal / stacker.horizontalSpeed,
    vertical / stacker.verticalSpeed,
  )
  markStackerBusy(stacker, time, true)
  engine.scheduleEvent({
    time: time + travelTime,
    type: EventType.StackerMove,
    targetId: stacker.id,
    payload: { jobId: job.id },
  })
}

function deliver(
  engine: SimulationEngine,
  fromId: string,
  material: MaterialRuntime,
  time: number,
): boolean {
  const destIds =
    engine.world.sources.get(fromId)?.downstreamIds ??
    engine.world.conveyors.get(fromId)?.downstreamIds ??
    []

  for (const destId of destIds) {
    const conveyor = engine.world.conveyors.get(destId)
    if (conveyor) {
      return tryEnterConveyor(engine, conveyor, material, time)
    }
    const sink = engine.world.sinks.get(destId)
    if (sink) {
      engine.scheduleEvent({
        time,
        type: EventType.SinkReceive,
        targetId: sink.id,
        payload: { materialId: material.id },
        priority: 1,
      })
      return true
    }
    const stacker = engine.world.stackers.get(destId)
    if (stacker) {
      const job = occupySlot(engine, stacker, 'inbound')
      if (!job) {
        return false
      }
      material.locationId = stacker.id
      stacker.queue.push(job)
      startStackerIfIdle(engine, stacker, time)
      return true
    }
  }

  return false
}

function pullWaitingIntoConveyor(engine: SimulationEngine, conveyor: ConveyorRuntime, time: number): void {
  while (conveyor.waiting.length > 0 && conveyor.occupancy.length < conveyor.capacity) {
    const materialId = conveyor.waiting.shift()
    if (!materialId) {
      break
    }
    const material = engine.world.materials.get(materialId)
    if (material) {
      tryEnterConveyor(engine, conveyor, material, time)
    }
  }

  for (const source of engine.world.sources.values()) {
    if (!source.downstreamIds.includes(conveyor.id)) {
      continue
    }
    while (source.waiting.length > 0 && conveyor.occupancy.length < conveyor.capacity) {
      const materialId = source.waiting.shift()
      if (!materialId) {
        break
      }
      const material = engine.world.materials.get(materialId)
      if (material) {
        tryEnterConveyor(engine, conveyor, material, time)
      }
    }
  }
}

function completeMaterial(engine: SimulationEngine, material: MaterialRuntime, time: number): void {
  material.completeTime = time
  material.waitingTime = material.enterTime !== undefined ? material.enterTime - material.createdTime : 0
  engine.world.completedCount += 1
  engine.world.waitingTimeTotal += material.waitingTime
  engine.world.completedWaitSamples += 1
}

function dispatchAgvs(engine: SimulationEngine): void {
  const time = engine.getCurrentTime()
  const assignments = engine.scheduler.dispatch({
    time,
    waitingTasks: engine.world.waitingTaskList(),
    idleAgvs: [...engine.world.agvs.values()].filter((agv) => agv.status === AgvStatus.Idle),
    graph: engine.world.graph,
  })
  for (const assignment of assignments) {
    engine.scheduleEvent({
      time,
      type: EventType.TaskAssigned,
      targetId: assignment.taskId,
      priority: 1,
      payload: {
        agvId: assignment.agvId,
        path: assignment.pathToPickup,
        travelTime: assignment.travelTime,
      },
    })
  }
}

function handleMaterialGenerate(event: SimulationEvent, engine: SimulationEngine): void {
  const source = event.targetId ? engine.world.sources.get(event.targetId) : undefined
  if (!source || source.generatedCount >= source.totalCount) {
    return
  }
  const time = event.time
  engine.world.sampleQueue(time)
  const material = createMaterial(engine.world, time, source.id)
  source.generatedCount += 1
  engine.world.log(time, `${source.name} generated ${material.id}`)
  if (!deliver(engine, source.id, material, time)) {
    source.waiting.push(material.id)
  }
  if (source.generatedCount < source.totalCount) {
    engine.scheduleEvent({
      time: time + source.generationInterval,
      type: EventType.MaterialGenerate,
      targetId: source.id,
      priority: 5,
    })
  }
}

function handleConveyorExit(event: SimulationEvent, engine: SimulationEngine): void {
  const conveyor = event.targetId ? engine.world.conveyors.get(event.targetId) : undefined
  const materialId = stringField(event.payload, 'materialId')
  if (!conveyor || !materialId) {
    return
  }
  const time = event.time
  markConveyorOccupancy(conveyor, time)
  conveyor.occupancy = conveyor.occupancy.filter((item) => item.materialId !== materialId)
  const material = engine.world.materials.get(materialId)
  if (material) {
    if (!deliver(engine, conveyor.id, material, time)) {
      conveyor.waiting.push(material.id)
    }
  }
  pullWaitingIntoConveyor(engine, conveyor, time)
}

function handleSinkReceive(event: SimulationEvent, engine: SimulationEngine): void {
  const sink = event.targetId ? engine.world.sinks.get(event.targetId) : undefined
  const materialId = stringField(event.payload, 'materialId')
  if (!sink || !materialId) {
    return
  }
  const material = engine.world.materials.get(materialId)
  if (!material) {
    return
  }
  sink.received += 1
  material.locationId = sink.id
  completeMaterial(engine, material, event.time)
  engine.world.log(event.time, `${sink.name} received ${material.id}`)
}

function handleTaskCreated(event: SimulationEvent, engine: SimulationEngine): void {
  const task = event.targetId ? engine.world.tasks.get(event.targetId) : undefined
  if (!task) {
    return
  }
  task.status = TaskStatus.Waiting
  task.createTime = event.time
  engine.world.sampleQueue(event.time)
  engine.world.log(event.time, `Task ${task.id} waiting`)
  dispatchAgvs(engine)
}

function handleTaskAssigned(event: SimulationEvent, engine: SimulationEngine): void {
  const task = event.targetId ? engine.world.tasks.get(event.targetId) : undefined
  const agvId = stringField(event.payload, 'agvId')
  const travelTime = numberField(event.payload, 'travelTime') ?? 0
  const path = stringArrayField(event.payload, 'path')
  if (!task || !agvId) {
    return
  }
  const agv = engine.world.agvs.get(agvId)
  if (!agv) {
    return
  }
  const time = event.time
  task.status = TaskStatus.Assigned
  task.assignTime = time
  task.startTime = time
  task.agvId = agv.id
  agv.currentTaskId = task.id
  agv.path = path
  agv.moveStartTime = time
  agv.moveEndTime = time + travelTime
  markAgvStatus(agv, time, AgvStatus.MovingToPickup)
  engine.world.log(time, `${agv.name} assigned to ${task.id}`)
  engine.scheduleEvent({
    time: time + travelTime,
    type: EventType.AgvMoveToPickup,
    targetId: agv.id,
    payload: { taskId: task.id },
  })
}

function placeAgvAt(engine: SimulationEngine, agvId: string, nodeId: string): void {
  const agv = engine.world.agvs.get(agvId)
  if (!agv) {
    return
  }
  agv.nodeId = nodeId
  const node = engine.world.graph.getNode(nodeId)
  if (node) {
    agv.x = node.x
    agv.y = node.y
  }
  agv.path = []
  agv.moveStartTime = undefined
  agv.moveEndTime = undefined
}

function handleAgvMoveToPickup(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  if (!agv || !taskId) {
    return
  }
  const task = engine.world.tasks.get(taskId)
  if (!task) {
    return
  }
  placeAgvAt(engine, agv.id, task.sourceId)
  markAgvStatus(agv, event.time, AgvStatus.Loading)
  task.status = TaskStatus.Running
  engine.scheduleEvent({
    time: event.time + agv.loadTime,
    type: EventType.AgvLoad,
    targetId: agv.id,
    payload: { taskId: task.id },
  })
}

function handleAgvLoad(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  if (!agv || !taskId) {
    return
  }
  const task = engine.world.tasks.get(taskId)
  if (!task) {
    return
  }
  const route = astar(engine.world.graph, task.sourceId, task.targetId)
  const path = route?.path ?? [task.sourceId, task.targetId]
  const travelTime = pathTravelTime(engine.world.graph, path, agv.speed)
  agv.path = path
  agv.moveStartTime = event.time
  agv.moveEndTime = event.time + travelTime
  markAgvStatus(agv, event.time, AgvStatus.MovingToDropoff)
  engine.scheduleEvent({
    time: event.time + travelTime,
    type: EventType.AgvMoveToDropoff,
    targetId: agv.id,
    payload: { taskId: task.id },
  })
}

function handleAgvMoveToDropoff(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  if (!agv || !taskId) {
    return
  }
  const task = engine.world.tasks.get(taskId)
  if (!task) {
    return
  }
  placeAgvAt(engine, agv.id, task.targetId)
  markAgvStatus(agv, event.time, AgvStatus.Unloading)
  engine.scheduleEvent({
    time: event.time + agv.unloadTime,
    type: EventType.AgvUnload,
    targetId: agv.id,
    payload: { taskId: task.id },
  })
}

function handleAgvUnload(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  if (!agv || !taskId) {
    return
  }
  engine.scheduleEvent({
    time: event.time,
    type: EventType.TaskCompleted,
    targetId: taskId,
    priority: 1,
    payload: { agvId: agv.id },
  })
  engine.scheduleEvent({
    time: event.time,
    type: EventType.AgvIdle,
    targetId: agv.id,
    priority: 2,
  })
}

function handleTaskCompleted(event: SimulationEvent, engine: SimulationEngine): void {
  const task = event.targetId ? engine.world.tasks.get(event.targetId) : undefined
  if (!task) {
    return
  }
  task.status = TaskStatus.Completed
  task.finishTime = event.time
  engine.world.completedTasks += 1
  engine.world.cycleTimeTotal += event.time - task.createTime
  engine.world.waitingTimeTotal += (task.startTime ?? event.time) - task.createTime
  engine.world.completedWaitSamples += 1
  engine.world.log(event.time, `Task ${task.id} completed`)
}

function handleAgvIdle(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  if (!agv) {
    return
  }
  agv.currentTaskId = undefined
  markAgvStatus(agv, event.time, AgvStatus.Idle)
  dispatchAgvs(engine)
}

function handleStackerMove(event: SimulationEvent, engine: SimulationEngine): void {
  const stacker = event.targetId ? engine.world.stackers.get(event.targetId) : undefined
  const jobId = stringField(event.payload, 'jobId')
  if (!stacker || !jobId) {
    return
  }
  const job = stacker.queue.find((item) => item.id === jobId)
  if (!job) {
    return
  }
  stacker.currentColumn = job.column
  stacker.currentLevel = job.level
  engine.scheduleEvent({
    time: event.time + stacker.forkTime,
    type: EventType.StackerFork,
    targetId: stacker.id,
    payload: { jobId: job.id },
  })
}

function handleStackerFork(event: SimulationEvent, engine: SimulationEngine): void {
  const stacker = event.targetId ? engine.world.stackers.get(event.targetId) : undefined
  const jobId = stringField(event.payload, 'jobId')
  if (!stacker || !jobId) {
    return
  }
  const jobIndex = stacker.queue.findIndex((item) => item.id === jobId)
  const job = jobIndex >= 0 ? stacker.queue[jobIndex] : undefined
  if (!job) {
    return
  }
  const rack = stacker.rackId ? engine.world.racks.get(stacker.rackId) : [...engine.world.racks.values()][0]
  if (rack) {
    const slot = rack.locations.find((location) => location.column === job.column && location.level === job.level)
    if (slot) {
      slot.occupied = job.kind === 'inbound'
    }
  }
  stacker.queue.splice(jobIndex, 1)
  markStackerBusy(stacker, event.time, false)
  engine.world.completedCount += 1
  engine.world.log(event.time, `${stacker.name} finished ${job.kind} at C${job.column} L${job.level}`)
  startStackerIfIdle(engine, stacker, event.time)
}

function handleDispatch(event: SimulationEvent, engine: SimulationEngine): void {
  void event
  dispatchAgvs(engine)
}

export function registerHandlers(engine: SimulationEngine): void {
  engine.register(EventType.MaterialGenerate, handleMaterialGenerate)
  engine.register(EventType.ConveyorExit, handleConveyorExit)
  engine.register(EventType.SinkReceive, handleSinkReceive)
  engine.register(EventType.TaskCreated, handleTaskCreated)
  engine.register(EventType.TaskAssigned, handleTaskAssigned)
  engine.register(EventType.AgvMoveToPickup, handleAgvMoveToPickup)
  engine.register(EventType.AgvLoad, handleAgvLoad)
  engine.register(EventType.AgvMoveToDropoff, handleAgvMoveToDropoff)
  engine.register(EventType.AgvUnload, handleAgvUnload)
  engine.register(EventType.TaskCompleted, handleTaskCompleted)
  engine.register(EventType.AgvIdle, handleAgvIdle)
  engine.register(EventType.StackerMove, handleStackerMove)
  engine.register(EventType.StackerFork, handleStackerFork)
  engine.register(EventType.Dispatch, handleDispatch)
}

export function seedInitialEvents(engine: SimulationEngine): void {
  for (const source of engine.world.sources.values()) {
    if (source.totalCount > 0) {
      engine.scheduleEvent({
        time: 0,
        type: EventType.MaterialGenerate,
        targetId: source.id,
        priority: 5,
      })
    }
  }
  for (const task of engine.world.tasks.values()) {
    engine.scheduleEvent({
      time: task.createTime,
      type: EventType.TaskCreated,
      targetId: task.id,
      priority: task.priority,
    })
  }
  for (const stacker of engine.world.stackers.values()) {
    startStackerIfIdle(engine, stacker, 0)
  }
}
