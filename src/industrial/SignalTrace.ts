import type { SignalQuality, SignalTraceEntry } from './types.ts'
import { nextId } from '../utils/id.ts'

/**
 * Signal Trace — value change history (separate from Protocol / Event logs).
 */
export class SignalTrace {
  private readonly entries: SignalTraceEntry[] = []
  private readonly series = new Map<string, Array<{ t: number; v: number | boolean | string }>>()
  private readonly maxEntries: number

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries
  }

  record(input: {
    signalId: string
    signalName: string
    oldValue: unknown
    newValue: unknown
    source: string
    quality?: SignalQuality
    time?: number
  }): SignalTraceEntry | undefined {
    if (Object.is(input.oldValue, input.newValue)) {
      return undefined
    }
    const entry: SignalTraceEntry = {
      id: nextId('strace'),
      time: input.time ?? Date.now(),
      signalId: input.signalId,
      signalName: input.signalName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      source: input.source,
      quality: input.quality ?? 'GOOD',
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }

    const numeric =
      typeof input.newValue === 'number'
        ? input.newValue
        : typeof input.newValue === 'boolean'
          ? input.newValue
            ? 1
            : 0
          : String(input.newValue)
    const bucket = this.series.get(input.signalId) ?? []
    bucket.push({ t: entry.time, v: numeric })
    if (bucket.length > 2000) {
      bucket.splice(0, bucket.length - 2000)
    }
    this.series.set(input.signalId, bucket)
    return entry
  }

  list(signalId?: string, limit = 500): SignalTraceEntry[] {
    const rows = signalId ? this.entries.filter((e) => e.signalId === signalId) : this.entries
    return rows.slice(-limit).reverse()
  }

  graphSeries(signalIds: string[], maxPoints = 500): Record<string, Array<{ t: number; v: number | boolean | string }>> {
    const out: Record<string, Array<{ t: number; v: number | boolean | string }>> = {}
    for (const id of signalIds.slice(0, 10)) {
      const series = this.series.get(id) ?? []
      out[id] = series.slice(-maxPoints)
    }
    return out
  }

  toCsv(): string {
    const header = 'time,signalId,signalName,oldValue,newValue,source,quality'
    const lines = this.entries.map((e) =>
      [
        new Date(e.time).toISOString(),
        e.signalId,
        e.signalName,
        JSON.stringify(e.oldValue),
        JSON.stringify(e.newValue),
        e.source,
        e.quality,
      ].join(','),
    )
    return [header, ...lines].join('\n')
  }

  clear(): void {
    this.entries.length = 0
    this.series.clear()
  }
}

export const signalTrace = new SignalTrace()
