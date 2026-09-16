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
  WaitingForRoute: 'WAITING_FOR_ROUTE',
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

export const SCHEMA_VERSION = '0.2' as const

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
  /** Single-lane by default; future multi-capacity roads. */
  capacity?: number
  reservedBy?: string
  occupiedBy?: string
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

export type TaskGenerationMode = 'fixed' | 'exponential' | 'demand'

export interface DemandPeriod {
  startTime: number
  endTime: number
  tasksPerHour: number
}

export interface TaskGeneratorConfig {
  mode: TaskGenerationMode
  /** Seconds between tasks when mode = fixed. */
  interval: number
  sourceId?: string
  targetId?: string
  startTime: number
  endTime?: number
  /** Max tasks to generate (0 = unlimited until endTime). */
  maxTasks?: number
  demandProfile?: DemandPeriod[]
}

export interface SimulationConfig {
  untilTime?: number
  seed: number
  taskCount: number
  taskSourceId?: string
  taskTargetId?: string
  taskInterval: number
  taskGenerator?: TaskGeneratorConfig
  /** When true, AGV hops check TrafficManager reservations. */
  enableTraffic?: boolean
}

export interface ScenarioOverrides {
  agvCount?: number
  taskCount?: number
  taskGenerationRate?: number
  agvSpeed?: number
  stackerSpeed?: number
  seed?: number
  enableTraffic?: boolean
  taskInterval?: number
  untilTime?: number
}

export interface ScenarioDefinition {
  id: string
  name: string
  overrides: ScenarioOverrides
}

export interface ExperimentDefinition {
  id: string
  name: string
  baseProjectName?: string
  scenarios: ScenarioDefinition[]
  replications: number
  baseSeed: number
}

export interface WaitingStatistics {
  taskWaitingTime: number
  routeWaitingTime: number
  resourceWaitingTime: number
  loadingWaitingTime: number
}

export interface ResourceStatistics {
  busyTime: number
  idleTime: number
  blockedTime: number
  waitingTime: number
  faultTime: number
  utilization: number
  completedCount: number
}

export interface AgvKpi {
  id: string
  name: string
  travelDistance: number
  loadedTravelDistance: number
  emptyTravelDistance: number
  emptyTravelRatio: number
  taskCount: number
  routeWaitingTime: number
  utilization: number
}

export interface ExperimentResult {
  scenarioId: string
  scenarioName: string
  agvCount: number
  seed: number
  replication: number
  throughput: number
  averageWaitingTime: number
  averageCycleTime: number
  completedTasks: number
  agvUtilization: number
  conveyorUtilization: number
  stackerUtilization: number
  emptyTravelRatio: number
  routeWaitingTime: number
  waiting: WaitingStatistics
  simulationTime: number
  bottlenecks: Bottleneck[]
}

export interface ReplicationSummary {
  scenarioId: string
  scenarioName: string
  agvCount: number
  replications: number
  throughput: { mean: number; std: number; min: number; max: number }
  averageWaitingTime: { mean: number; std: number; min: number; max: number }
  averageCycleTime: { mean: number; std: number; min: number; max: number }
  agvUtilization: { mean: number; std: number; min: number; max: number }
  routeWaitingTime: { mean: number; std: number; min: number; max: number }
  emptyTravelRatio: { mean: number; std: number; min: number; max: number }
  completedTasks: { mean: number; std: number; min: number; max: number }
  results: ExperimentResult[]
}

export interface ScenarioDelta {
  fromScenarioId: string
  toScenarioId: string
  fromAgvCount: number
  toAgvCount: number
  throughputDeltaPct: number
  averageWaitingDeltaPct: number
  agvUtilizationDeltaPct: number
  routeWaitingDeltaPct: number
}

export interface ProjectDocument {
  schemaVersion?: string
  project: {
    name: string
    version: number
  }
  devices: PlacedDevice[]
  nodes: PathGraphNode[]
  edges: ProjectEdge[]
  tasks: TransportTask[]
  simulationConfig: SimulationConfig
  scenarios?: ScenarioDefinition[]
  experiment?: ExperimentDefinition
}

export interface AgvComparisonRow {
  agvCount: number
  throughput: number
  utilization: number
  averageWaitingTime: number
  averageCycleTime: number
  completedTasks: number
  simulationTime: number
  emptyTravelRatio?: number
  routeWaitingTime?: number
  taskCount?: number
  scenarioHash?: string
  seed?: number
}

export interface Bottleneck {
  id: string
  name: string
  reason: string
  utilization?: number
  averageQueueLength?: number
  routeWaitingTime?: number
  kind?: 'resource' | 'intersection' | 'edge' | 'queue'
}

export interface ResourceStats {
  id: string
  name: string
  type: string
  busyTime: number
  idleTime: number
  blockedTime: number
  waitingTime: number
  faultTime: number
  utilization: number
  averageQueueLength: number
  completedCount: number
}

export interface StatisticsSnapshot {
  /** @deprecated Prefer agvTaskThroughput / materialThroughput — was max(tasks, materials)/hour. */
  throughput: number
  /** Completed AGV transport tasks per hour over [0, simulationTime]. */
  agvTaskThroughput: number
  /** Completed materials per hour over [0, simulationTime]. */
  materialThroughput: number
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
  waiting: WaitingStatistics
  emptyTravelRatio: number
  routeWaitingTime: number
  agvKpis: AgvKpi[]
  resources: ResourceStats[]
  bottlenecks: Bottleneck[]
}

export interface SimulationLogEntry {
  id: string
  simulationTime: number
  entityId: string
  entityType: string
  eventType: string
  message: string
}

export interface TimelineSegment {
  status: string
  startTime: number
  endTime: number
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
  timeline?: TimelineSegment[]
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
  eventLog: SimulationLogEntry[]
}
