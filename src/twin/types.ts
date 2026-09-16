import type { AgvStatus, SimulationStatus, TaskStatus } from '../types/index.ts'

/** Warehouse world units are meters. */
export interface WorldPosition {
  x: number
  y: number
  z: number
}

export type OperatingMode = 'simulation' | 'emulation' | 'replay'
export type ViewMode = '2d' | '3d' | 'split'

export interface AgvRuntimeState {
  id: string
  name: string
  type: 'agv'
  x: number
  y: number
  z: number
  rotation: number
  status: AgvStatus
  battery: number
  currentTaskId?: string
  loadId?: string
  path?: string[]
  moveStartTime?: number
  moveEndTime?: number
  nodeId?: string
  travelDistance: number
  loadedTravelDistance: number
  emptyTravelDistance: number
  routeWaitingTime: number
  speed: number
}

export interface ConveyorRuntimeState {
  id: string
  name: string
  type: 'conveyor'
  x: number
  y: number
  z: number
  status: string
  running: boolean
  blocked: boolean
  fault: boolean
  materialIds: string[]
  occupancy: number
  queueLength: number
  length: number
  speed: number
}

export interface StackerRuntimeState {
  id: string
  name: string
  type: 'stacker'
  x: number
  y: number
  z: number
  liftHeight: number
  forkPosition: number
  horizontalOffset: number
  status: string
  busy: boolean
  fault: boolean
  queueLength: number
  currentColumn: number
  currentLevel: number
}

export interface RackRuntimeState {
  id: string
  name: string
  type: 'rack'
  x: number
  y: number
  z: number
  rows: number
  columns: number
  levels: number
  occupiedCount: number
  totalLocations: number
  locations: Array<{
    row: number
    column: number
    level: number
    occupied: boolean
    reserved?: boolean
    fault?: boolean
  }>
}

export interface StationRuntimeState {
  id: string
  name: string
  type: 'station' | 'source' | 'sink' | 'charger' | 'path-node'
  x: number
  y: number
  z: number
  status: string
  occupancy: number
  queueLength: number
}

export interface SensorRuntimeState {
  id: string
  name: string
  type: 'sensor'
  deviceId?: string
  x: number
  y: number
  z: number
  active: boolean
  triggerType: 'photoelectric' | 'presence' | 'position'
}

export type DeviceRuntimeState =
  | AgvRuntimeState
  | ConveyorRuntimeState
  | StackerRuntimeState
  | RackRuntimeState
  | StationRuntimeState
  | SensorRuntimeState

export interface MaterialRuntimeState {
  id: string
  x: number
  y: number
  z: number
  locationId: string
  createdTime: number
  enterTime?: number
  completeTime?: number
}

export interface TaskRuntimeState {
  id: string
  sourceId: string
  targetId: string
  status: TaskStatus
  createTime: number
  assignTime?: number
  startTime?: number
  finishTime?: number
  agvId?: string
  priority: number
}

export interface DigitalTwinState {
  simulationTime: number
  status: SimulationStatus
  operatingMode: OperatingMode
  devices: Record<string, DeviceRuntimeState>
  materials: Record<string, MaterialRuntimeState>
  tasks: Record<string, TaskRuntimeState>
  selectedDeviceId?: string
  revision: number
}

export function emptyDigitalTwinState(operatingMode: OperatingMode = 'simulation'): DigitalTwinState {
  return {
    simulationTime: 0,
    status: 'idle',
    operatingMode,
    devices: {},
    materials: {},
    tasks: {},
    revision: 0,
  }
}
