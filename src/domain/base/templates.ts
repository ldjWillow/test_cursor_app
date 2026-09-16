import type {
  AgvParams,
  ConveyorParams,
  DeviceParams,
  DeviceType,
} from '../../types/index.ts'
import { defaultParams } from './defaults.ts'

export interface DeviceTemplate {
  id: string
  name: string
  type: DeviceType
  description: string
  params: DeviceParams
}

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  {
    id: 'tpl-standard-agv',
    name: 'Standard AGV',
    type: 'agv',
    description: '1.5 m/s single-load AGV',
    params: {
      ...(defaultParams('agv') as AgvParams),
      speed: 1.5,
      capacity: 1,
    },
  },
  {
    id: 'tpl-heavy-agv',
    name: 'Heavy AGV',
    type: 'agv',
    description: '1.0 m/s dual-load AGV',
    params: {
      ...(defaultParams('agv') as AgvParams),
      speed: 1.0,
      capacity: 2,
      loadTime: 8,
      unloadTime: 8,
    },
  },
  {
    id: 'tpl-standard-conveyor',
    name: 'Standard Conveyor',
    type: 'conveyor',
    description: '0.8 m/s belt',
    params: {
      ...(defaultParams('conveyor') as ConveyorParams),
      speed: 0.8,
      length: 12,
      capacity: 12,
    },
  },
]

export function templateById(id: string): DeviceTemplate | undefined {
  return DEVICE_TEMPLATES.find((item) => item.id === id)
}
