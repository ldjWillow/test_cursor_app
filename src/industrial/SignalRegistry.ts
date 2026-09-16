import type { SignalDataType, SignalDefinition, SignalDirection, SignalQuality } from './types.ts'
import { SignalQuality as Q } from './types.ts'
import { nextId } from '../utils/id.ts'

export class SignalRegistry {
  private readonly signals = new Map<string, SignalDefinition>()

  register(input: Omit<SignalDefinition, 'quality' | 'timestamp'> & {
    quality?: SignalQuality
    timestamp?: number
  }): SignalDefinition {
    const def: SignalDefinition = {
      ...input,
      quality: input.quality ?? Q.GOOD,
      timestamp: input.timestamp ?? Date.now(),
    }
    this.signals.set(def.id, def)
    return def
  }

  ensure(deviceId: string, name: string, opts: {
    type?: SignalDataType
    direction?: SignalDirection
    writable?: boolean
    value?: unknown
    description?: string
  } = {}): SignalDefinition {
    const id = `${deviceId}.${name}`
    const existing = this.signals.get(id)
    if (existing) {
      return existing
    }
    return this.register({
      id,
      name,
      deviceId,
      type: opts.type ?? 'BOOLEAN',
      direction: opts.direction ?? 'OUTPUT',
      value: opts.value ?? false,
      writable: opts.writable ?? false,
      description: opts.description,
    })
  }

  get(id: string): SignalDefinition | undefined {
    return this.signals.get(id)
  }

  list(filter?: {
    deviceId?: string
    direction?: SignalDirection
    search?: string
    pinnedOnly?: boolean
  }): SignalDefinition[] {
    let rows = [...this.signals.values()]
    if (filter?.deviceId) {
      rows = rows.filter((s) => s.deviceId === filter.deviceId)
    }
    if (filter?.direction) {
      rows = rows.filter((s) => s.direction === filter.direction)
    }
    if (filter?.pinnedOnly) {
      rows = rows.filter((s) => s.pinned)
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      rows = rows.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.deviceId.toLowerCase().includes(q),
      )
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id))
  }

  setValue(
    id: string,
    value: unknown,
    opts: { source?: string; quality?: SignalQuality; force?: boolean } = {},
  ): SignalDefinition | undefined {
    const signal = this.signals.get(id)
    if (!signal) {
      return undefined
    }
    if (opts.force) {
      signal.forced = true
    }
    if (signal.forced && !opts.force) {
      return signal
    }
    signal.value = value
    signal.timestamp = Date.now()
    signal.source = opts.source
    signal.quality = opts.quality ?? Q.GOOD
    return signal
  }

  clearForce(id: string): void {
    const signal = this.signals.get(id)
    if (signal) {
      signal.forced = false
    }
  }

  setQualityForConnection(connectionId: string, quality: SignalQuality, mappedSignalIds: string[]): void {
    for (const id of mappedSignalIds) {
      const signal = this.signals.get(id)
      if (signal) {
        signal.quality = quality
        signal.source = connectionId
        signal.timestamp = Date.now()
      }
    }
  }

  setPinned(id: string, pinned: boolean): void {
    const signal = this.signals.get(id)
    if (signal) {
      signal.pinned = pinned
    }
  }

  clear(): void {
    this.signals.clear()
  }

  /** Bulk upsert from device feedback signals. */
  syncDeviceSignals(deviceId: string, signals: Record<string, unknown>, source = 'Simulation'): void {
    for (const [name, value] of Object.entries(signals)) {
      const id = `${deviceId}.${name}`
      if (!this.signals.has(id)) {
        this.ensure(deviceId, name, {
          type: typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? 'FLOAT' : 'STRING',
          direction: 'OUTPUT',
          value,
        })
      }
      this.setValue(id, value, { source, quality: Q.GOOD })
    }
  }

  createId(deviceId: string, name: string): string {
    return `${deviceId}.${name}`
  }

  /** Helper for tests / demos */
  registerMany(defs: Array<Omit<SignalDefinition, 'id' | 'quality' | 'timestamp'> & { id?: string }>): void {
    for (const def of defs) {
      this.register({
        id: def.id ?? nextId('sig'),
        name: def.name,
        deviceId: def.deviceId,
        type: def.type,
        direction: def.direction,
        value: def.value,
        writable: def.writable,
        description: def.description,
      })
    }
  }
}

export const signalRegistry = new SignalRegistry()
