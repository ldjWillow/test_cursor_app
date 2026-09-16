/** WarehouseSim V0.4 industrial connectivity shared types */

export const ProtocolType = {
  HTTP: 'HTTP',
  WEBSOCKET: 'WEBSOCKET',
  MQTT: 'MQTT',
  OPC_UA: 'OPC_UA',
  MODBUS_TCP: 'MODBUS_TCP',
  TCP_SOCKET: 'TCP_SOCKET',
} as const

export type ProtocolType = (typeof ProtocolType)[keyof typeof ProtocolType]

export const ConnectionStatus = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DEGRADED: 'DEGRADED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR',
} as const

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus]

export const SignalDataType = {
  BOOLEAN: 'BOOLEAN',
  INT: 'INT',
  FLOAT: 'FLOAT',
  STRING: 'STRING',
  ENUM: 'ENUM',
} as const

export type SignalDataType = (typeof SignalDataType)[keyof typeof SignalDataType]

export const SignalDirection = {
  INPUT: 'INPUT',
  OUTPUT: 'OUTPUT',
  INTERNAL: 'INTERNAL',
  BIDIRECTIONAL: 'BIDIRECTIONAL',
} as const

export type SignalDirection = (typeof SignalDirection)[keyof typeof SignalDirection]

export const SignalQuality = {
  GOOD: 'GOOD',
  UNCERTAIN: 'UNCERTAIN',
  BAD: 'BAD',
  TIMEOUT: 'TIMEOUT',
  DISCONNECTED: 'DISCONNECTED',
} as const

export type SignalQuality = (typeof SignalQuality)[keyof typeof SignalQuality]

export const ControlMode = {
  INTERNAL: 'INTERNAL',
  EXTERNAL: 'EXTERNAL',
  MANUAL: 'MANUAL',
} as const

export type ControlMode = (typeof ControlMode)[keyof typeof ControlMode]

export const CommLostBehavior = {
  KEEP_RUNNING: 'KEEP_RUNNING',
  STOP: 'STOP',
  SAFE_STOP: 'SAFE_STOP',
  FAULT: 'FAULT',
} as const

export type CommLostBehavior = (typeof CommLostBehavior)[keyof typeof CommLostBehavior]

export const SignalUpdateMode = {
  EVENT_DRIVEN: 'EVENT_DRIVEN',
  POLLING: 'POLLING',
  SCAN_CYCLE: 'SCAN_CYCLE',
} as const

export type SignalUpdateMode = (typeof SignalUpdateMode)[keyof typeof SignalUpdateMode]

export const HandshakeTemplate = {
  SIMPLE_BOOL: 'SIMPLE_BOOL',
  COMMAND_ACK: 'COMMAND_ACK',
  COMMAND_ACK_COMPLETE: 'COMMAND_ACK_COMPLETE',
  COMMAND_ID: 'COMMAND_ID',
  SEQUENCE: 'SEQUENCE',
} as const

export type HandshakeTemplate = (typeof HandshakeTemplate)[keyof typeof HandshakeTemplate]

export const TimeoutStrategy = {
  RETRY: 'RETRY',
  FAIL: 'FAIL',
  IGNORE: 'IGNORE',
} as const

export type TimeoutStrategy = (typeof TimeoutStrategy)[keyof typeof TimeoutStrategy]

export const AccessPermission = {
  READ_ONLY: 'READ_ONLY',
  READ_WRITE: 'READ_WRITE',
} as const

export type AccessPermission = (typeof AccessPermission)[keyof typeof AccessPermission]

export const EnvironmentName = {
  Development: 'Development',
  Test: 'Test',
  Production: 'Production',
} as const

export type EnvironmentName = (typeof EnvironmentName)[keyof typeof EnvironmentName]

export interface ProtocolStatus {
  id: string
  type: ProtocolType
  status: ConnectionStatus
  connected: boolean
  lastError?: string
  lastConnectedAt?: number
  lastHeartbeatAt?: number
  latencyMs?: number
  reconnectAttempts: number
}

export interface ReconnectConfig {
  initialDelayMs: number
  maxDelayMs: number
  backoff: number
  maxAttempts: number
}

export interface HeartbeatConfig {
  enabled: boolean
  intervalMs: number
  timeoutMs: number
}

export interface ConnectionTestStageResult {
  stage: 'DNS' | 'TCP' | 'AUTHENTICATION' | 'READ' | 'WRITE' | 'SUBSCRIPTION'
  ok: boolean
  message: string
  latencyMs?: number
}

export interface ConnectionTestResult {
  ok: boolean
  stages: ConnectionTestStageResult[]
  startedAt: number
  finishedAt: number
}

export interface SecretReference {
  kind: 'secret-ref'
  key: string
}

export type SecretValue = string | SecretReference

export interface ConnectionConfig {
  id: string
  name: string
  type: ProtocolType
  enabled: boolean
  autoConnect: boolean
  environment: EnvironmentName
  permission: AccessPermission
  reconnect: ReconnectConfig
  heartbeat: HeartbeatConfig
  updateMode: SignalUpdateMode
  /** Protocol-specific settings (endpoint, host, topics, etc.). */
  settings: Record<string, unknown>
  /** Sensitive fields stored as secret references when exported. */
  secrets?: Record<string, SecretValue>
}

export interface SignalDefinition {
  id: string
  name: string
  deviceId: string
  type: SignalDataType
  direction: SignalDirection
  value: unknown
  writable: boolean
  description?: string
  quality: SignalQuality
  timestamp: number
  source?: string
  forced?: boolean
  pinned?: boolean
}

export interface IndustrialSignalMapping {
  id: string
  signalId: string
  connectionId: string
  address: string
  direction: SignalDirection
  dataType: SignalDataType
  enabled: boolean
  scale?: number
  offset?: number
  updateMode?: SignalUpdateMode
  description?: string
}

export interface IoMapping {
  id: string
  deviceId: string
  ioName: string
  signalId: string
  connectionId?: string
  address?: string
  enabled: boolean
}

export interface ProtocolLogEntry {
  id: string
  time: number
  protocol: ProtocolType
  connectionId: string
  direction: 'TX' | 'RX'
  address: string
  value: unknown
  latencyMs?: number
  result: 'OK' | 'ERROR' | 'TIMEOUT' | 'DROPPED'
  message?: string
}

export interface SignalTraceEntry {
  id: string
  time: number
  signalId: string
  signalName: string
  oldValue: unknown
  newValue: unknown
  source: string
  quality: SignalQuality
}

export interface AuditLogEntry {
  id: string
  time: number
  action: string
  actor: string
  target?: string
  detail?: string
}

export interface NetworkFaultConfig {
  delayMs: number
  jitterMs: number
  packetLossPct: number
  disconnect: boolean
  slowResponseMs: number
}

export const defaultReconnectConfig = (): ReconnectConfig => ({
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  backoff: 2,
  maxAttempts: 10,
})

export const defaultHeartbeatConfig = (): HeartbeatConfig => ({
  enabled: true,
  intervalMs: 2000,
  timeoutMs: 5000,
})

export const defaultNetworkFault = (): NetworkFaultConfig => ({
  delayMs: 0,
  jitterMs: 0,
  packetLossPct: 0,
  disconnect: false,
  slowResponseMs: 0,
})
