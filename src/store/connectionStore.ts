import { create } from 'zustand'
import { nextId } from '../utils/id.ts'

export type ConnectionProtocol = 'HTTP' | 'WebSocket' | 'MQTT' | 'OPC UA' | 'Modbus TCP'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionConfig {
  id: string
  name: string
  protocol: ConnectionProtocol
  host: string
  port: number
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

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [
    {
      id: 'conn-local-http',
      name: '本地 Gateway HTTP',
      protocol: 'HTTP',
      host: '127.0.0.1',
      port: 8787,
      autoReconnect: true,
      status: 'disconnected',
    },
    {
      id: 'conn-local-ws',
      name: '本地 Gateway WebSocket',
      protocol: 'WebSocket',
      host: '127.0.0.1',
      port: 8787,
      autoReconnect: true,
      status: 'disconnected',
    },
  ],
  protocolLog: [],
  protocolPaused: false,
  addConnection: (input) => {
    const id = nextId('conn')
    set({
      connections: [...get().connections, { ...input, id, status: 'disconnected' }],
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
    try {
      if (conn.protocol === 'HTTP') {
        const response = await fetch(`http://${conn.host}:${conn.port}/health`, {
          signal: AbortSignal.timeout(2500),
        }).catch(async () => fetch(`http://${conn.host}:${conn.port}/`, { signal: AbortSignal.timeout(2500) }))
        if (!response.ok && response.status >= 500) {
          throw new Error(`HTTP ${response.status}`)
        }
      } else if (conn.protocol === 'WebSocket') {
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://${conn.host}:${conn.port}`)
          const timer = window.setTimeout(() => {
            ws.close()
            reject(new Error('WebSocket timeout'))
          }, 2500)
          ws.onopen = () => {
            window.clearTimeout(timer)
            ws.close()
            resolve()
          }
          ws.onerror = () => {
            window.clearTimeout(timer)
            reject(new Error('WebSocket error'))
          }
        })
      } else {
        // Stubs for MQTT / OPC UA / Modbus — mark connected for demo wiring.
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      get().updateConnection(id, { status: 'connected', lastConnectedAt: Date.now(), lastError: undefined })
      if (!get().protocolPaused) {
        get().appendProtocolLog({
          time: Date.now(),
          protocol: conn.protocol,
          direction: 'TX',
          address: `${conn.host}:${conn.port}`,
          raw: 'CONNECT',
          parsed: '握手成功',
          latencyMs: Date.now() - started,
          result: 'ok',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'connection failed'
      get().updateConnection(id, { status: 'error', lastError: message })
      if (!get().protocolPaused) {
        get().appendProtocolLog({
          time: Date.now(),
          protocol: conn.protocol,
          direction: 'TX',
          address: `${conn.host}:${conn.port}`,
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
    get().updateConnection(id, { status: 'disconnected' })
    if (conn && !get().protocolPaused) {
      get().appendProtocolLog({
        time: Date.now(),
        protocol: conn.protocol,
        direction: 'TX',
        address: `${conn.host}:${conn.port}`,
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
