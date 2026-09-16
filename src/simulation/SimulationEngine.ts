import { DeviceType, SimulationStatus } from '../types/index.ts'
import type {
  ProjectDocument,
  RuntimeDeviceView,
  SimulationSnapshot,
  SimulationStatus as SimStatus,
} from '../types/index.ts'
import { AgvScheduler } from '../scheduler/AgvScheduler.ts'
import { interpolatePath } from '../routing/Graph.ts'
import { StatisticsEngine } from '../statistics/StatisticsEngine.ts'
import { NoOpTrafficManager, ReservationTrafficManager } from '../traffic/TrafficManager.ts'
import type { TrafficManager } from '../traffic/TrafficManager.ts'
import { nextId, resetIdSequence } from '../utils/id.ts'
import { RandomGenerator } from '../utils/RandomGenerator.ts'
import { EventQueue } from './EventQueue.ts'
import { SimulationClock } from './SimulationClock.ts'
import type { SimulationEvent } from './SimulationEvent.ts'
import { buildWorld, SimulationWorld } from './SimulationWorld.ts'
import { registerHandlers, seedInitialEvents } from './handlers.ts'
import { TaskGenerator } from './TaskGenerator.ts'
import { ensureSchemaVersion } from '../persistence/migrate.ts'

export type EventHandler = (event: SimulationEvent, engine: SimulationEngine) => void

const MAX_EVENTS = 5_000_000

export class SimulationEngine {
  readonly clock = new SimulationClock()
  readonly queue = new EventQueue()
  readonly stats = new StatisticsEngine()
  readonly scheduler = new AgvScheduler()
  readonly traffic: TrafficManager
  readonly random: RandomGenerator
  readonly taskGenerator: TaskGenerator
  world: SimulationWorld
  status: SimStatus = SimulationStatus.Idle
  private readonly handlers = new Map<string, EventHandler>()
  private processed = 0

  constructor(
    readonly project: ProjectDocument,
    traffic?: TrafficManager,
  ) {
    const normalized = ensureSchemaVersion(project)
    this.project = normalized
    this.random = new RandomGenerator(normalized.simulationConfig.seed)
    this.taskGenerator = new TaskGenerator(this.random)
    const enableTraffic = normalized.simulationConfig.enableTraffic !== false
    this.traffic =
      traffic ??
      (enableTraffic ? new ReservationTrafficManager() : new NoOpTrafficManager())
    this.world = buildWorld(normalized)
    this.initTrafficCapacities()
    registerHandlers(this)
    this.boot()
  }

  register(type: string, handler: EventHandler): void {
    this.handlers.set(type, handler)
  }

  start(): void {
    if (this.queue.isEmpty) {
      this.status = SimulationStatus.Completed
      return
    }
    this.status = SimulationStatus.Running
  }

  pause(): void {
    if (this.status === SimulationStatus.Running) {
      this.status = SimulationStatus.Paused
    }
  }

  reset(): void {
    resetIdSequence()
    this.clock.reset()
    this.queue.clear()
    this.processed = 0
    this.status = SimulationStatus.Idle
    this.traffic.reset()
    this.world = buildWorld(this.project)
    this.initTrafficCapacities()
    this.boot()
  }

  step(): boolean {
    return this.runNextEvent()
  }

  scheduleEvent(event: Omit<SimulationEvent, 'id'> & { id?: string }): SimulationEvent {
    const scheduled: SimulationEvent = {
      id: event.id ?? nextId('evt'),
      time: event.time,
      type: event.type,
      targetId: event.targetId,
      priority: event.priority ?? 0,
      payload: event.payload,
    }
    this.queue.enqueue(scheduled)
    return scheduled
  }

  runNextEvent(): boolean {
    const event = this.queue.dequeue()
    if (!event) {
      this.status = SimulationStatus.Completed
      return false
    }
    this.clock.advanceTo(event.time)
    this.processed += 1
    if (this.processed > MAX_EVENTS) {
      throw new Error('Simulation exceeded maximum event count; possible infinite loop')
    }
    const handler = this.handlers.get(event.type)
    if (!handler) {
      throw new Error(`No handler registered for event type ${event.type}`)
    }
    handler(event, this)
    if (this.queue.isEmpty) {
      this.status = SimulationStatus.Completed
    }
    return true
  }

  runUntil(time: number): void {
    while (this.queue.peek() && (this.queue.peek()?.time ?? Number.POSITIVE_INFINITY) <= time) {
      this.runNextEvent()
    }
    if (!this.queue.isEmpty && this.clock.current < time) {
      this.clock.advanceTo(time)
    }
    if (this.queue.isEmpty) {
      this.status = SimulationStatus.Completed
    }
  }

  runUntilEmpty(): void {
    const until = this.project.simulationConfig.untilTime
    if (until !== undefined) {
      this.runUntil(until)
      this.status = SimulationStatus.Completed
      return
    }
    while (this.runNextEvent()) {
      // Drain the event calendar.
    }
    this.status = SimulationStatus.Completed
  }

  getCurrentTime(): number {
    return this.clock.current
  }

  getProcessedEventCount(): number {
    return this.processed
  }

  getState(): SimulationSnapshot {
    const now = this.clock.current
    const statistics = this.stats.snapshot(this.world, now, this.traffic)
    return {
      time: now,
      status: this.status,
      eventQueue: this.queue.toArray().slice(0, 40).map((event) => ({
        id: event.id,
        time: event.time,
        type: event.type,
        targetId: event.targetId,
        priority: event.priority,
      })),
      waitingTasks: this.world.waitingTaskList().length,
      runningTasks: this.world.runningTaskCount(),
      completedTasks: this.world.completedTasks,
      failedTasks: this.world.failedTasks,
      devices: this.deviceViews(now),
      statistics,
      logs: [...this.world.logs],
      eventLog: this.world.logger.all(),
    }
  }

  private boot(): void {
    seedInitialEvents(this)
  }

  private initTrafficCapacities(): void {
    if (!(this.traffic instanceof ReservationTrafficManager)) {
      return
    }
    for (const edge of this.project.edges) {
      if (edge.kind === 'path') {
        this.traffic.setEdgeCapacity(edge.id, edge.capacity ?? 1)
      }
    }
    const agvCount = Math.max(1, this.world.agvs.size)
    for (const node of this.world.graph.getNodes()) {
      const device = this.project.devices.find((item) => item.id === node.id)
      // Intersections are single-occupancy; stations/racks can hold multiple AGVs.
      const isIntersection = !device || device.type === DeviceType.PathNode
      this.traffic.setNodeCapacity(node.id, isIntersection ? 1 : Math.max(4, agvCount))
    }
  }

  private deviceViews(now: number): RuntimeDeviceView[] {
    const views: RuntimeDeviceView[] = []
    for (const source of this.world.sources.values()) {
      views.push({
        id: source.id,
        type: DeviceType.Source,
        name: source.name,
        status: source.generatedCount >= source.totalCount ? 'done' : 'generating',
        occupancy: 0,
        queueLength: source.waiting.length,
        x: source.x,
        y: source.y,
      })
    }
    for (const conveyor of this.world.conveyors.values()) {
      views.push({
        id: conveyor.id,
        type: DeviceType.Conveyor,
        name: conveyor.name,
        status: conveyor.occupancy.length > 0 ? 'busy' : 'idle',
        occupancy: conveyor.occupancy.length,
        queueLength: conveyor.waiting.length,
        x: conveyor.x,
        y: conveyor.y,
      })
    }
    for (const sink of this.world.sinks.values()) {
      views.push({
        id: sink.id,
        type: DeviceType.Sink,
        name: sink.name,
        status: 'ready',
        occupancy: sink.received,
        queueLength: 0,
        x: sink.x,
        y: sink.y,
      })
    }
    for (const station of this.world.stations.values()) {
      views.push({
        id: station.id,
        type: DeviceType.Station,
        name: station.name,
        status: station.queue.length > 0 ? 'busy' : 'idle',
        occupancy: station.queue.length,
        queueLength: station.queue.length,
        x: station.x,
        y: station.y,
      })
    }
    for (const agv of this.world.agvs.values()) {
      let x = agv.x
      let y = agv.y
      if (
        agv.path.length > 0 &&
        agv.moveStartTime !== undefined &&
        agv.moveEndTime !== undefined &&
        agv.moveEndTime > agv.moveStartTime &&
        agv.pathIndex < agv.path.length - 1
      ) {
        const from = agv.path[agv.pathIndex]
        const to = agv.path[agv.pathIndex + 1]
        if (from && to) {
          const progress = (now - agv.moveStartTime) / (agv.moveEndTime - agv.moveStartTime)
          const point = interpolatePath(this.world.graph, [from, to], progress)
          if (point) {
            x = point.x
            y = point.y
          }
        }
      }
      views.push({
        id: agv.id,
        type: DeviceType.Agv,
        name: agv.name,
        status: agv.status,
        occupancy: agv.currentTaskId ? 1 : 0,
        queueLength: 0,
        x,
        y,
        path: agv.path,
        moveStartTime: agv.moveStartTime,
        moveEndTime: agv.moveEndTime,
        timeline: agv.timeline.map((segment) => ({ ...segment })),
      })
    }

    // Visual berth offsets: stack AGVs that share the same node so they remain selectable.
    const byNode = new Map<string, RuntimeDeviceView[]>()
    for (const view of views) {
      if (view.type !== DeviceType.Agv) {
        continue
      }
      const agv = this.world.agvs.get(view.id)
      const key = agv?.nodeId ?? `${Math.round(view.x)}:${Math.round(view.y)}`
      const list = byNode.get(key) ?? []
      list.push(view)
      byNode.set(key, list)
    }
    for (const group of byNode.values()) {
      if (group.length < 2) {
        continue
      }
      group.forEach((view, index) => {
        const angle = (index / group.length) * Math.PI * 2
        const radius = 14 + Math.floor(index / 6) * 10
        view.x += Math.cos(angle) * radius
        view.y += Math.sin(angle) * radius
        view.name = `${view.name} (${index + 1}/${group.length})`
      })
    }
    for (const rack of this.world.racks.values()) {
      const occupied = rack.locations.filter((location) => location.occupied).length
      views.push({
        id: rack.id,
        type: DeviceType.Rack,
        name: rack.name,
        status: `${occupied}/${rack.locations.length}`,
        occupancy: occupied,
        queueLength: 0,
        x: rack.x,
        y: rack.y,
      })
    }
    for (const stacker of this.world.stackers.values()) {
      views.push({
        id: stacker.id,
        type: DeviceType.Stacker,
        name: stacker.name,
        status: stacker.status,
        occupancy: stacker.busy ? 1 : 0,
        queueLength: stacker.queue.length + stacker.waiting.length,
        x: stacker.x,
        y: stacker.y,
      })
    }
    return views
  }
}

export function createEngine(project: ProjectDocument): SimulationEngine {
  resetIdSequence()
  return new SimulationEngine(ensureSchemaVersion(project))
}
