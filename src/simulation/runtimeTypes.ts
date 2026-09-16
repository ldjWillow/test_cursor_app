import type { AgvStatus, TaskStatus, TimelineSegment } from '../types/index.ts'

export interface MaterialRuntime {
  id: string
  createdTime: number
  waitingTime: number
  enterTime?: number
  completeTime?: number
  locationId: string
}

export interface SourceRuntime {
  id: string
  name: string
  type: 'source'
  generationInterval: number
  totalCount: number
  generatedCount: number
  waiting: string[]
  downstreamIds: string[]
  x: number
  y: number
}

export interface ConveyorRuntime {
  id: string
  name: string
  type: 'conveyor'
  length: number
  speed: number
  capacity: number
  occupancy: Array<{ materialId: string; enterTime: number; exitTime: number }>
  waiting: string[]
  downstreamIds: string[]
  busyTime: number
  idleTime: number
  blockedTime: number
  waitingTime: number
  faultTime: number
  completedCount: number
  lastChangeTime: number
  occupancyIntegral: number
  x: number
  y: number
}

export interface SinkRuntime {
  id: string
  name: string
  type: 'sink'
  received: number
  downstreamIds: string[]
  x: number
  y: number
}

export interface StationRuntime {
  id: string
  name: string
  type: 'station'
  processTime: number
  capacity: number
  queue: string[]
  x: number
  y: number
  nodeId: string
}

export interface AgvRuntime {
  id: string
  name: string
  type: 'agv'
  status: AgvStatus
  speed: number
  capacity: number
  loadTime: number
  unloadTime: number
  batteryCapacity: number
  currentBattery: number
  chargeThreshold: number
  nodeId: string
  x: number
  y: number
  currentTaskId?: string
  path: string[]
  /** Index of current node within path (AGV is at path[pathIndex]). */
  pathIndex: number
  /** Remaining path goal for current leg. */
  routeGoal?: string
  /** Pickup or dropoff leg. */
  routeKind?: 'pickup' | 'dropoff'
  pendingEdgeId?: string
  pendingNodeId?: string
  moveStartTime?: number
  moveEndTime?: number
  busyTime: number
  idleTime: number
  blockedTime: number
  waitingTime: number
  faultTime: number
  routeWaitingTime: number
  routeWaitStart?: number
  travelDistance: number
  loadedTravelDistance: number
  emptyTravelDistance: number
  taskCount: number
  completedCount: number
  lastStatusChange: number
  timeline: TimelineSegment[]
}

export interface RackLocationRuntime {
  row: number
  column: number
  level: number
  occupied: boolean
  sku?: string
}

export interface RackRuntime {
  id: string
  name: string
  type: 'rack'
  rows: number
  columns: number
  levels: number
  locations: RackLocationRuntime[]
  x: number
  y: number
  nodeId: string
}

export const StackerStatus = {
  Idle: 'idle',
  Queued: 'queued',
  Moving: 'moving',
  Picking: 'picking',
  Dropping: 'dropping',
} as const

export type StackerStatus = (typeof StackerStatus)[keyof typeof StackerStatus]

export interface StackerRuntime {
  id: string
  name: string
  type: 'stacker'
  horizontalSpeed: number
  verticalSpeed: number
  forkTime: number
  bayWidth: number
  levelHeight: number
  rackId?: string
  /** Enabled flow out-edges (sink / conveyor / rack). */
  downstreamIds: string[]
  currentColumn: number
  currentLevel: number
  queue: StackerJob[]
  /** Material ids waiting because no free rack slot / downstream. */
  waiting: string[]
  activeJobId?: string
  busy: boolean
  status: StackerStatus
  busyTime: number
  idleTime: number
  blockedTime: number
  waitingTime: number
  faultTime: number
  completedCount: number
  lastStatusChange: number
  x: number
  y: number
  nodeId: string
}

export interface StackerJob {
  id: string
  kind: 'inbound' | 'outbound' | 'transfer'
  materialId: string
  /** Pickup bay coordinates (I/O). */
  pickColumn: number
  pickLevel: number
  /** Drop bay coordinates (rack slot or transfer bay). */
  column: number
  level: number
  createdTime: number
  phase: 'to_pick' | 'picking' | 'to_drop' | 'dropping' | 'complete'
}

export interface TaskRuntime {
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
