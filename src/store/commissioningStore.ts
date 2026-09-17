import { create } from 'zustand'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import type { CommandMonitorEntry } from '../virtual/DeviceRegistry.ts'
import { faultManager } from '../virtual/FaultManager.ts'
import type { FaultEvent } from '../virtual/FaultManager.ts'
import { signalMapper } from '../signal/SignalMapper.ts'
import type { DeviceStatus } from '../virtual/types.ts'

export interface SignalWatchRow {
  signal: string
  value: unknown
  source: string
  quality: 'GOOD' | 'BAD' | 'TIMEOUT' | 'DISCONNECTED'
  timestamp: number
  changed: boolean
}

export interface CommissioningStore {
  revision: number
  devices: DeviceStatus[]
  commands: CommandMonitorEntry[]
  faults: FaultEvent[]
  signals: SignalWatchRow[]
  pendingCommandIds: string[]
  refresh: () => void
  markCommandPending: (commandId: string) => void
  clearPending: (commandId: string) => void
}

const previousSignalValues = new Map<string, unknown>()

export const useCommissioningStore = create<CommissioningStore>((set, get) => ({
  revision: 0,
  devices: [],
  commands: [],
  faults: [],
  signals: [],
  pendingCommandIds: [],
  refresh: () => {
    const signals = signalMapper.watchTable().map((row) => {
      const prev = previousSignalValues.get(row.signal)
      const changed = prev !== undefined && prev !== row.value
      previousSignalValues.set(row.signal, row.value)
      return {
        signal: row.signal,
        value: row.value,
        source: row.source,
        quality: 'GOOD' as const,
        timestamp: Date.now(),
        changed,
      }
    })
    set({
      revision: get().revision + 1,
      devices: deviceRegistry.list(),
      commands: [...deviceRegistry.commandLog].slice(-50).reverse(),
      faults: faultManager.listActive(),
      signals,
    })
  },
  markCommandPending: (commandId) =>
    set({ pendingCommandIds: [...get().pendingCommandIds, commandId] }),
  clearPending: (commandId) =>
    set({ pendingCommandIds: get().pendingCommandIds.filter((id) => id !== commandId) }),
}))

export function refreshCommissioning(): void {
  useCommissioningStore.getState().refresh()
}
