import type { IndustrialSignalMapping, SignalDataType } from './types.ts'

/** Apply scale/offset and coerce PLC types. */
export function transformInbound(
  raw: unknown,
  mapping: Pick<IndustrialSignalMapping, 'scale' | 'offset' | 'dataType'>,
): unknown {
  const scale = mapping.scale ?? 1
  const offset = mapping.offset ?? 0
  switch (mapping.dataType) {
    case 'BOOLEAN':
      return Boolean(raw)
    case 'INT': {
      const n = Number(raw)
      return Math.trunc(n * scale + offset)
    }
    case 'FLOAT': {
      const n = Number(raw)
      return n * scale + offset
    }
    case 'STRING':
      return String(raw)
    case 'ENUM':
      return raw
    default:
      return raw
  }
}

export function transformOutbound(
  value: unknown,
  mapping: Pick<IndustrialSignalMapping, 'scale' | 'offset' | 'dataType'>,
): unknown {
  const scale = mapping.scale ?? 1
  const offset = mapping.offset ?? 0
  switch (mapping.dataType) {
    case 'BOOLEAN':
      return Boolean(value)
    case 'INT': {
      const n = Number(value)
      return Math.trunc((n - offset) / (scale || 1))
    }
    case 'FLOAT': {
      const n = Number(value)
      return (n - offset) / (scale || 1)
    }
    case 'STRING':
      return String(value)
    default:
      return value
  }
}

export function parseModbusAddress(address: string): {
  area: 'coil' | 'discrete' | 'holding' | 'input'
  offset: number
} {
  const normalized = address.trim().toUpperCase()
  if (normalized.startsWith('C') || normalized.startsWith('COIL')) {
    const n = Number(normalized.replace(/[^\d]/g, ''))
    return { area: 'coil', offset: n > 0 ? n - 1 : 0 }
  }
  if (normalized.startsWith('DI') || normalized.startsWith('DISCRETE') || /^1\d{4}/.test(normalized)) {
    const n = Number(normalized.replace(/[^\d]/g, ''))
    return { area: 'discrete', offset: n >= 10001 ? n - 10001 : n }
  }
  if (normalized.startsWith('HR') || normalized.startsWith('HOLDING') || /^4\d{4}/.test(normalized)) {
    const n = Number(normalized.replace(/[^\d]/g, ''))
    return { area: 'holding', offset: n >= 40001 ? n - 40001 : n }
  }
  if (normalized.startsWith('IR') || normalized.startsWith('INPUT') || /^3\d{4}/.test(normalized)) {
    const n = Number(normalized.replace(/[^\d]/g, ''))
    return { area: 'input', offset: n >= 30001 ? n - 30001 : n }
  }
  const n = Number(normalized.replace(/[^\d]/g, ''))
  return { area: 'holding', offset: Number.isFinite(n) ? n : 0 }
}

export function coerceDataType(value: unknown, dataType: SignalDataType): unknown {
  return transformInbound(value, { dataType, scale: 1, offset: 0 })
}

/**
 * Signal Mapping Engine — bridges Protocol addresses ↔ SignalRegistry.
 * Does not talk to VirtualDevice directly; CommandBus consumes INPUT edges.
 */
export class SignalMappingEngine {
  private mappings: IndustrialSignalMapping[] = []

  setMappings(mappings: IndustrialSignalMapping[]): void {
    this.mappings = mappings.map((m) => ({ ...m }))
  }

  getMappings(): IndustrialSignalMapping[] {
    return this.mappings.map((m) => ({ ...m }))
  }

  add(mapping: IndustrialSignalMapping): void {
    this.mappings.push({ ...mapping })
  }

  remove(id: string): void {
    this.mappings = this.mappings.filter((m) => m.id !== id)
  }

  enable(id: string, enabled: boolean): void {
    const mapping = this.mappings.find((m) => m.id === id)
    if (mapping) {
      mapping.enabled = enabled
    }
  }

  byConnection(connectionId: string): IndustrialSignalMapping[] {
    return this.mappings.filter((m) => m.connectionId === connectionId && m.enabled)
  }

  bySignal(signalId: string): IndustrialSignalMapping[] {
    return this.mappings.filter((m) => m.signalId === signalId && m.enabled)
  }

  findByAddress(connectionId: string, address: string): IndustrialSignalMapping | undefined {
    return this.mappings.find(
      (m) => m.connectionId === connectionId && m.address === address && m.enabled,
    )
  }

  applyInbound(raw: unknown, mapping: IndustrialSignalMapping): unknown {
    return transformInbound(raw, mapping)
  }

  applyOutbound(value: unknown, mapping: IndustrialSignalMapping): unknown {
    return transformOutbound(value, mapping)
  }

  clear(): void {
    this.mappings = []
  }
}

export const signalMappingEngine = new SignalMappingEngine()
