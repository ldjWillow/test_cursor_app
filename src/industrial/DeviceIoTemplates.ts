import type { SignalDataType, SignalDirection } from './types.ts'

export interface IoTemplatePoint {
  name: string
  direction: SignalDirection
  type: SignalDataType
  writable: boolean
  description?: string
}

export interface DeviceIoTemplate {
  deviceType: string
  points: IoTemplatePoint[]
}

export const DEVICE_IO_TEMPLATES: DeviceIoTemplate[] = [
  {
    deviceType: 'conveyor',
    points: [
      { name: 'Start', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Stop', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Reset', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Running', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Occupied', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Blocked', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Fault', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'AutoMode', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'SensorIn', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'SensorOut', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
    ],
  },
  {
    deviceType: 'stacker',
    points: [
      { name: 'TaskCommand', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Reset', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Idle', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Busy', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Complete', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Fault', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'CurrentLevel', direction: 'OUTPUT', type: 'INT', writable: false },
      { name: 'CurrentColumn', direction: 'OUTPUT', type: 'INT', writable: false },
    ],
  },
  {
    deviceType: 'agv',
    points: [
      { name: 'Mission', direction: 'INPUT', type: 'STRING', writable: true },
      { name: 'Cancel', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Reset', direction: 'INPUT', type: 'BOOLEAN', writable: true },
      { name: 'Idle', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Busy', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Arrived', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Charging', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Fault', direction: 'OUTPUT', type: 'BOOLEAN', writable: false },
      { name: 'Battery', direction: 'OUTPUT', type: 'FLOAT', writable: false },
    ],
  },
]

export function getIoTemplate(deviceType: string): DeviceIoTemplate | undefined {
  return DEVICE_IO_TEMPLATES.find((t) => t.deviceType === deviceType)
}

/** Expand MQTT topic templates: warehouse/{deviceType}/{deviceId}/command */
export function expandTopicTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? `{${key}}`)
}
