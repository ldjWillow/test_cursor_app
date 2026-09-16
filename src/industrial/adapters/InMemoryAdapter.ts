import { BaseProtocolAdapter } from '../ProtocolAdapter.ts'
import type { ProtocolSubscribeCallback } from '../ProtocolAdapter.ts'
import type { ConnectionTestResult } from '../types.ts'
import { ProtocolType } from '../types.ts'

/** In-process address space for demos / tests (no external broker). */
export class InMemoryAdapter extends BaseProtocolAdapter {
  private readonly store = new Map<string, unknown>()
  private readonly subs = new Map<string, Set<ProtocolSubscribeCallback>>()

  constructor(id: string) {
    super(id, ProtocolType.HTTP)
  }

  async connect(): Promise<void> {
    this.markConnecting()
    this.markConnected()
  }

  async disconnect(): Promise<void> {
    this.markDisconnected()
  }

  async read(address: string): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    return this.store.has(address) ? this.store.get(address) : null
  }

  async write(address: string, value: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    this.store.set(address, value)
    for (const cb of this.subs.get(address) ?? []) {
      cb(value)
    }
    for (const cb of this.subs.get('*') ?? []) {
      cb(value)
    }
  }

  async subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void> {
    const set = this.subs.get(address) ?? new Set()
    set.add(callback)
    this.subs.set(address, set)
    return () => {
      set.delete(callback)
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const stages: ConnectionTestResult['stages'] = [
      { stage: 'DNS', ok: true, message: 'in-memory', latencyMs: 0 },
      { stage: 'TCP', ok: true, message: 'in-memory', latencyMs: 0 },
      { stage: 'AUTHENTICATION', ok: true, message: 'n/a', latencyMs: 0 },
    ]
    try {
      await this.write('__test__', true)
      stages.push({ stage: 'WRITE', ok: true, message: 'ok', latencyMs: 0 })
      await this.read('__test__')
      stages.push({ stage: 'READ', ok: true, message: 'ok', latencyMs: 0 })
      const unsub = await this.subscribe('__test__', () => undefined)
      unsub()
      stages.push({ stage: 'SUBSCRIPTION', ok: true, message: 'ok', latencyMs: 0 })
    } catch (error) {
      stages.push({
        stage: 'READ',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return { ok: stages.every((s) => s.ok), stages, startedAt, finishedAt: Date.now() }
  }

  dump(): Record<string, unknown> {
    return Object.fromEntries(this.store.entries())
  }
}
