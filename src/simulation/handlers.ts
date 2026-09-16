import { AgvStatus, TaskStatus } from '../types/index.ts'
import { astar } from '../routing/Graph.ts'
import { nextId } from '../utils/id.ts'
import { EventType } from './SimulationEvent.ts'
import type { SimulationEvent } from './SimulationEvent.ts'
import type { SimulationEngine } from './SimulationEngine.ts'
import { createMaterial } from './SimulationWorld.ts'
import { markAgvStatus, markConveyorOccupancy, markStackerBusy } from '../statistics/StatisticsEngine.ts'
import type { AgvRuntime, ConveyorRuntime, MaterialRuntime, StackerJob, StackerRuntime } from './runtimeTypes.ts'
import { createTransportTask } from './DemandProfile.ts'

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
  engine.world.resourceWaitingTotal += material.waitingTime
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
    const task = engine.world.tasks.get(assignment.taskId)
    const agv = engine.world.agvs.get(assignment.agvId)
    if (!task || !agv || task.status !== TaskStatus.Waiting || agv.status !== AgvStatus.Idle) {
      continue
    }
    // Lock immediately so concurrent dispatches cannot double-assign.
    task.status = TaskStatus.Assigned
    task.agvId = agv.id
    markAgvStatus(agv, time, AgvStatus.Assigned)
    agv.currentTaskId = task.id
    engine.scheduleEvent({
      time,
      type: EventType.TaskAssigned,
      targetId: assignment.taskId,
      priority: 1,
      payload: {
        agvId: assignment.agvId,
        path: assignment.pathToPickup,
      },
    })
  }
}

function placeAgvAt(agv: AgvRuntime, nodeId: string, engine: SimulationEngine): void {
  agv.nodeId = nodeId
  const node = engine.world.graph.getNode(nodeId)
  if (node) {
    agv.x = node.x
    agv.y = node.y
  }
}

function hopTravelTime(engine: SimulationEngine, agv: AgvRuntime, from: string, to: string): number {
  const edge = engine.world.graph.findEdge(from, to)
  if (edge) {
    const velocity = Math.max(0.0001, Math.min(agv.speed, edge.maxSpeed))
    return edge.distance / velocity
  }
  return 0.001
}

function hopDistance(engine: SimulationEngine, from: string, to: string): number {
  const edge = engine.world.graph.findEdge(from, to)
  return edge?.distance ?? 0
}

function beginRoute(
  engine: SimulationEngine,
  agv: AgvRuntime,
  path: string[],
  kind: 'pickup' | 'dropoff',
  taskId: string,
  time: number,
): void {
  agv.path = path
  agv.pathIndex = 0
  agv.routeKind = kind
  agv.routeGoal = path[path.length - 1]
  agv.currentTaskId = taskId
  placeAgvAt(agv, path[0] ?? agv.nodeId, engine)
  markAgvStatus(agv, time, kind === 'pickup' ? AgvStatus.MovingToPickup : AgvStatus.MovingToDropoff)
  engine.scheduleEvent({
    time,
    type: EventType.AgvAdvanceHop,
    targetId: agv.id,
    priority: 2,
    payload: { taskId },
  })
}

function wakeWaiters(engine: SimulationEngine, resourceType: 'node' | 'edge', resourceId: string, time: number): void {
  const agvId = engine.traffic.dequeueReady(resourceType, resourceId, time)
  if (!agvId) {
    return
  }
  engine.scheduleEvent({
    time,
    type: EventType.AgvRouteAvailable,
    targetId: agvId,
    priority: 1,
    payload: { resourceType, resourceId },
  })
}

function finishRouteLeg(engine: SimulationEngine, agv: AgvRuntime, taskId: string, time: number): void {
  const task = engine.world.tasks.get(taskId)
  if (!task) {
    return
  }
  if (agv.routeKind === 'pickup') {
    placeAgvAt(agv, task.sourceId, engine)
    markAgvStatus(agv, time, AgvStatus.Loading)
    task.status = TaskStatus.Running
    engine.world.record(time, agv.id, 'agv', EventType.AgvMoveToPickup, `${agv.name} arrived ${task.sourceId}`)
    engine.scheduleEvent({
      time: time + agv.loadTime,
      type: EventType.AgvLoad,
      targetId: agv.id,
      payload: { taskId: task.id },
    })
    return
  }
  placeAgvAt(agv, task.targetId, engine)
  markAgvStatus(agv, time, AgvStatus.Unloading)
  engine.world.record(time, agv.id, 'agv', EventType.AgvMoveToDropoff, `${agv.name} arrived ${task.targetId}`)
  engine.scheduleEvent({
    time: time + agv.unloadTime,
    type: EventType.AgvUnload,
    targetId: agv.id,
    payload: { taskId: task.id },
  })
}

function tryAdvanceHop(engine: SimulationEngine, agv: AgvRuntime, taskId: string, time: number): void {
  const path = agv.path
  if (path.length === 0 || agv.pathIndex >= path.length - 1) {
    finishRouteLeg(engine, agv, taskId, time)
    return
  }

  const from = path[agv.pathIndex]
  const to = path[agv.pathIndex + 1]
  if (!from || !to) {
    finishRouteLeg(engine, agv, taskId, time)
    return
  }

  const edge = engine.world.graph.findEdge(from, to)
  const edgeId = edge?.id ?? `${from}->${to}`
  const trafficEnabled = engine.project.simulationConfig.enableTraffic !== false

  if (trafficEnabled) {
    const canEdge = engine.traffic.canEnterEdge(agv.id, edgeId, time)
    const canNode = engine.traffic.canEnterNode(agv.id, to, time)
    if (!canEdge || !canNode) {
      const resourceType = !canEdge ? 'edge' : 'node'
      const resourceId = !canEdge ? edgeId : to
      if (agv.status !== AgvStatus.WaitingForRoute) {
        markAgvStatus(agv, time, AgvStatus.WaitingForRoute)
        agv.routeWaitStart = time
        engine.world.record(
          time,
          agv.id,
          'agv',
          'EDGE_BLOCKED',
          `${agv.name} waiting ${resourceType} ${resourceId}`,
        )
      }
      engine.traffic.enqueueWaiter({
        agvId: agv.id,
        resourceType,
        resourceId,
        since: time,
      })
      agv.pendingEdgeId = edgeId
      agv.pendingNodeId = to
      return
    }

    engine.traffic.reserveEdge(agv.id, edgeId, time)
    engine.traffic.reserveNode(agv.id, to, time)
  }

  if (agv.status === AgvStatus.WaitingForRoute) {
    const waited = agv.routeWaitStart !== undefined ? time - agv.routeWaitStart : 0
    agv.routeWaitingTime += waited
    engine.world.routeWaitingTotal += waited
    agv.routeWaitStart = undefined
    markAgvStatus(
      agv,
      time,
      agv.routeKind === 'pickup' ? AgvStatus.MovingToPickup : AgvStatus.MovingToDropoff,
    )
    engine.world.record(time, agv.id, 'agv', 'EDGE_AVAILABLE', `${agv.name} moving`)
  } else {
    markAgvStatus(
      agv,
      time,
      agv.routeKind === 'pickup' ? AgvStatus.MovingToPickup : AgvStatus.MovingToDropoff,
    )
  }

  const travel = hopTravelTime(engine, agv, from, to)
  const dist = hopDistance(engine, from, to)
  agv.travelDistance += dist
  if (agv.routeKind === 'dropoff') {
    agv.loadedTravelDistance += dist
  } else {
    agv.emptyTravelDistance += dist
  }
  agv.pendingEdgeId = edgeId
  agv.pendingNodeId = to
  agv.moveStartTime = time
  agv.moveEndTime = time + travel
  engine.scheduleEvent({
    time: time + travel,
    type: EventType.AgvArriveHop,
    targetId: agv.id,
    payload: { taskId, from, to, edgeId },
  })
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
  engine.world.record(time, source.id, 'source', EventType.MaterialGenerate, `${source.name} generated ${material.id}`)
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
  conveyor.completedCount += 1
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
  engine.world.record(event.time, sink.id, 'sink', EventType.SinkReceive, `${sink.name} received ${material.id}`)
}

function handleTaskCreated(event: SimulationEvent, engine: SimulationEngine): void {
  const task = event.targetId ? engine.world.tasks.get(event.targetId) : undefined
  if (!task) {
    return
  }
  // Eager dispatch from an earlier TaskCreated may already have assigned this task.
  if (
    task.status === TaskStatus.Assigned ||
    task.status === TaskStatus.Running ||
    task.status === TaskStatus.Completed
  ) {
    return
  }
  task.status = TaskStatus.Waiting
  task.createTime = event.time
  engine.world.sampleQueue(event.time)
  engine.world.record(event.time, task.id, 'task', EventType.TaskCreated, `${task.id} created`)
  dispatchAgvs(engine)
}

function handleTaskGenerate(event: SimulationEvent, engine: SimulationEngine): void {
  const config = engine.project.simulationConfig.taskGenerator
  if (!config) {
    return
  }
  const sourceId = config.sourceId ?? engine.project.simulationConfig.taskSourceId
  const targetId = config.targetId ?? engine.project.simulationConfig.taskTargetId
  if (!sourceId || !targetId) {
    return
  }
  const maxTasks = config.maxTasks ?? engine.project.simulationConfig.taskCount
  if (maxTasks > 0 && engine.world.dynamicTasksCreated >= maxTasks) {
    return
  }
  if (config.endTime !== undefined && event.time > config.endTime) {
    return
  }

  const task = createTransportTask({
    createTime: event.time,
    sourceId,
    targetId,
    priority: engine.world.dynamicTasksCreated + 1,
  })
  engine.world.tasks.set(task.id, { ...task })
  engine.world.dynamicTasksCreated += 1
  engine.scheduleEvent({
    time: event.time,
    type: EventType.TaskCreated,
    targetId: task.id,
    priority: task.priority,
  })

  const delay = engine.taskGenerator.nextArrivalDelay(config, event.time)
  if (delay === undefined) {
    return
  }
  if (maxTasks > 0 && engine.world.dynamicTasksCreated >= maxTasks) {
    return
  }
  engine.scheduleEvent({
    time: event.time + delay,
    type: EventType.TaskGenerate,
    priority: 5,
  })
}

function handleTaskAssigned(event: SimulationEvent, engine: SimulationEngine): void {
  const task = event.targetId ? engine.world.tasks.get(event.targetId) : undefined
  const agvId = stringField(event.payload, 'agvId')
  if (!task || !agvId) {
    return
  }
  const agv = engine.world.agvs.get(agvId)
  if (!agv) {
    return
  }
  // Ignore stale duplicate assignment events.
  if (task.agvId && task.agvId !== agv.id) {
    return
  }
  if (task.status === TaskStatus.Completed || task.status === TaskStatus.Running) {
    return
  }
  const time = event.time
  task.status = TaskStatus.Assigned
  task.assignTime = time
  task.startTime = time
  task.agvId = agv.id
  agv.currentTaskId = task.id
  agv.taskCount += 1
  if (agv.status !== AgvStatus.Assigned) {
    markAgvStatus(agv, time, AgvStatus.Assigned)
  }
  engine.world.taskWaitingTotal += time - task.createTime
  engine.world.record(time, task.id, 'task', EventType.TaskAssigned, `${task.id} assigned ${agv.name}`)

  const route = astar(engine.world.graph, agv.nodeId, task.sourceId)
  const path = route?.path ?? [agv.nodeId, task.sourceId]
  beginRoute(engine, agv, path, 'pickup', task.id, time)
}

function handleAgvAdvanceHop(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  if (!agv || !taskId) {
    return
  }
  tryAdvanceHop(engine, agv, taskId, event.time)
}

function handleAgvArriveHop(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  const from = stringField(event.payload, 'from')
  const to = stringField(event.payload, 'to')
  const edgeId = stringField(event.payload, 'edgeId')
  if (!agv || !taskId || !to) {
    return
  }
  const time = event.time
  const trafficEnabled = engine.project.simulationConfig.enableTraffic !== false

  if (trafficEnabled) {
    if (from) {
      engine.traffic.releaseNode(agv.id, from, time)
      wakeWaiters(engine, 'node', from, time)
    }
    if (edgeId) {
      engine.traffic.releaseEdge(agv.id, edgeId, time)
      wakeWaiters(engine, 'edge', edgeId, time)
      engine.world.record(time, edgeId, 'edge', 'EDGE_RELEASED', `Edge ${edgeId} released`)
    }
  }

  placeAgvAt(agv, to, engine)
  agv.pathIndex += 1
  agv.pendingEdgeId = undefined
  tryAdvanceHop(engine, agv, taskId, time)
}

function handleAgvRouteAvailable(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  if (!agv || !agv.currentTaskId) {
    return
  }
  if (agv.status !== AgvStatus.WaitingForRoute) {
    return
  }
  engine.scheduleEvent({
    time: event.time,
    type: EventType.AgvAdvanceHop,
    targetId: agv.id,
    priority: 2,
    payload: { taskId: agv.currentTaskId },
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
  engine.world.loadingWaitingTotal += agv.loadTime
  const route = astar(engine.world.graph, task.sourceId, task.targetId)
  const path = route?.path ?? [task.sourceId, task.targetId]
  beginRoute(engine, agv, path, 'dropoff', task.id, event.time)
}

function handleAgvUnload(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  const taskId = stringField(event.payload, 'taskId')
  if (!agv || !taskId) {
    return
  }
  engine.world.loadingWaitingTotal += agv.unloadTime
  if (engine.project.simulationConfig.enableTraffic !== false) {
    engine.traffic.releaseNode(agv.id, agv.nodeId, event.time)
    wakeWaiters(engine, 'node', agv.nodeId, event.time)
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
  const taskWait = (task.assignTime ?? event.time) - task.createTime
  engine.world.waitingTimeTotal += taskWait
  engine.world.completedWaitSamples += 1
  const agv = task.agvId ? engine.world.agvs.get(task.agvId) : undefined
  if (agv) {
    agv.completedCount += 1
  }
  engine.world.record(event.time, task.id, 'task', EventType.TaskCompleted, `Task ${task.id} completed`)
}

function handleAgvIdle(event: SimulationEvent, engine: SimulationEngine): void {
  const agv = event.targetId ? engine.world.agvs.get(event.targetId) : undefined
  if (!agv) {
    return
  }
  agv.currentTaskId = undefined
  agv.path = []
  agv.pathIndex = 0
  agv.routeKind = undefined
  agv.routeGoal = undefined
  agv.moveStartTime = undefined
  agv.moveEndTime = undefined
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
  stacker.completedCount += 1
  markStackerBusy(stacker, event.time, false)
  engine.world.completedCount += 1
  engine.world.record(
    event.time,
    stacker.id,
    'stacker',
    EventType.StackerFork,
    `${stacker.name} finished ${job.kind} at C${job.column} L${job.level}`,
  )
  startStackerIfIdle(engine, stacker, event.time)
}

function handleDispatch(event: SimulationEvent, engine: SimulationEngine): void {
  void event
  dispatchAgvs(engine)
}

// Keep legacy event names registered for completed hop legs when path is empty.
function handleAgvMoveToPickup(event: SimulationEvent, engine: SimulationEngine): void {
  handleAgvAdvanceHop(event, engine)
}

function handleAgvMoveToDropoff(event: SimulationEvent, engine: SimulationEngine): void {
  handleAgvAdvanceHop(event, engine)
}

export function registerHandlers(engine: SimulationEngine): void {
  engine.register(EventType.MaterialGenerate, handleMaterialGenerate)
  engine.register(EventType.ConveyorExit, handleConveyorExit)
  engine.register(EventType.SinkReceive, handleSinkReceive)
  engine.register(EventType.TaskCreated, handleTaskCreated)
  engine.register(EventType.TaskGenerate, handleTaskGenerate)
  engine.register(EventType.TaskAssigned, handleTaskAssigned)
  engine.register(EventType.AgvMoveToPickup, handleAgvMoveToPickup)
  engine.register(EventType.AgvLoad, handleAgvLoad)
  engine.register(EventType.AgvMoveToDropoff, handleAgvMoveToDropoff)
  engine.register(EventType.AgvUnload, handleAgvUnload)
  engine.register(EventType.AgvAdvanceHop, handleAgvAdvanceHop)
  engine.register(EventType.AgvArriveHop, handleAgvArriveHop)
  engine.register(EventType.AgvRouteAvailable, handleAgvRouteAvailable)
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

  const plan = engine.taskGenerator.plan(engine.project)
  if (plan.dynamic) {
    const config = engine.project.simulationConfig.taskGenerator
    if (config) {
      const start = config.startTime ?? 0
      engine.scheduleEvent({
        time: start,
        type: EventType.TaskGenerate,
        priority: 5,
      })
    }
  } else {
    for (const task of plan.tasks) {
      engine.world.tasks.set(task.id, { ...task })
      engine.scheduleEvent({
        time: task.createTime,
        type: EventType.TaskCreated,
        targetId: task.id,
        priority: task.priority,
      })
    }
  }

  // Also seed any pre-existing tasks already in the world that weren't regenerated.
  if (!plan.dynamic && plan.tasks.length === 0) {
    for (const task of engine.world.tasks.values()) {
      engine.scheduleEvent({
        time: task.createTime,
        type: EventType.TaskCreated,
        targetId: task.id,
        priority: task.priority,
      })
    }
  }

  for (const stacker of engine.world.stackers.values()) {
    startStackerIfIdle(engine, stacker, 0)
  }

  // Reserve initial AGV positions on nodes.
  if (engine.project.simulationConfig.enableTraffic !== false) {
    for (const agv of engine.world.agvs.values()) {
      engine.traffic.reserveNode(agv.id, agv.nodeId, 0)
    }
  }
}
