import { create } from 'zustand'
import type { DigitalTwinState, OperatingMode, ViewMode } from '../twin/types.ts'
import { emptyDigitalTwinState } from '../twin/types.ts'

export interface DigitalTwinStore {
  twin: DigitalTwinState
  viewMode: ViewMode
  operatingMode: OperatingMode
  highlightedDeviceId?: string
  setTwin: (twin: DigitalTwinState) => void
  setViewMode: (mode: ViewMode) => void
  setOperatingMode: (mode: OperatingMode) => void
  setHighlightedDeviceId: (id?: string) => void
  selectDevice: (id?: string) => void
}

export const useDigitalTwinStore = create<DigitalTwinStore>((set, get) => ({
  twin: emptyDigitalTwinState(),
  viewMode: '2d',
  operatingMode: 'simulation',
  setTwin: (twin) => set({ twin }),
  setViewMode: (viewMode) => set({ viewMode }),
  setOperatingMode: (operatingMode) =>
    set({
      operatingMode,
      twin: { ...get().twin, operatingMode },
    }),
  setHighlightedDeviceId: (highlightedDeviceId) => set({ highlightedDeviceId }),
  selectDevice: (id) => {
    const current = get()
    if (current.highlightedDeviceId === id && current.twin.selectedDeviceId === id) {
      return
    }
    set({
      highlightedDeviceId: id,
      twin: { ...current.twin, selectedDeviceId: id },
    })
  },
}))
