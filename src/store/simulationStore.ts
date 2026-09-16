import { create } from 'zustand'
import type {
  AgvComparisonRow,
  SimulationSnapshot,
  SimulationSpeed,
  SimulationStatus,
} from '../types/index.ts'
import { SimulationStatus as Status } from '../types/index.ts'
import { emptyStatistics } from './emptyStatistics.ts'

export interface SimulationViewState {
  status: SimulationStatus
  speed: SimulationSpeed
  snapshot: SimulationSnapshot
  comparison: AgvComparisonRow[]
  lastError?: string
  setStatus: (status: SimulationStatus) => void
  setSpeed: (speed: SimulationSpeed) => void
  setSnapshot: (snapshot: SimulationSnapshot) => void
  setComparison: (comparison: AgvComparisonRow[]) => void
  setError: (message?: string) => void
}

export const useSimulationStore = create<SimulationViewState>((set) => ({
  status: Status.Idle,
  speed: 10,
  snapshot: {
    time: 0,
    status: Status.Idle,
    eventQueue: [],
    waitingTasks: 0,
    runningTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    devices: [],
    statistics: emptyStatistics(),
    logs: [],
  },
  comparison: [],
  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),
  setSnapshot: (snapshot) => set({ snapshot, status: snapshot.status }),
  setComparison: (comparison) => set({ comparison }),
  setError: (lastError) => set({ lastError }),
}))
