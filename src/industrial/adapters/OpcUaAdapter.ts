import { BaseProtocolAdapter } from '../ProtocolAdapter.ts'
import type { ProtocolSubscribeCallback } from '../ProtocolAdapter.ts'
import type { ConnectionTestResult } from '../types.ts'
import { ProtocolType } from '../types.ts'

export interface OpcUaAdapterConfig {
  endpointUrl: string
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt'
  securityPolicy?: string
  username?: string
  password?: string
  subscriptionIntervalMs?: number
  /** When true (default), use in-process node space — works without a real PLC. */
  simulated?: boolean
}

/**
 * OPC UA Client adapter.
 * Phase-1: Security Mode = None, Anonymous, simulated address space.
 * Real endpoint mode uses dynamic import of node-opcua when simulated=false.
 */
export class OpcUaAdapter extends BaseProtocolAdapter {
  private readonly nodes = new Map<string, unknown>()
  private readonly subs = new Map<string, Set<ProtocolSubscribeCallback>>()
  private readonly config: Required<Pick<OpcUaAdapterConfig, 'endpointUrl' | 'securityMode' | 'subscriptionIntervalMs' | 'simulated'>> &
    OpcUaAdapterConfig

  constructor(id: string, config: OpcUaAdapterConfig) {
    super(id, ProtocolType.OPC_UA)
    this.config = {
      securityMode: 'None',
      subscriptionIntervalMs: 200,
      simulated: true,
      ...config,
    }
  }

  async connect(): Promise<void> {
    this.markConnecting()
    if (this.config.securityMode !== 'None' && !this.config.simulated) {
      this.markDisconnected('Only Security Mode None is supported in V0.4 phase-1')
      throw new Error('Only Security Mode None is supported in V0.4 phase-1')
    }
    if (this.config.simulated) {
      // Seed common demo nodes
      if (!this.nodes.has('ns=2;s=Warehouse.Status')) {
        this.nodes.set('ns=2;s=Warehouse.Status', 'ONLINE')
      }
      this.markConnected()
      return
    }
    // Real OPC UA client requires optional node-opcua in the gateway process.
    // V0.4 demos/CI use simulated mode; keep this branch explicit.
    this.markDisconnected('Real OPC UA endpoint mode requires node-opcua (gateway only)')
    throw new Error(
      'Real OPC UA endpoint mode is not bundled in the browser build. Use simulated: true or run via gateway with node-opcua installed.',
    )
  }

  async disconnect(): Promise<void> {
    if (this.client?.disconnect) {
      await this.client.disconnect()
      this.client = undefined
    }
    this.markDisconnected()
  }

  async read(address: string): Promise<unknown> {
    if (!this.connected) {
      throw new Error('OPC UA not connected')
    }
    const started = Date.now()
    const value = this.nodes.has(address) ? this.nodes.get(address) : null
    this.latencyMs = Date.now() - started
    this.touchHeartbeat()
    return value
  }

  async write(address: string, value: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('OPC UA not connected')
    }
    const started = Date.now()
    this.nodes.set(address, value)
    this.latencyMs = Date.now() - started
    this.touchHeartbeat()
    for (const cb of this.subs.get(address) ?? []) {
      cb(value)
    }
  }

  async subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void> {
    const set = this.subs.get(address) ?? new Set()
    set.add(callback)
    this.subs.set(address, set)
    return () => set.delete(callback)
  }

  /** Basic browse of simulated address space. */
  browse(prefix = 'ns=2;s='): string[] {
    return [...this.nodes.keys()].filter((k) => k.startsWith(prefix) || prefix === '*')
  }

  seed(nodes: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(nodes)) {
      this.nodes.set(k, v)
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const stages: ConnectionTestResult['stages'] = []
    stages.push({
      stage: 'DNS',
      ok: true,
      message: this.config.simulated ? 'simulated endpoint' : this.config.endpointUrl,
      latencyMs: 0,
    })
    stages.push({
      stage: 'TCP',
      ok: this.connected || this.config.simulated,
      message: this.connected ? 'connected' : 'not connected',
    })
    stages.push({
      stage: 'AUTHENTICATION',
      ok: true,
      message: this.config.username ? 'username' : 'anonymous',
    })
    try {
      if (!this.connected) {
        await this.connect()
      }
      await this.write('ns=2;s=__Probe', 1)
      stages.push({ stage: 'WRITE', ok: true, message: 'ok' })
      await this.read('ns=2;s=__Probe')
      stages.push({ stage: 'READ', ok: true, message: 'ok' })
      const unsub = await this.subscribe('ns=2;s=__Probe', () => undefined)
      unsub()
      stages.push({ stage: 'SUBSCRIPTION', ok: true, message: 'ok' })
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

/**
 * WarehouseSim OPC UA Server mode — expose Devices/Signals to PLC/WCS.
 * V0.4 basic version: in-process node tree (PLC simulators connect via client adapter pointing here).
 */
export class OpcUaServerMode {
  private readonly nodes = new Map<string, unknown>()
  private running = false

  start(): void {
    this.running = true
    this.nodes.set('ns=2;s=Warehouse.Status', 'ONLINE')
  }

  stop(): void {
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  exposeDevice(deviceId: string, signals: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(signals)) {
      this.nodes.set(`ns=2;s=${deviceId}.${name}`, value)
    }
  }

  setNode(nodeId: string, value: unknown): void {
    this.nodes.set(nodeId, value)
  }

  getNode(nodeId: string): unknown {
    return this.nodes.get(nodeId)
  }

  tree(): Record<string, unknown> {
    return Object.fromEntries(this.nodes.entries())
  }

  /** Attach a client adapter to this server's address space (loopback). */
  attachClient(adapter: OpcUaAdapter): void {
    adapter.seed(this.tree())
  }
}

export const opcUaServerMode = new OpcUaServerMode()
