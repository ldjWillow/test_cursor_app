import type { NetworkFaultConfig } from './types.ts'
import { defaultNetworkFault } from './types.ts'

/**
 * Communication fault injection: delay, jitter, packet loss, disconnect, slow response.
 */
export class NetworkFaultInjector {
  private readonly faults = new Map<string, NetworkFaultConfig>()

  configure(connectionId: string, config: Partial<NetworkFaultConfig>): void {
    this.faults.set(connectionId, { ...defaultNetworkFault(), ...this.faults.get(connectionId), ...config })
  }

  get(connectionId: string): NetworkFaultConfig {
    return this.faults.get(connectionId) ?? defaultNetworkFault()
  }

  clear(connectionId?: string): void {
    if (connectionId) {
      this.faults.delete(connectionId)
    } else {
      this.faults.clear()
    }
  }

  shouldDrop(connectionId: string): boolean {
    const fault = this.get(connectionId)
    if (fault.disconnect) {
      return true
    }
    if (fault.packetLossPct <= 0) {
      return false
    }
    return Math.random() * 100 < fault.packetLossPct
  }

  async applyDelay(connectionId: string): Promise<void> {
    const fault = this.get(connectionId)
    const jitter = fault.jitterMs > 0 ? (Math.random() * 2 - 1) * fault.jitterMs : 0
    const delay = Math.max(0, fault.delayMs + jitter + fault.slowResponseMs)
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  isDisconnected(connectionId: string): boolean {
    return this.get(connectionId).disconnect
  }
}

export const networkFaultInjector = new NetworkFaultInjector()
