import type { ProtocolLogEntry, ProtocolType } from './types.ts'
import { nextId } from '../utils/id.ts'

export interface ProtocolMonitorFilter {
  protocol?: ProtocolType
  connectionId?: string
  deviceId?: string
  address?: string
  topic?: string
  direction?: 'TX' | 'RX'
  result?: ProtocolLogEntry['result']
  search?: string
}

/**
 * Protocol Monitor — packet-style log, separate from simulation/event logs.
 */
export class ProtocolMonitor {
  private readonly entries: ProtocolLogEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries
  }

  log(input: Omit<ProtocolLogEntry, 'id' | 'time'> & { time?: number; id?: string }): ProtocolLogEntry {
    const entry: ProtocolLogEntry = {
      id: input.id ?? nextId('plog'),
      time: input.time ?? Date.now(),
      protocol: input.protocol,
      connectionId: input.connectionId,
      direction: input.direction,
      address: input.address,
      value: input.value,
      latencyMs: input.latencyMs,
      result: input.result,
      message: input.message,
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    return entry
  }

  list(filter?: ProtocolMonitorFilter, limit = 500): ProtocolLogEntry[] {
    let rows = this.entries
    if (filter?.protocol) {
      rows = rows.filter((e) => e.protocol === filter.protocol)
    }
    if (filter?.connectionId) {
      rows = rows.filter((e) => e.connectionId === filter.connectionId)
    }
    if (filter?.direction) {
      rows = rows.filter((e) => e.direction === filter.direction)
    }
    if (filter?.result) {
      rows = rows.filter((e) => e.result === filter.result)
    }
    if (filter?.address || filter?.topic) {
      const needle = (filter.address ?? filter.topic ?? '').toLowerCase()
      rows = rows.filter((e) => e.address.toLowerCase().includes(needle))
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      rows = rows.filter(
        (e) =>
          e.address.toLowerCase().includes(q) ||
          e.connectionId.toLowerCase().includes(q) ||
          String(e.value).toLowerCase().includes(q) ||
          (e.message?.toLowerCase().includes(q) ?? false),
      )
    }
    return rows.slice(-limit).reverse()
  }

  clear(): void {
    this.entries.length = 0
  }

  size(): number {
    return this.entries.length
  }
}

export const protocolMonitor = new ProtocolMonitor()
