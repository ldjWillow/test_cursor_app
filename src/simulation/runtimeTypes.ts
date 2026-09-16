import type { AgvStatus, TaskStatus } from '../types/index.ts'

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
  moveStartTime?: number
  moveEndTime?: number
  busyTime: number
  idleTime: number
  lastStatusChange: number
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
  currentColumn: number
  currentLevel: number
  queue: StackerJob[]
  busy: boolean
  busyTime: number
  idleTime: number
  lastStatusChange: number
  x: number
  y: number
  nodeId: string
}

export interface StackerJob {
  id: string
  kind: 'inbound' | 'outbound'
  column: number
  level: number
  createdTime: number
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
