import type { ReconnectConfig } from './types.ts'
import { defaultReconnectConfig } from './types.ts'

export class ReconnectPolicy {
  private attempts = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly config: ReconnectConfig

  constructor(config: Partial<ReconnectConfig> = {}) {
    this.config = { ...defaultReconnectConfig(), ...config }
  }

  get attemptCount(): number {
    return this.attempts
  }

  reset(): void {
    this.attempts = 0
    this.clear()
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  nextDelayMs(): number | undefined {
    if (this.attempts >= this.config.maxAttempts) {
      return undefined
    }
    const delay = Math.min(
      this.config.initialDelayMs * this.config.backoff ** this.attempts,
      this.config.maxDelayMs,
    )
    this.attempts += 1
    return delay
  }

  schedule(fn: () => void | Promise<void>): boolean {
    const delay = this.nextDelayMs()
    if (delay === undefined) {
      return false
    }
    this.clear()
    this.timer = setTimeout(() => {
      void fn()
    }, delay)
    return true
  }
}
