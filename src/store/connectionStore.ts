import { create } from 'zustand'
import { nextId } from '../utils/id.ts'
import {
  buildConnectionUrl,
  connectionErrorMessage,
  ConnectionEndpointError,
  type ConnectionErrorCode,
} from '../utils/connectionEndpoint.ts'

export type ConnectionProtocol = 'HTTP' | 'WebSocket' | 'MQTT' | 'OPC UA' | 'Modbus TCP'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type ConnectionTransport = 'same-origin' | 'custom'

export interface ConnectionConfig {
  id: string
  name: string
  protocol: ConnectionProtocol
  transport: ConnectionTransport
  host: string
  port: number
  /** Base path for same-origin gateway proxy, e.g. `/gateway`. */
  path?: string
  autoReconnect: boolean
  status: ConnectionStatus
  lastError?: string
  lastConnectedAt?: number
}

export interface ProtocolLogEntry {
  id: string
  time: number
  protocol: ConnectionProtocol
  direction: 'RX' | 'TX'
  deviceId?: string
  address?: string
  topic?: string
  raw: string
  parsed?: string
  latencyMs?: number
  result: 'ok' | 'error'
}

export interface ConnectionStore {
  connections: ConnectionConfig[]
  protocolLog: ProtocolLogEntry[]
  protocolPaused: boolean
  addConnection: (input: Omit<ConnectionConfig, 'id' | 'status'>) => string
  updateConnection: (id: string, patch: Partial<ConnectionConfig>) => void
  removeConnection: (id: string) => void
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => void
  appendProtocolLog: (entry: Omit<ProtocolLogEntry, 'id'>) => void
  clearProtocolLog: () => void
  setProtocolPaused: (paused: boolean) => void
}

function endpointAddress(conn: ConnectionConfig): string {
  try {
    return buildConnectionUrl(conn).display
  } catch {
    if (conn.transport === 'same-origin') {
      return `${conn.path || '/gateway'}（同源）`
    }
    return `${conn.host}:${conn.port}`
  }
}

function classifyConnectError(error: unknown): { code: ConnectionErrorCode; detail?: string } {
  if (error instanceof ConnectionEndpointError) {
    return { code: error.code, detail: error.detail }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'TIMEOUT' }
  }
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase()
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors')) {
      return { code: 'CORS_BLOCKED', detail: error.message }
    }
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout')) {
      return { code: 'TIMEOUT' }
    }
    if (msg.includes('mixed') || msg.includes('insecure')) {
      return { code: 'MIXED_CONTENT', detail: error.message }
    }
    return { code: 'GENERIC', detail: error.message }
  }
  return { code: 'GENERIC' }
}

async function probeHttp(url: string): Promise<void> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500), credentials: 'same-origin' })
    if (!response.ok && response.status >= 500) {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ConnectionEndpointError('TIMEOUT', 'HTTP 连接超时')
    }
    if (error instanceof TypeError) {
      throw new ConnectionEndpointError('CORS_BLOCKED', 'HTTP 请求失败（可能被 CORS 阻止）', error.message)
    }
    throw error
  }
}

function probeWebSocket(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const ws = new WebSocket(url)
    const timer = window.setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(new ConnectionEndpointError('TIMEOUT', 'WebSocket 连接超时'))
    }, 2500)
    ws.onopen = () => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      ws.close()
      resolve()
    }
    ws.onerror = () => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      reject(new ConnectionEndpointError('GENERIC', 'WebSocket 连接失败'))
    }
  })
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [
    {
      id: 'conn-gateway-http',
      name: 'Gateway HTTP（同源）',
      protocol: 'HTTP',
      transport: 'same-origin',
      host: '',
      port: 0,
      path: '/gateway',
      autoReconnect: true,
      status: 'disconnected',
    },
    {
      id: 'conn-gateway-ws',
      name: 'Gateway WebSocket（同源）',
      protocol: 'WebSocket',
      transport: 'same-origin',
      host: '',
      port: 0,
      path: '/gateway',
      autoReconnect: true,
      status: 'disconnected',
    },
  ],
  protocolLog: [],
  protocolPaused: false,
  addConnection: (input) => {
    const id = nextId('conn')
    set({
      connections: [
        ...get().connections,
        {
          ...input,
          transport: input.transport ?? 'same-origin',
          path: input.path ?? '/gateway',
          id,
          status: 'disconnected',
        },
      ],
    })
    return id
  },
  updateConnection: (id, patch) => {
    set({
      connections: get().connections.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  },
  removeConnection: (id) => {
    set({ connections: get().connections.filter((item) => item.id !== id) })
  },
  connect: async (id) => {
    const conn = get().connections.find((item) => item.id === id)
    if (!conn) {
      return
    }
    get().updateConnection(id, { status: 'connecting', lastError: undefined })
    const started = Date.now()
    const address = endpointAddress(conn)
    try {
      const { url } = buildConnectionUrl(conn)
      if (conn.protocol === 'HTTP') {
        await probeHttp(url)
      } else if (conn.protocol === 'WebSocket') {
        await probeWebSocket(url)
      } else {
        throw new ConnectionEndpointError(
          'UNSUPPORTED_PROTOCOL',
          '该协议需经网关桥接，浏览器无法直连',
          conn.protocol,
        )
      }
      get().updateConnection(id, { status: 'connected', lastConnectedAt: Date.now(), lastError: undefined })
      if (!get().protocolPaused) {
        get().appendProtocolLog({
          time: Date.now(),
          protocol: conn.protocol,
          direction: 'TX',
          address,
          raw: 'CONNECT',
          parsed: '握手成功',
          latencyMs: Date.now() - started,
          result: 'ok',
        })
      }
    } catch (error) {
      const { code, detail } = classifyConnectError(error)
      const message = connectionErrorMessage(code, detail)
      get().updateConnection(id, { status: 'error', lastError: message })
      if (!get().protocolPaused) {
        get().appendProtocolLog({
          time: Date.now(),
          protocol: conn.protocol,
          direction: 'TX',
          address,
          raw: 'CONNECT',
          parsed: message,
          latencyMs: Date.now() - started,
          result: 'error',
        })
      }
    }
  },
  disconnect: (id) => {
    const conn = get().connections.find((item) => item.id === id)
    get().updateConnection(id, { status: 'disconnected', lastError: undefined })
    if (conn && !get().protocolPaused) {
      get().appendProtocolLog({
        time: Date.now(),
        protocol: conn.protocol,
        direction: 'TX',
        address: endpointAddress(conn),
        raw: 'DISCONNECT',
        parsed: '已断开',
        result: 'ok',
      })
    }
  },
  appendProtocolLog: (entry) => {
    set({
      protocolLog: [{ id: nextId('plog'), ...entry }, ...get().protocolLog].slice(0, 500),
    })
  },
  clearProtocolLog: () => set({ protocolLog: [] }),
  setProtocolPaused: (protocolPaused) => set({ protocolPaused }),
}))
