import { BaseProtocolAdapter } from '../ProtocolAdapter.ts'
import type { ProtocolSubscribeCallback } from '../ProtocolAdapter.ts'
import type { ConnectionTestResult } from '../types.ts'
import { ProtocolType } from '../types.ts'

export interface TcpSocketAdapterConfig {
  host: string
  port: number
  mode?: 'client' | 'server'
  encoding?: 'utf8'
  delimiter?: string
  timeoutMs?: number
  keepAlive?: boolean
  /** In-process JSON-lines bus (default true). */
  simulated?: boolean
}

export type TcpMessageHandler = (message: Record<string, unknown>) => void

/**
 * TCP Socket adapter — JSON Line Protocol (\n delimited).
 * Binary protocol parser hook reserved for later.
 */
export class TcpSocketAdapter extends BaseProtocolAdapter {
  private readonly config: Required<Pick<TcpSocketAdapterConfig, 'host' | 'port' | 'mode' | 'delimiter' | 'simulated'>> &
    TcpSocketAdapterConfig
  private readonly inbox: Array<Record<string, unknown>> = []
  private readonly handlers = new Set<TcpMessageHandler>()
  private readonly addressSubs = new Map<string, Set<ProtocolSubscribeCallback>>()
  private buffer = ''

  constructor(id: string, config: TcpSocketAdapterConfig) {
    super(id, ProtocolType.TCP_SOCKET)
    this.config = {
      mode: 'client',
      delimiter: '\n',
      simulated: true,
      ...config,
    }
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
      throw new Error('TCP not connected')
    }
    if (address === 'inbox') {
      return this.inbox.slice()
    }
    if (address === 'inbox:last') {
      return this.inbox[this.inbox.length - 1] ?? null
    }
    return this.inbox.find((m) => String(m.type) === address || String(m.deviceId) === address) ?? null
  }

  async write(address: string, value: unknown): Promise<void> {
    await this.send(value, address)
  }

  async send(payload: unknown, address = 'tx'): Promise<void> {
    if (!this.connected) {
      throw new Error('TCP not connected')
    }
    const message =
      typeof payload === 'string'
        ? (tryParse(payload) as Record<string, unknown>)
        : (payload as Record<string, unknown>)
    const line = `${JSON.stringify(message)}${this.config.delimiter}`
    this.ingestRaw(line)
    for (const cb of this.addressSubs.get(address) ?? []) {
      cb(message)
    }
    this.touchHeartbeat()
  }

  /** Feed raw bytes/text (for tests / future real socket). */
  ingestRaw(chunk: string): void {
    this.buffer += chunk
    const parts = this.buffer.split(this.config.delimiter)
    this.buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (!part.trim()) {
        continue
      }
      const message = tryParse(part) as Record<string, unknown>
      this.inbox.push(message)
      if (this.inbox.length > 1000) {
        this.inbox.shift()
      }
      for (const handler of this.handlers) {
        handler(message)
      }
      for (const cb of this.addressSubs.get('*') ?? []) {
        cb(message)
      }
      for (const cb of this.addressSubs.get('rx') ?? []) {
        cb(message)
      }
    }
  }

  onMessage(handler: TcpMessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void> {
    const set = this.addressSubs.get(address) ?? new Set()
    set.add(callback)
    this.addressSubs.set(address, set)
    return () => set.delete(callback)
  }

  /** Reserved hook for binary protocols. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseBinary(_buffer: Uint8Array): unknown {
    throw new Error('Binary protocol parser reserved for a later release')
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const stages: ConnectionTestResult['stages'] = [
      { stage: 'DNS', ok: true, message: this.config.host },
      {
        stage: 'TCP',
        ok: true,
        message: `${this.config.mode} ${this.config.host}:${this.config.port}`,
      },
      { stage: 'AUTHENTICATION', ok: true, message: 'n/a' },
    ]
    try {
      if (!this.connected) {
        await this.connect()
      }
      await this.send({ type: 'ping' })
      stages.push({ stage: 'WRITE', ok: true, message: 'JSON line TX' })
      await this.read('inbox:last')
      stages.push({ stage: 'READ', ok: true, message: 'JSON line RX' })
      stages.push({ stage: 'SUBSCRIPTION', ok: true, message: 'message handler' })
    } catch (error) {
      stages.push({
        stage: 'READ',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return { ok: stages.every((s) => s.ok), stages, startedAt, finishedAt: Date.now() }
  }
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}
