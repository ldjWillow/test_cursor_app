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
import { NoOpTrafficManager } from '../traffic/TrafficManager.ts'
import type { TrafficManager } from '../traffic/TrafficManager.ts'
import { nextId, resetIdSequence } from '../utils/id.ts'
import { EventQueue } from './EventQueue.ts'
import { SimulationClock } from './SimulationClock.ts'
import type { SimulationEvent } from './SimulationEvent.ts'
import { buildWorld, SimulationWorld } from './SimulationWorld.ts'
import { registerHandlers, seedInitialEvents } from './handlers.ts'

export type EventHandler = (event: SimulationEvent, engine: SimulationEngine) => void

const MAX_EVENTS = 2_000_000

export class SimulationEngine {
  readonly clock = new SimulationClock()
  readonly queue = new EventQueue()
  readonly stats = new StatisticsEngine()
  readonly scheduler = new AgvScheduler()
  readonly traffic: TrafficManager
  world: SimulationWorld
  status: SimStatus = SimulationStatus.Idle
  private readonly handlers = new Map<string, EventHandler>()
  private processed = 0

  constructor(
    readonly project: ProjectDocument,
    traffic: TrafficManager = new NoOpTrafficManager(),
  ) {
    this.traffic = traffic
    this.world = buildWorld(project)
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
    this.world = buildWorld(this.project)
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
    while (this.runNextEvent()) {
      // Drain the event calendar.
    }
    this.status = SimulationStatus.Completed
  }

  getCurrentTime(): number {
    return this.clock.current
  }

  getState(): SimulationSnapshot {
    const now = this.clock.current
    const statistics = this.stats.snapshot(this.world, now)
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
    }
  }

  private boot(): void {
    seedInitialEvents(this)
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
        agv.moveEndTime > agv.moveStartTime
      ) {
        const progress = (now - agv.moveStartTime) / (agv.moveEndTime - agv.moveStartTime)
        const point = interpolatePath(this.world.graph, agv.path, progress)
        if (point) {
          x = point.x
          y = point.y
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
        status: stacker.busy ? 'busy' : 'idle',
        occupancy: stacker.busy ? 1 : 0,
        queueLength: stacker.queue.length,
        x: stacker.x,
        y: stacker.y,
      })
    }
    return views
  }
}

export function createEngine(project: ProjectDocument): SimulationEngine {
  resetIdSequence()
  return new SimulationEngine(project)
}
