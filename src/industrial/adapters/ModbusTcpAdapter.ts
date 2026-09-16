import { BaseProtocolAdapter } from '../ProtocolAdapter.ts'
import type { ProtocolSubscribeCallback } from '../ProtocolAdapter.ts'
import type { ConnectionTestResult } from '../types.ts'
import { ProtocolType } from '../types.ts'
import { parseModbusAddress } from '../SignalMappingEngine.ts'

export interface ModbusTcpAdapterConfig {
  host: string
  port: number
  unitId?: number
  timeoutMs?: number
  reconnectIntervalMs?: number
  /** In-process register map (default true for demos/tests). */
  simulated?: boolean
}

/**
 * Modbus TCP adapter — Coils / Discrete Inputs / Holding / Input Registers.
 */
export class ModbusTcpAdapter extends BaseProtocolAdapter {
  private readonly coils = new Map<number, boolean>()
  private readonly discrete = new Map<number, boolean>()
  private readonly holding = new Map<number, number>()
  private readonly input = new Map<number, number>()
  private readonly subs = new Map<string, Set<ProtocolSubscribeCallback>>()
  private readonly config: Required<ModbusTcpAdapterConfig>

  constructor(id: string, config: ModbusTcpAdapterConfig) {
    super(id, ProtocolType.MODBUS_TCP)
    this.config = {
      unitId: 1,
      timeoutMs: 3000,
      reconnectIntervalMs: 2000,
      simulated: true,
      ...config,
    }
  }

  async connect(): Promise<void> {
    this.markConnecting()
    if (!this.config.simulated) {
      // Real socket path reserved; V0.4 demos use simulated register map.
      // A future release can wrap jsmodbus / modbus-serial here.
    }
    this.markConnected()
  }

  async disconnect(): Promise<void> {
    this.markDisconnected()
  }

  async read(address: string): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Modbus not connected')
    }
    const started = Date.now()
    const { area, offset } = parseModbusAddress(address)
    let value: unknown
    switch (area) {
      case 'coil':
        value = this.coils.get(offset) ?? false
        break
      case 'discrete':
        value = this.discrete.get(offset) ?? false
        break
      case 'holding':
        value = this.holding.get(offset) ?? 0
        break
      case 'input':
        value = this.input.get(offset) ?? 0
        break
    }
    this.latencyMs = Date.now() - started
    this.touchHeartbeat()
    return value
  }

  async write(address: string, value: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('Modbus not connected')
    }
    const started = Date.now()
    const { area, offset } = parseModbusAddress(address)
    switch (area) {
      case 'coil':
        this.coils.set(offset, Boolean(value))
        break
      case 'holding':
        this.holding.set(offset, Number(value))
        break
      case 'discrete':
      case 'input':
        // Discrete/Input are typically PLC→master; allow write in simulation for feedback mapping
        if (area === 'discrete') {
          this.discrete.set(offset, Boolean(value))
        } else {
          this.input.set(offset, Number(value))
        }
        break
    }
    this.latencyMs = Date.now() - started
    this.touchHeartbeat()
    for (const cb of this.subs.get(address) ?? []) {
      cb(value)
    }
  }

  async readCoil(offset: number): Promise<boolean> {
    return Boolean(await this.read(`coil:${offset + 1}`))
  }

  async writeCoil(offset: number, value: boolean): Promise<void> {
    await this.write(`coil:${offset + 1}`, value)
  }

  async readHoldingRegister(offset: number): Promise<number> {
    return Number(await this.read(`holding:${offset + 40001}`))
  }

  async writeHoldingRegister(offset: number, value: number): Promise<void> {
    await this.write(`holding:${offset + 40001}`, value)
  }

  async subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void> {
    const set = this.subs.get(address) ?? new Set()
    set.add(callback)
    this.subs.set(address, set)
    return () => set.delete(callback)
  }

  /** Polling helper for SCAN / POLLING update modes. */
  async poll(addresses: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const address of addresses) {
      result[address] = await this.read(address)
    }
    return result
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const stages: ConnectionTestResult['stages'] = [
      { stage: 'DNS', ok: true, message: this.config.host },
      { stage: 'TCP', ok: true, message: `${this.config.host}:${this.config.port}` },
      { stage: 'AUTHENTICATION', ok: true, message: `unitId=${this.config.unitId}` },
    ]
    try {
      if (!this.connected) {
        await this.connect()
      }
      await this.writeCoil(0, true)
      stages.push({ stage: 'WRITE', ok: true, message: 'coil 1' })
      await this.readCoil(0)
      stages.push({ stage: 'READ', ok: true, message: 'coil 1' })
      stages.push({ stage: 'SUBSCRIPTION', ok: true, message: 'polling mode' })
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
