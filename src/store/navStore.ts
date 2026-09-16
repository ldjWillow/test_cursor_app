import { create } from 'zustand'

export type PrimaryNav =
  | 'model'
  | 'simulation'
  | 'experiments'
  | 'twin3d'
  | 'commissioning'
  | 'connections'
  | 'signals'
  | 'protocol'
  | 'replay'

interface NavStore {
  primaryNav: PrimaryNav
  setPrimaryNav: (nav: PrimaryNav) => void
}

export const useNavStore = create<NavStore>((set) => ({
  primaryNav: 'model',
  setPrimaryNav: (primaryNav) => set({ primaryNav }),
}))
