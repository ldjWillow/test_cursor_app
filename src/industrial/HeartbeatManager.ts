import type { HeartbeatConfig } from './types.ts'
import { defaultHeartbeatConfig } from './types.ts'

export type HeartbeatLostHandler = (connectionId: string) => void

/**
 * Tracks heartbeats per connection.
 * Exceeding timeout → DEGRADED / DISCONNECTED via ConnectionManager.
 */
export class HeartbeatManager {
  private readonly lastBeat = new Map<string, number>()
  private readonly configs = new Map<string, HeartbeatConfig>()
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>()
  private onLost?: HeartbeatLostHandler

  setLostHandler(handler: HeartbeatLostHandler): void {
    this.onLost = handler
  }

  configure(connectionId: string, config: Partial<HeartbeatConfig> = {}): void {
    this.configs.set(connectionId, { ...defaultHeartbeatConfig(), ...config })
  }

  beat(connectionId: string, now = Date.now()): void {
    this.lastBeat.set(connectionId, now)
  }

  start(connectionId: string, sendHeartbeat?: () => void | Promise<void>): void {
    this.stop(connectionId)
    const config = this.configs.get(connectionId) ?? defaultHeartbeatConfig()
    if (!config.enabled) {
      return
    }
    this.beat(connectionId)
    const timer = setInterval(() => {
      void sendHeartbeat?.()
      const last = this.lastBeat.get(connectionId) ?? 0
      if (Date.now() - last > config.timeoutMs) {
        this.onLost?.(connectionId)
      }
    }, config.intervalMs)
    this.timers.set(connectionId, timer)
  }

  stop(connectionId: string): void {
    const timer = this.timers.get(connectionId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(connectionId)
    }
  }

  stopAll(): void {
    for (const id of [...this.timers.keys()]) {
      this.stop(id)
    }
  }

  isAlive(connectionId: string, now = Date.now()): boolean {
    const config = this.configs.get(connectionId) ?? defaultHeartbeatConfig()
    if (!config.enabled) {
      return true
    }
    const last = this.lastBeat.get(connectionId)
    if (last === undefined) {
      return false
    }
    return now - last <= config.timeoutMs
  }

  lastBeatAt(connectionId: string): number | undefined {
    return this.lastBeat.get(connectionId)
  }
}
