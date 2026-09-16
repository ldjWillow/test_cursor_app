import type { ProtocolStatus, ProtocolType } from './types.ts'

export type ProtocolSubscribeCallback = (value: unknown) => void

/**
 * Unified protocol adapter — transport only.
 * Devices must never depend on a concrete adapter.
 */
export interface ProtocolAdapter {
  id: string
  type: ProtocolType
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  read(address: string): Promise<unknown>
  write(address: string, value: unknown): Promise<void>
  subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void>
  getStatus(): ProtocolStatus
  /** Optional connection diagnostics. */
  testConnection?(): Promise<import('./types.ts').ConnectionTestResult>
}

export abstract class BaseProtocolAdapter implements ProtocolAdapter {
  protected connected = false
  protected lastError?: string
  protected lastConnectedAt?: number
  protected lastHeartbeatAt?: number
  protected latencyMs?: number
  protected reconnectAttempts = 0
  protected statusFlag: import('./types.ts').ConnectionStatus = 'DISCONNECTED'

  constructor(
    readonly id: string,
    readonly type: ProtocolType,
  ) {}

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract read(address: string): Promise<unknown>
  abstract write(address: string, value: unknown): Promise<void>
  abstract subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void>

  isConnected(): boolean {
    return this.connected
  }

  getStatus(): ProtocolStatus {
    return {
      id: this.id,
      type: this.type,
      status: this.statusFlag,
      connected: this.connected,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      latencyMs: this.latencyMs,
      reconnectAttempts: this.reconnectAttempts,
    }
  }

  protected markConnecting(): void {
    this.statusFlag = 'CONNECTING'
  }

  protected markConnected(): void {
    this.connected = true
    this.statusFlag = 'CONNECTED'
    this.lastConnectedAt = Date.now()
    this.lastHeartbeatAt = Date.now()
    this.lastError = undefined
  }

  protected markDisconnected(error?: string): void {
    this.connected = false
    this.statusFlag = error ? 'ERROR' : 'DISCONNECTED'
    this.lastError = error
  }

  protected markDegraded(error?: string): void {
    this.statusFlag = 'DEGRADED'
    this.lastError = error
  }

  protected markReconnecting(): void {
    this.statusFlag = 'RECONNECTING'
    this.reconnectAttempts += 1
  }

  touchHeartbeat(): void {
    this.lastHeartbeatAt = Date.now()
    if (this.statusFlag === 'DEGRADED' && this.connected) {
      this.statusFlag = 'CONNECTED'
    }
  }
}
