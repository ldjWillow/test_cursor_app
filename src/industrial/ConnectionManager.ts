import type { ProtocolAdapter } from './ProtocolAdapter.ts'
import { HeartbeatManager } from './HeartbeatManager.ts'
import { ReconnectPolicy } from './ReconnectPolicy.ts'
import { protocolMonitor } from './ProtocolMonitor.ts'
import { networkFaultInjector } from './NetworkFaultInjector.ts'
import { auditLog } from './AuditLog.ts'
import { InMemoryAdapter } from './adapters/InMemoryAdapter.ts'
import { OpcUaAdapter } from './adapters/OpcUaAdapter.ts'
import { ModbusTcpAdapter } from './adapters/ModbusTcpAdapter.ts'
import { MqttAdapter } from './adapters/MqttAdapter.ts'
import { TcpSocketAdapter } from './adapters/TcpSocketAdapter.ts'
import type {
  ConnectionConfig,
  ConnectionStatus,
  ConnectionTestResult,
  ProtocolType,
  SecretReference,
} from './types.ts'
import {
  AccessPermission,
  ConnectionStatus as CS,
  EnvironmentName,
  ProtocolType as PT,
  defaultHeartbeatConfig,
  defaultReconnectConfig,
} from './types.ts'
import { nextId } from '../utils/id.ts'

export interface ManagedConnection {
  config: ConnectionConfig
  adapter: ProtocolAdapter
  status: ConnectionStatus
}

type AdapterFactory = (config: ConnectionConfig) => ProtocolAdapter

const defaultFactory: AdapterFactory = (config) => {
  const settings = config.settings
  switch (config.type) {
    case PT.OPC_UA:
      return new OpcUaAdapter(config.id, {
        endpointUrl: String(settings.endpointUrl ?? 'opc.tcp://127.0.0.1:4840'),
        securityMode: (settings.securityMode as 'None') ?? 'None',
        username: settings.username as string | undefined,
        password: resolveSecret(config.secrets?.password),
        simulated: settings.simulated !== false,
      })
    case PT.MODBUS_TCP:
      return new ModbusTcpAdapter(config.id, {
        host: String(settings.host ?? '127.0.0.1'),
        port: Number(settings.port ?? 502),
        unitId: Number(settings.unitId ?? 1),
        timeoutMs: Number(settings.timeoutMs ?? 3000),
        simulated: settings.simulated !== false,
      })
    case PT.MQTT:
      return new MqttAdapter(config.id, {
        brokerUrl: String(settings.brokerUrl ?? 'mqtt://127.0.0.1:1883'),
        username: settings.username as string | undefined,
        password: resolveSecret(config.secrets?.password),
        clientId: String(settings.clientId ?? `warehousesim-${config.id}`),
        qos: (settings.qos as 0 | 1 | 2) ?? 0,
        simulated: settings.simulated !== false,
      })
    case PT.TCP_SOCKET:
      return new TcpSocketAdapter(config.id, {
        host: String(settings.host ?? '127.0.0.1'),
        port: Number(settings.port ?? 9000),
        mode: (settings.mode as 'client' | 'server') ?? 'client',
        simulated: settings.simulated !== false,
      })
    case PT.WEBSOCKET:
    case PT.HTTP:
    default:
      return new InMemoryAdapter(config.id)
  }
}

function resolveSecret(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && (value as SecretReference).kind === 'secret-ref') {
    const key = (value as SecretReference).key
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key]
    }
    return undefined
  }
  return undefined
}

/**
 * ConnectionManager — create/start/stop/reconnect/heartbeat/health for all adapters.
 */
export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>()
  private readonly reconnect = new Map<string, ReconnectPolicy>()
  readonly heartbeat = new HeartbeatManager()
  private factory: AdapterFactory
  private statusListeners = new Set<(id: string, status: ConnectionStatus) => void>()

  constructor(factory: AdapterFactory = defaultFactory) {
    this.factory = factory
    this.heartbeat.setLostHandler((connectionId) => {
      const managed = this.connections.get(connectionId)
      if (!managed) {
        return
      }
      managed.status = CS.DEGRADED
      this.emitStatus(connectionId, CS.DEGRADED)
      void this.scheduleReconnect(connectionId)
    })
  }

  setFactory(factory: AdapterFactory): void {
    this.factory = factory
  }

  onStatus(listener: (id: string, status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private emitStatus(id: string, status: ConnectionStatus): void {
    for (const listener of this.statusListeners) {
      listener(id, status)
    }
  }

  create(partial: Partial<ConnectionConfig> & { type: ProtocolType; name: string }): ManagedConnection {
    const id = partial.id ?? nextId('conn')
    if (partial.environment === EnvironmentName.Production && partial.autoConnect) {
      throw new Error('Auto Connect to Production is forbidden by default')
    }
    const config: ConnectionConfig = {
      id,
      name: partial.name,
      type: partial.type,
      enabled: partial.enabled ?? true,
      autoConnect: partial.autoConnect ?? false,
      environment: partial.environment ?? EnvironmentName.Development,
      permission: partial.permission ?? AccessPermission.READ_WRITE,
      reconnect: partial.reconnect ?? defaultReconnectConfig(),
      heartbeat: partial.heartbeat ?? defaultHeartbeatConfig(),
      updateMode: partial.updateMode ?? 'EVENT_DRIVEN',
      settings: partial.settings ?? {},
      secrets: partial.secrets,
    }
    const adapter = this.factory(config)
    const managed: ManagedConnection = {
      config,
      adapter,
      status: CS.DISCONNECTED,
    }
    this.connections.set(id, managed)
    this.reconnect.set(id, new ReconnectPolicy(config.reconnect))
    this.heartbeat.configure(id, config.heartbeat)
    auditLog.record('CONNECTION_CREATE', 'system', id, config.type)
    return managed
  }

  delete(id: string): void {
    void this.stop(id)
    this.connections.delete(id)
    this.reconnect.get(id)?.clear()
    this.reconnect.delete(id)
    auditLog.record('CONNECTION_DELETE', 'system', id)
  }

  get(id: string): ManagedConnection | undefined {
    return this.connections.get(id)
  }

  list(): ManagedConnection[] {
    return [...this.connections.values()]
  }

  async start(id: string): Promise<void> {
    const managed = this.connections.get(id)
    if (!managed) {
      throw new Error(`Connection not found: ${id}`)
    }
    if (!managed.config.enabled) {
      throw new Error(`Connection disabled: ${id}`)
    }
    managed.status = CS.CONNECTING
    this.emitStatus(id, CS.CONNECTING)
    try {
      await managed.adapter.connect()
      managed.status = CS.CONNECTED
      this.reconnect.get(id)?.reset()
      this.heartbeat.start(id, () => {
        managed.adapter.getStatus()
        this.heartbeat.beat(id)
      })
      this.emitStatus(id, CS.CONNECTED)
      auditLog.record('CONNECTION_START', 'system', id)
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'TX',
        address: 'connect',
        value: true,
        result: 'OK',
      })
    } catch (error) {
      managed.status = CS.ERROR
      this.emitStatus(id, CS.ERROR)
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'TX',
        address: 'connect',
        value: null,
        result: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async stop(id: string): Promise<void> {
    const managed = this.connections.get(id)
    if (!managed) {
      return
    }
    this.heartbeat.stop(id)
    this.reconnect.get(id)?.clear()
    await managed.adapter.disconnect()
    managed.status = CS.DISCONNECTED
    this.emitStatus(id, CS.DISCONNECTED)
    auditLog.record('CONNECTION_STOP', 'system', id)
  }

  async startAllAutoConnect(): Promise<void> {
    for (const managed of this.connections.values()) {
      if (managed.config.autoConnect && managed.config.environment !== EnvironmentName.Production) {
        await this.start(managed.config.id)
      }
    }
  }

  private async scheduleReconnect(id: string): Promise<void> {
    const managed = this.connections.get(id)
    const policy = this.reconnect.get(id)
    if (!managed || !policy) {
      return
    }
    managed.status = CS.RECONNECTING
    this.emitStatus(id, CS.RECONNECTING)
    const scheduled = policy.schedule(async () => {
      try {
        await this.start(id)
      } catch {
        void this.scheduleReconnect(id)
      }
    })
    if (!scheduled) {
      managed.status = CS.ERROR
      this.emitStatus(id, CS.ERROR)
    }
  }

  async read(id: string, address: string): Promise<unknown> {
    const managed = this.require(id)
    this.assertPermission(managed, 'read')
    if (networkFaultInjector.shouldDrop(id)) {
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'RX',
        address,
        value: null,
        result: 'DROPPED',
      })
      throw new Error('Packet loss / disconnect injected')
    }
    await networkFaultInjector.applyDelay(id)
    const started = Date.now()
    try {
      const value = await managed.adapter.read(address)
      this.heartbeat.beat(id)
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'RX',
        address,
        value,
        latencyMs: Date.now() - started,
        result: 'OK',
      })
      return value
    } catch (error) {
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'RX',
        address,
        value: null,
        latencyMs: Date.now() - started,
        result: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async write(id: string, address: string, value: unknown): Promise<void> {
    const managed = this.require(id)
    this.assertPermission(managed, 'write')
    if (networkFaultInjector.shouldDrop(id)) {
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'TX',
        address,
        value,
        result: 'DROPPED',
      })
      throw new Error('Packet loss / disconnect injected')
    }
    await networkFaultInjector.applyDelay(id)
    const started = Date.now()
    try {
      await managed.adapter.write(address, value)
      this.heartbeat.beat(id)
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'TX',
        address,
        value,
        latencyMs: Date.now() - started,
        result: 'OK',
      })
      auditLog.record('PROTOCOL_WRITE', 'system', id, address)
    } catch (error) {
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'TX',
        address,
        value,
        latencyMs: Date.now() - started,
        result: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async subscribe(id: string, address: string, callback: (value: unknown) => void): Promise<() => void> {
    const managed = this.require(id)
    return managed.adapter.subscribe(address, (value) => {
      this.heartbeat.beat(id)
      protocolMonitor.log({
        protocol: managed.config.type,
        connectionId: id,
        direction: 'RX',
        address,
        value,
        result: 'OK',
      })
      callback(value)
    })
  }

  async test(id: string): Promise<ConnectionTestResult> {
    const managed = this.require(id)
    if (managed.adapter.testConnection) {
      return managed.adapter.testConnection()
    }
    const startedAt = Date.now()
    try {
      await this.start(id)
      return {
        ok: true,
        stages: [
          { stage: 'DNS', ok: true, message: 'ok' },
          { stage: 'TCP', ok: true, message: 'ok' },
          { stage: 'AUTHENTICATION', ok: true, message: 'ok' },
          { stage: 'READ', ok: true, message: 'ok' },
          { stage: 'WRITE', ok: true, message: 'n/a' },
          { stage: 'SUBSCRIPTION', ok: true, message: 'n/a' },
        ],
        startedAt,
        finishedAt: Date.now(),
      }
    } catch (error) {
      return {
        ok: false,
        stages: [
          {
            stage: 'TCP',
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        startedAt,
        finishedAt: Date.now(),
      }
    }
  }

  /** Export configs with secrets as references (no plaintext passwords). */
  exportConfigs(): ConnectionConfig[] {
    return this.list().map((managed) => sanitizeConfig(managed.config))
  }

  loadConfigs(configs: ConnectionConfig[]): void {
    for (const config of configs) {
      if (this.connections.has(config.id)) {
        continue
      }
      this.create(config)
    }
  }

  clear(): void {
    for (const id of [...this.connections.keys()]) {
      void this.stop(id)
    }
    this.connections.clear()
    this.reconnect.clear()
    this.heartbeat.stopAll()
  }

  private require(id: string): ManagedConnection {
    const managed = this.connections.get(id)
    if (!managed) {
      throw new Error(`Connection not found: ${id}`)
    }
    return managed
  }

  private assertPermission(managed: ManagedConnection, op: 'read' | 'write'): void {
    if (op === 'write' && managed.config.permission === AccessPermission.READ_ONLY) {
      throw new Error(`Write denied: connection ${managed.config.id} is READ_ONLY`)
    }
  }
}

export function sanitizeConfig(config: ConnectionConfig): ConnectionConfig {
  const secrets: ConnectionConfig['secrets'] = { ...config.secrets }
  if (typeof config.settings.password === 'string' && config.settings.password) {
    secrets.password = { kind: 'secret-ref', key: `CONN_${config.id}_PASSWORD` }
  }
  const settings = { ...config.settings }
  delete settings.password
  return {
    ...config,
    settings,
    secrets,
    autoConnect: config.environment === EnvironmentName.Production ? false : config.autoConnect,
  }
}

export const connectionManager = new ConnectionManager()
