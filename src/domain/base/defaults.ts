import { DeviceType } from '../../types/index.ts'
import type {
  AgvParams,
  ChargerParams,
  ConveyorParams,
  DeviceParams,
  PathNodeParams,
  RackParams,
  SinkParams,
  SourceParams,
  StackerParams,
  StationParams,
} from '../../types/index.ts'
import { assertNever } from '../../utils/math.ts'

export function defaultParams(type: DeviceType): DeviceParams {
  switch (type) {
    case DeviceType.Source:
      return { generationInterval: 1, totalCount: 100 } satisfies SourceParams
    case DeviceType.Sink:
      return { capacity: 10_000 } satisfies SinkParams
    case DeviceType.Station:
      return { processTime: 0, capacity: 4 } satisfies StationParams
    case DeviceType.Conveyor:
      return { length: 10, speed: 1, capacity: 10 } satisfies ConveyorParams
    case DeviceType.Agv:
      return {
        speed: 1.5,
        capacity: 1,
        loadTime: 5,
        unloadTime: 5,
        batteryCapacity: 100,
        currentBattery: 100,
        chargeThreshold: 20,
      } satisfies AgvParams
    case DeviceType.Rack:
      return { rows: 5, columns: 8, levels: 4 } satisfies RackParams
    case DeviceType.Stacker:
      return {
        horizontalSpeed: 2,
        verticalSpeed: 1,
        forkTime: 3,
        bayWidth: 1.2,
        levelHeight: 1.5,
      } satisfies StackerParams
    case DeviceType.Charger:
      return { chargeRate: 10 } satisfies ChargerParams
    case DeviceType.PathNode:
      return { label: 'N' } satisfies PathNodeParams
    default:
      return assertNever(type, 'Unknown device type')
  }
}

export function isSourceParams(_params: DeviceParams, type: DeviceType): _params is SourceParams {
  return type === DeviceType.Source
}

export function isConveyorParams(_params: DeviceParams, type: DeviceType): _params is ConveyorParams {
  return type === DeviceType.Conveyor
}

export function isAgvParams(_params: DeviceParams, type: DeviceType): _params is AgvParams {
  return type === DeviceType.Agv
}

export function isStackerParams(_params: DeviceParams, type: DeviceType): _params is StackerParams {
  return type === DeviceType.Stacker
}

export function isRackParams(_params: DeviceParams, type: DeviceType): _params is RackParams {
  return type === DeviceType.Rack
}

export function isStationParams(_params: DeviceParams, type: DeviceType): _params is StationParams {
  return type === DeviceType.Station
}

export function isSinkParams(_params: DeviceParams, type: DeviceType): _params is SinkParams {
  return type === DeviceType.Sink
}

export const MATERIAL_FLOW_TYPES: DeviceType[] = [
  DeviceType.Source,
  DeviceType.Sink,
  DeviceType.Station,
  DeviceType.Conveyor,
  DeviceType.Stacker,
]

export const PATH_TYPES: DeviceType[] = [
  DeviceType.Station,
  DeviceType.PathNode,
  DeviceType.Charger,
  DeviceType.Rack,
  DeviceType.Stacker,
]
