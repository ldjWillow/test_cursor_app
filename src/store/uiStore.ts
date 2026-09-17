import { create } from 'zustand'

export type AppModule =
  | 'overview'
  | 'model'
  | 'simulation'
  | 'experiment'
  | 'twin3d'
  | 'commissioning'
  | 'connections'
  | 'signals'
  | 'protocol'
  | 'eventLog'
  | 'replay'

export interface UiStore {
  activeModule: AppModule
  leftCollapsed: boolean
  rightCollapsed: boolean
  bottomCollapsed: boolean
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  setActiveModule: (module: AppModule) => void
  toggleLeft: () => void
  toggleRight: () => void
  toggleBottom: () => void
  setLeftWidth: (width: number) => void
  setRightWidth: (width: number) => void
  setBottomHeight: (height: number) => void
}

export const useUiStore = create<UiStore>((set) => ({
  activeModule: 'model',
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: false,
  leftWidth: 200,
  rightWidth: 260,
  bottomHeight: 240,
  setActiveModule: (activeModule) => set({ activeModule }),
  toggleLeft: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),
  toggleRight: () => set((state) => ({ rightCollapsed: !state.rightCollapsed })),
  toggleBottom: () => set((state) => ({ bottomCollapsed: !state.bottomCollapsed })),
  setLeftWidth: (leftWidth) => set({ leftWidth: Math.max(160, Math.min(320, leftWidth)) }),
  setRightWidth: (rightWidth) => set({ rightWidth: Math.max(200, Math.min(360, rightWidth)) }),
  setBottomHeight: (bottomHeight) => set({ bottomHeight: Math.max(160, Math.min(420, bottomHeight)) }),
}))
