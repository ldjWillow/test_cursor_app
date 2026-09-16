import type { DeviceCommand, DeviceResponse, DeviceStatus, VirtualDevice } from './types.ts'
import { VirtualAgv, VirtualConveyor, VirtualStacker } from './devices.ts'
import type { ProjectDocument } from '../types/index.ts'
import { DeviceType } from '../types/index.ts'
import { nextId } from '../utils/id.ts'

export interface CommandMonitorEntry {
  time: number
  commandId: string
  deviceId: string
  commandType: string
  status: string
  latencyMs: number
  result?: string
}

export class DeviceRegistry {
  private readonly devices = new Map<string, VirtualDevice>()
  readonly commandLog: CommandMonitorEntry[] = []

  register(device: VirtualDevice): void {
    this.devices.set(device.id, device)
  }

  clear(): void {
    this.devices.clear()
    this.commandLog.length = 0
  }

  loadFromProject(project: ProjectDocument): void {
    this.clear()
    for (const device of project.devices) {
      if (device.type === DeviceType.Agv) {
        this.register(new VirtualAgv(device.id, device.name))
      } else if (device.type === DeviceType.Conveyor) {
        this.register(new VirtualConveyor(device.id, device.name))
      } else if (device.type === DeviceType.Stacker) {
        this.register(new VirtualStacker(device.id, device.name))
      }
    }
  }

  get(id: string): VirtualDevice | undefined {
    return this.devices.get(id)
  }

  list(): DeviceStatus[] {
    return [...this.devices.values()].map((device) => device.getStatus())
  }

  async sendCommand(input: Omit<DeviceCommand, 'commandId' | 'timestamp'> & {
    commandId?: string
    timestamp?: number
  }): Promise<DeviceResponse> {
    const started = Date.now()
    const command: DeviceCommand = {
      commandId: input.commandId ?? nextId('cmd'),
      deviceId: input.deviceId,
      commandType: input.commandType,
      timestamp: input.timestamp ?? started,
      parameters: input.parameters,
    }
    const device = this.devices.get(command.deviceId)
    if (!device) {
      const response: DeviceResponse = {
        commandId: command.commandId,
        deviceId: command.deviceId,
        status: 'rejected',
        message: 'Device not found',
        timestamp: Date.now(),
      }
      this.commandLog.push({
        time: response.timestamp,
        commandId: response.commandId,
        deviceId: response.deviceId,
        commandType: command.commandType,
        status: response.status,
        latencyMs: Date.now() - started,
        result: response.message,
      })
      return response
    }
    const response = await device.receiveCommand(command)
    this.commandLog.push({
      time: response.timestamp,
      commandId: response.commandId,
      deviceId: response.deviceId,
      commandType: command.commandType,
      status: response.status,
      latencyMs: Date.now() - started,
      result: response.message,
    })
    if (this.commandLog.length > 500) {
      this.commandLog.splice(0, this.commandLog.length - 500)
    }
    return response
  }
}

export const deviceRegistry = new DeviceRegistry()
