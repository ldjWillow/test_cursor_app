import { AgvStatus, DeviceType, TaskStatus } from '../types/index.ts'
import type {
  AgvParams,
  ConveyorParams,
  PlacedDevice,
  ProjectDocument,
  RackParams,
  SinkParams,
  SourceParams,
  StackerParams,
  StationParams,
} from '../types/index.ts'
import { Graph } from '../routing/Graph.ts'
import { nextId } from '../utils/id.ts'
import { distance } from '../utils/math.ts'
import { SimulationLogger } from './SimulationLogger.ts'
import type {
  AgvRuntime,
  ConveyorRuntime,
  MaterialRuntime,
  RackRuntime,
  SinkRuntime,
  SourceRuntime,
  StackerRuntime,
  StationRuntime,
  TaskRuntime,
} from './runtimeTypes.ts'

export class SimulationWorld {
  readonly sources = new Map<string, SourceRuntime>()
  readonly conveyors = new Map<string, ConveyorRuntime>()
  readonly sinks = new Map<string, SinkRuntime>()
  readonly stations = new Map<string, StationRuntime>()
  readonly agvs = new Map<string, AgvRuntime>()
  readonly racks = new Map<string, RackRuntime>()
  readonly stackers = new Map<string, StackerRuntime>()
  readonly materials = new Map<string, MaterialRuntime>()
  readonly tasks = new Map<string, TaskRuntime>()
  readonly flowDownstream = new Map<string, string[]>()
  graph: Graph = new Graph()
  logger = new SimulationLogger()
  logs: string[] = []
  generatedCount = 0
  completedCount = 0
  completedTasks = 0
  failedTasks = 0
  waitingTimeTotal = 0
  cycleTimeTotal = 0
  completedWaitSamples = 0
  taskWaitingTotal = 0
  routeWaitingTotal = 0
  resourceWaitingTotal = 0
  loadingWaitingTotal = 0
  dynamicTasksCreated = 0
  queueIntegral = 0
  lastQueueSampleTime = 0
  lastQueueLength = 0

  log(time: number, message: string): void {
    this.logs.push(`[t=${time.toFixed(2)}] ${message}`)
    if (this.logs.length > 80) {
      this.logs.shift()
    }
  }

  record(
    time: number,
    entityId: string,
    entityType: string,
    eventType: string,
    message: string,
  ): void {
    this.logger.log(time, entityId, entityType, eventType, message)
    this.log(time, message)
  }

  waitingTaskList(): TaskRuntime[] {
    return [...this.tasks.values()]
      .filter((task) => task.status === TaskStatus.Waiting)
      .sort((a, b) => a.priority - b.priority || a.createTime - b.createTime || a.id.localeCompare(b.id))
  }

  runningTaskCount(): number {
    return [...this.tasks.values()].filter(
      (task) => task.status === TaskStatus.Assigned || task.status === TaskStatus.Running,
    ).length
  }

  sampleQueue(time: number, extraWaiting = 0): void {
    const waiting =
      extraWaiting +
      [...this.sources.values()].reduce((sum, source) => sum + source.waiting.length, 0) +
      [...this.conveyors.values()].reduce((sum, conveyor) => sum + conveyor.waiting.length, 0) +
      this.waitingTaskList().length
    this.queueIntegral += this.lastQueueLength * Math.max(0, time - this.lastQueueSampleTime)
    this.lastQueueSampleTime = time
    this.lastQueueLength = waiting
  }

  averageQueueLength(now: number): number {
    this.sampleQueue(now)
    if (now <= 0) {
      return this.lastQueueLength
    }
    return this.queueIntegral / now
  }
}

function asSource(device: PlacedDevice): SourceParams {
  return device.params as SourceParams
}

function asConveyor(device: PlacedDevice): ConveyorParams {
  return device.params as ConveyorParams
}

function asSink(device: PlacedDevice): SinkParams {
  return device.params as SinkParams
}

function asStation(device: PlacedDevice): StationParams {
  return device.params as StationParams
}

function asAgv(device: PlacedDevice): AgvParams {
  return device.params as AgvParams
}

function asRack(device: PlacedDevice): RackParams {
  return device.params as RackParams
}

function asStacker(device: PlacedDevice): StackerParams {
  return device.params as StackerParams
}

function nearestNodeId(world: SimulationWorld, x: number, y: number, fallback: string): string {
  let bestId = fallback
  let best = Number.POSITIVE_INFINITY
  for (const node of world.graph.getNodes()) {
    const d = distance(x, y, node.x, node.y)
    if (d < best) {
      best = d
      bestId = node.id
    }
  }
  return bestId
}

export function buildWorld(project: ProjectDocument): SimulationWorld {
  const world = new SimulationWorld()
  const pathNodes = [
    ...project.nodes,
    ...project.devices
      .filter((device) =>
        device.type === DeviceType.Station ||
        device.type === DeviceType.PathNode ||
        device.type === DeviceType.Charger ||
        device.type === DeviceType.Rack ||
        device.type === DeviceType.Stacker,
      )
      .map((device) => ({ id: device.id, x: device.x, y: device.y, label: device.name })),
  ]
  world.graph = Graph.fromProject(pathNodes, project.edges)

  for (const device of project.devices) {
    const downstream = project.edges
      .filter((edge) => edge.kind === 'flow' && edge.from === device.id)
      .map((edge) => edge.to)

    if (device.type === DeviceType.Source) {
      const params = asSource(device)
      world.sources.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Source,
        generationInterval: params.generationInterval,
        totalCount: params.totalCount,
        generatedCount: 0,
        waiting: [],
        downstreamIds: downstream,
        x: device.x,
        y: device.y,
      })
    }

    if (device.type === DeviceType.Conveyor) {
      const params = asConveyor(device)
      world.conveyors.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Conveyor,
        length: params.length,
        speed: Math.max(0.0001, params.speed),
        capacity: Math.max(1, params.capacity),
        occupancy: [],
        waiting: [],
        downstreamIds: downstream,
        busyTime: 0,
        idleTime: 0,
        blockedTime: 0,
        waitingTime: 0,
        faultTime: 0,
        completedCount: 0,
        lastChangeTime: 0,
        occupancyIntegral: 0,
        x: device.x,
        y: device.y,
      })
    }

    if (device.type === DeviceType.Sink) {
      asSink(device)
      world.sinks.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Sink,
        received: 0,
        downstreamIds: downstream,
        x: device.x,
        y: device.y,
      })
    }

    if (device.type === DeviceType.Station) {
      const params = asStation(device)
      world.stations.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Station,
        processTime: params.processTime,
        capacity: params.capacity,
        queue: [],
        x: device.x,
        y: device.y,
        nodeId: device.id,
      })
    }

    if (device.type === DeviceType.Agv) {
      const params = asAgv(device)
      const nodeId = nearestNodeId(world, device.x, device.y, device.id)
      const node = world.graph.getNode(nodeId)
      world.agvs.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Agv,
        status: AgvStatus.Idle,
        speed: Math.max(0.0001, params.speed),
        capacity: params.capacity,
        loadTime: params.loadTime,
        unloadTime: params.unloadTime,
        batteryCapacity: params.batteryCapacity,
        currentBattery: params.currentBattery,
        chargeThreshold: params.chargeThreshold,
        nodeId,
        x: node?.x ?? device.x,
        y: node?.y ?? device.y,
        path: [],
        pathIndex: 0,
        busyTime: 0,
        idleTime: 0,
        blockedTime: 0,
        waitingTime: 0,
        faultTime: 0,
        routeWaitingTime: 0,
        travelDistance: 0,
        loadedTravelDistance: 0,
        emptyTravelDistance: 0,
        taskCount: 0,
        completedCount: 0,
        lastStatusChange: 0,
        timeline: [{ status: AgvStatus.Idle, startTime: 0, endTime: 0 }],
      })
    }

    if (device.type === DeviceType.Rack) {
      const params = asRack(device)
      const locations = []
      for (let row = 0; row < params.rows; row += 1) {
        for (let column = 0; column < params.columns; column += 1) {
          for (let level = 0; level < params.levels; level += 1) {
            locations.push({ row, column, level, occupied: false })
          }
        }
      }
      world.racks.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Rack,
        rows: params.rows,
        columns: params.columns,
        levels: params.levels,
        locations,
        x: device.x,
        y: device.y,
        nodeId: device.id,
      })
    }

    if (device.type === DeviceType.Stacker) {
      const params = asStacker(device)
      const rackId = downstream.find((id) => world.racks.has(id)) ??
        [...world.racks.values()][0]?.id
      world.stackers.set(device.id, {
        id: device.id,
        name: device.name,
        type: DeviceType.Stacker,
        horizontalSpeed: Math.max(0.0001, params.horizontalSpeed),
        verticalSpeed: Math.max(0.0001, params.verticalSpeed),
        forkTime: params.forkTime,
        bayWidth: params.bayWidth,
        levelHeight: params.levelHeight,
        rackId,
        currentColumn: 0,
        currentLevel: 0,
        queue: [],
        busy: false,
        busyTime: 0,
        idleTime: 0,
        blockedTime: 0,
        waitingTime: 0,
        faultTime: 0,
        completedCount: 0,
        lastStatusChange: 0,
        x: device.x,
        y: device.y,
        nodeId: device.id,
      })
    }
  }

  for (const task of project.tasks) {
    world.tasks.set(task.id, { ...task })
  }

  return world
}

export function createMaterial(world: SimulationWorld, time: number, locationId: string): MaterialRuntime {
  const material: MaterialRuntime = {
    id: nextId('mat'),
    createdTime: time,
    waitingTime: 0,
    locationId,
  }
  world.materials.set(material.id, material)
  world.generatedCount += 1
  return material
}
