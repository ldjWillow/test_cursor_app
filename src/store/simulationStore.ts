import { create } from 'zustand'
import type {
  AgvComparisonRow,
  ExperimentResult,
  ReplicationSummary,
  ScenarioDelta,
  SimulationLogEntry,
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
  experimentResults: ExperimentResult[]
  experimentSummaries: ReplicationSummary[]
  scenarioDeltas: ScenarioDelta[]
  selectedLogEntity?: string
  lastError?: string
  validationErrors: string[]
  setStatus: (status: SimulationStatus) => void
  setSpeed: (speed: SimulationSpeed) => void
  setSnapshot: (snapshot: SimulationSnapshot) => void
  setComparison: (comparison: AgvComparisonRow[]) => void
  setExperiment: (
    results: ExperimentResult[],
    summaries: ReplicationSummary[],
    deltas: ScenarioDelta[],
  ) => void
  setSelectedLogEntity: (entityId?: string) => void
  setError: (message?: string) => void
  setValidationErrors: (errors: string[]) => void
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
    eventLog: [] as SimulationLogEntry[],
  },
  comparison: [],
  experimentResults: [],
  experimentSummaries: [],
  scenarioDeltas: [],
  validationErrors: [],
  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),
  setSnapshot: (snapshot) => set({ snapshot, status: snapshot.status }),
  setComparison: (comparison) => set({ comparison }),
  setExperiment: (experimentResults, experimentSummaries, scenarioDeltas) =>
    set({ experimentResults, experimentSummaries, scenarioDeltas }),
  setSelectedLogEntity: (selectedLogEntity) => set({ selectedLogEntity }),
  setError: (lastError) => set({ lastError }),
  setValidationErrors: (validationErrors) => set({ validationErrors }),
}))
