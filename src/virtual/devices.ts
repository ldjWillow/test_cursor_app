import type { DeviceCommand, DeviceFeedback, DeviceResponse, DeviceStatus, VirtualDevice } from './types.ts'
import { nextId } from '../utils/id.ts'

export type ConveyorVirtualState = 'STOPPED' | 'RUNNING' | 'BLOCKED' | 'FAULT'

export class VirtualConveyor implements VirtualDevice {
  readonly type = 'conveyor'
  state: ConveyorVirtualState = 'STOPPED'
  occupied = false
  sensorFlags: Record<string, boolean> = {}

  constructor(readonly id: string, readonly name: string) {}

  async receiveCommand(command: DeviceCommand): Promise<DeviceResponse> {
    const now = command.timestamp || Date.now()
    if (this.state === 'FAULT' && command.commandType !== 'RESET') {
      return this.reject(command, now, 'Device in FAULT')
    }
    switch (command.commandType) {
      case 'START':
        this.state = 'RUNNING'
        return this.accept(command, now, 'Conveyor started')
      case 'STOP':
        this.state = 'STOPPED'
        return this.accept(command, now, 'Conveyor stopped')
      case 'RESET':
        this.state = 'STOPPED'
        return this.accept(command, now, 'Conveyor reset')
      default:
        return this.reject(command, now, `Unknown command ${command.commandType}`)
    }
  }

  getStatus(): DeviceStatus {
    return {
      deviceId: this.id,
      type: this.type,
      online: true,
      state: this.state,
      fault: this.state === 'FAULT',
      lastUpdated: Date.now(),
      signals: this.signalMap(),
    }
  }

  getFeedback(now: number): DeviceFeedback {
    return {
      deviceId: this.id,
      status: this.state,
      timestamp: now,
      signals: this.signalMap(),
    }
  }

  injectFault(): void {
    this.state = 'FAULT'
  }

  private signalMap(): Record<string, unknown> {
    return {
      running: this.state === 'RUNNING',
      Running: this.state === 'RUNNING',
      occupied: this.occupied,
      Occupied: this.occupied,
      fault: this.state === 'FAULT',
      Fault: this.state === 'FAULT',
      blocked: this.state === 'BLOCKED',
      Blocked: this.state === 'BLOCKED',
      AutoMode: true,
      SensorIn: Boolean(this.sensorFlags.SensorIn ?? this.sensorFlags.sensorIn),
      SensorOut: Boolean(this.sensorFlags.SensorOut ?? this.sensorFlags.sensorOut ?? this.sensorFlags.sensor02),
      Start: false,
      Stop: false,
      Reset: false,
      ...this.sensorFlags,
    }
  }

  private accept(command: DeviceCommand, now: number, message: string): DeviceResponse {
    return {
      commandId: command.commandId,
      deviceId: this.id,
      status: 'accepted',
      message,
      timestamp: now,
    }
  }

  private reject(command: DeviceCommand, now: number, message: string): DeviceResponse {
    return {
      commandId: command.commandId,
      deviceId: this.id,
      status: 'rejected',
      message,
      timestamp: now,
    }
  }
}

export type AgvVirtualState =
  | 'IDLE'
  | 'ASSIGNED'
  | 'MOVING'
  | 'LOADING'
  | 'UNLOADING'
  | 'WAITING'
  | 'CHARGING'
  | 'FAULT'

export class VirtualAgv implements VirtualDevice {
  readonly type = 'agv'
  state: AgvVirtualState = 'IDLE'
  currentTaskId?: string
  arrivedPickup = false
  arrivedDropoff = false
  loadComplete = false

  constructor(readonly id: string, readonly name: string) {}

  async receiveCommand(command: DeviceCommand): Promise<DeviceResponse> {
    const now = command.timestamp || Date.now()
    if (this.state === 'FAULT' && command.commandType !== 'RESET') {
      return {
        commandId: command.commandId,
        deviceId: this.id,
        status: 'rejected',
        message: 'AGV in FAULT',
        timestamp: now,
      }
    }
    switch (command.commandType) {
      case 'ASSIGN_TASK': {
        if (this.state !== 'IDLE') {
          return {
            commandId: command.commandId,
            deviceId: this.id,
            status: 'rejected',
            message: 'AGV not idle',
            timestamp: now,
          }
        }
        this.currentTaskId = String(command.parameters?.taskId ?? nextId('task'))
        this.state = 'ASSIGNED'
        this.arrivedPickup = false
        this.arrivedDropoff = false
        this.loadComplete = false
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'TASK_ACCEPTED',
          timestamp: now,
        }
      }
      case 'MOVE':
        this.state = 'MOVING'
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'Moving',
          timestamp: now,
        }
      case 'CANCEL_TASK':
        this.currentTaskId = undefined
        this.state = 'IDLE'
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'Task cancelled',
          timestamp: now,
        }
      case 'CHARGE':
        this.state = 'CHARGING'
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'Charging',
          timestamp: now,
        }
      case 'RESET':
        this.state = 'IDLE'
        this.currentTaskId = undefined
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'AGV reset',
          timestamp: now,
        }
      default:
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'rejected',
          message: `Unknown command ${command.commandType}`,
          timestamp: now,
        }
    }
  }

  getStatus(): DeviceStatus {
    return {
      deviceId: this.id,
      type: this.type,
      online: true,
      state: this.state,
      fault: this.state === 'FAULT',
      lastUpdated: Date.now(),
      signals: {
        currentTaskId: this.currentTaskId,
        arrivedPickup: this.arrivedPickup,
        arrivedDropoff: this.arrivedDropoff,
        loadComplete: this.loadComplete,
        Idle: this.state === 'IDLE',
        Busy: this.state !== 'IDLE' && this.state !== 'FAULT',
        Arrived: this.arrivedPickup || this.arrivedDropoff,
        Charging: this.state === 'CHARGING',
        Fault: this.state === 'FAULT',
        Battery: 85,
        Mission: this.currentTaskId ?? '',
        Cancel: false,
        Reset: false,
      },
    }
  }

  getFeedback(now: number): DeviceFeedback {
    return {
      deviceId: this.id,
      status: this.state,
      timestamp: now,
      signals: this.getStatus().signals,
    }
  }

  injectFault(): void {
    this.state = 'FAULT'
  }

  markArrivedPickup(): void {
    this.arrivedPickup = true
    this.state = 'LOADING'
  }

  markLoadComplete(): void {
    this.loadComplete = true
    this.state = 'MOVING'
  }

  markArrivedDropoff(): void {
    this.arrivedDropoff = true
    this.state = 'UNLOADING'
  }

  markTaskComplete(): void {
    this.state = 'IDLE'
    this.currentTaskId = undefined
  }
}

export type StackerVirtualState = 'IDLE' | 'MOVING' | 'PICKING' | 'PLACING' | 'COMPLETE' | 'FAULT'

export class VirtualStacker implements VirtualDevice {
  readonly type = 'stacker'
  state: StackerVirtualState = 'IDLE'
  currentColumn = 0
  currentLevel = 0
  lastCommandId?: string
  complete = false

  constructor(readonly id: string, readonly name: string) {}

  async receiveCommand(command: DeviceCommand): Promise<DeviceResponse> {
    const now = command.timestamp || Date.now()
    if (this.state === 'FAULT' && command.commandType !== 'RESET') {
      return {
        commandId: command.commandId,
        deviceId: this.id,
        status: 'rejected',
        message: 'Stacker in FAULT',
        timestamp: now,
      }
    }
    switch (command.commandType) {
      case 'INBOUND':
      case 'START_TASK':
      case 'OUTBOUND': {
        this.state = 'MOVING'
        this.complete = false
        this.lastCommandId = command.commandId
        this.currentColumn = Number(command.parameters?.column ?? command.parameters?.Column ?? 1)
        this.currentLevel = Number(command.parameters?.level ?? command.parameters?.Level ?? 1)
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'Inbound accepted',
          timestamp: now,
        }
      }
      case 'RESET':
        this.state = 'IDLE'
        this.complete = false
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'accepted',
          message: 'Stacker reset',
          timestamp: now,
        }
      default:
        return {
          commandId: command.commandId,
          deviceId: this.id,
          status: 'rejected',
          message: `Unknown command ${command.commandType}`,
          timestamp: now,
        }
    }
  }

  /** Advance FSM for PLC demos: MOVING → PICKING → PLACING → COMPLETE. */
  advance(): StackerVirtualState {
    if (this.state === 'MOVING') {
      this.state = 'PICKING'
    } else if (this.state === 'PICKING') {
      this.state = 'PLACING'
    } else if (this.state === 'PLACING') {
      this.state = 'COMPLETE'
      this.complete = true
    } else if (this.state === 'COMPLETE') {
      this.state = 'IDLE'
      this.complete = false
    }
    return this.state
  }

  getStatus(): DeviceStatus {
    return {
      deviceId: this.id,
      type: this.type,
      online: true,
      state: this.state,
      fault: this.state === 'FAULT',
      lastUpdated: Date.now(),
      signals: this.signalMap(),
    }
  }

  getFeedback(now: number): DeviceFeedback {
    return {
      deviceId: this.id,
      status: this.state,
      timestamp: now,
      signals: this.signalMap(),
    }
  }

  injectFault(): void {
    this.state = 'FAULT'
  }

  private signalMap(): Record<string, unknown> {
    return {
      Idle: this.state === 'IDLE',
      Busy: this.state === 'MOVING' || this.state === 'PICKING' || this.state === 'PLACING',
      Complete: this.complete || this.state === 'COMPLETE',
      Fault: this.state === 'FAULT',
      CurrentLevel: this.currentLevel,
      CurrentColumn: this.currentColumn,
      TaskCommand: false,
      Reset: false,
      Ack: this.state !== 'IDLE' && this.state !== 'FAULT',
    }
  }
}
