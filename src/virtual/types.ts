export type CommandStatus = 'accepted' | 'rejected' | 'executing' | 'completed' | 'failed'

export interface DeviceCommand {
  commandId: string
  deviceId: string
  commandType: string
  timestamp: number
  parameters?: Record<string, unknown>
}

export interface DeviceResponse {
  commandId: string
  deviceId: string
  status: CommandStatus
  message?: string
  timestamp: number
}

export interface DeviceFeedback {
  deviceId: string
  status: string
  timestamp: number
  signals: Record<string, unknown>
}

export interface DeviceStatus {
  deviceId: string
  type: string
  online: boolean
  state: string
  fault: boolean
  lastUpdated: number
  signals: Record<string, unknown>
}

export interface VirtualDevice {
  id: string
  type: string
  receiveCommand(command: DeviceCommand): Promise<DeviceResponse>
  getStatus(): DeviceStatus
  getFeedback(now: number): DeviceFeedback
}
