export const DeviceType = {
  Source: 'source',
  Sink: 'sink',
  Station: 'station',
  Conveyor: 'conveyor',
  Agv: 'agv',
  Rack: 'rack',
  Stacker: 'stacker',
  Charger: 'charger',
  PathNode: 'path-node',
} as const

export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType]

export const SimulationStatus = {
  Idle: 'idle',
  Running: 'running',
  Paused: 'paused',
  Completed: 'completed',
} as const

export type SimulationStatus = (typeof SimulationStatus)[keyof typeof SimulationStatus]

export const AgvStatus = {
  Idle: 'IDLE',
  Assigned: 'ASSIGNED',
  MovingToPickup: 'MOVING_TO_PICKUP',
  Loading: 'LOADING',
  MovingToDropoff: 'MOVING_TO_DROPOFF',
  Unloading: 'UNLOADING',
  Charging: 'CHARGING',
  Fault: 'FAULT',
} as const

export type AgvStatus = (typeof AgvStatus)[keyof typeof AgvStatus]

export const TaskStatus = {
  Waiting: 'WAITING',
  Assigned: 'ASSIGNED',
  Running: 'RUNNING',
  Completed: 'COMPLETED',
  Failed: 'FAILED',
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export const EdgeKind = {
  Flow: 'flow',
  Path: 'path',
} as const

export type EdgeKind = (typeof EdgeKind)[keyof typeof EdgeKind]

export const SimulationSpeed = {
  One: 1,
  Five: 5,
  Ten: 10,
  Fifty: 50,
} as const

export type SimulationSpeed = (typeof SimulationSpeed)[keyof typeof SimulationSpeed]

export interface SourceParams {
  generationInterval: number
  totalCount: number
}

export interface SinkParams {
  capacity: number
}

export interface StationParams {
  processTime: number
  capacity: number
}

export interface ConveyorParams {
  length: number
  speed: number
  capacity: number
}

export interface AgvParams {
  speed: number
  capacity: number
  loadTime: number
  unloadTime: number
  batteryCapacity: number
  currentBattery: number
  chargeThreshold: number
}

export interface RackParams {
  rows: number
  columns: number
  levels: number
}

export interface StackerParams {
  horizontalSpeed: number
  verticalSpeed: number
  forkTime: number
  bayWidth: number
  levelHeight: number
}

export interface ChargerParams {
  chargeRate: number
}

export interface PathNodeParams {
  label: string
}

export type DeviceParams =
  | SourceParams
  | SinkParams
  | StationParams
  | ConveyorParams
  | AgvParams
  | RackParams
  | StackerParams
  | ChargerParams
  | PathNodeParams

export interface PlacedDevice {
  id: string
  type: DeviceType
  name: string
  x: number
  y: number
  params: DeviceParams
}

export interface PathGraphNode {
  id: string
  x: number
  y: number
  label?: string
}

export interface ProjectEdge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  distance: number
  maxSpeed: number
  enabled: boolean
}

export interface TransportTask {
  id: string
  sourceId: string
  targetId: string
  createTime: number
  assignTime?: number
  startTime?: number
  finishTime?: number
  priority: number
  status: TaskStatus
  agvId?: string
}

export interface SimulationConfig {
  untilTime?: number
  seed: number
  taskCount: number
  taskSourceId?: string
  taskTargetId?: string
  taskInterval: number
}

export interface ProjectDocument {
  project: {
    name: string
    version: number
  }
  devices: PlacedDevice[]
  nodes: PathGraphNode[]
  edges: ProjectEdge[]
  tasks: TransportTask[]
  simulationConfig: SimulationConfig
}

export interface AgvComparisonRow {
  agvCount: number
  throughput: number
  utilization: number
  averageWaitingTime: number
  averageCycleTime: number
  completedTasks: number
  simulationTime: number
}

export interface Bottleneck {
  id: string
  name: string
  reason: string
  utilization?: number
  averageQueueLength?: number
}

export interface ResourceStats {
  id: string
  name: string
  type: string
  busyTime: number
  idleTime: number
  utilization: number
  averageQueueLength: number
}

export interface StatisticsSnapshot {
  throughput: number
  completedTasks: number
  failedTasks: number
  generatedCount: number
  completedCount: number
  averageWaitingTime: number
  averageCycleTime: number
  resourceUtilization: number
  agvUtilization: number
  conveyorUtilization: number
  stackerUtilization: number
  idleTime: number
  busyTime: number
  averageQueueLength: number
  resources: ResourceStats[]
  bottlenecks: Bottleneck[]
}

export interface RuntimeDeviceView {
  id: string
  type: DeviceType
  name: string
  status: string
  occupancy: number
  queueLength: number
  x: number
  y: number
  path?: string[]
  moveStartTime?: number
  moveEndTime?: number
}

export interface SimulationSnapshot {
  time: number
  status: SimulationStatus
  eventQueue: Array<{
    id: string
    time: number
    type: string
    targetId?: string
    priority?: number
  }>
  waitingTasks: number
  runningTasks: number
  completedTasks: number
  failedTasks: number
  devices: RuntimeDeviceView[]
  statistics: StatisticsSnapshot
  logs: string[]
}
