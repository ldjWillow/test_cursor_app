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
  /** Bumps whenever the DES engine is rebuilt. */
  simulationRevision: number
  /** Bumps whenever comparison/experiment results are produced. */
  resultRevision: number
  /** True when the model changed after the last valid result set. */
  resultsStale: boolean
  modelStaleMessage?: string
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
  setSimulationRevision: (revision: number) => void
  invalidateResults: (reason?: string) => void
  clearStaleResults: (clearData?: boolean) => void
}

const emptySnapshot = (): SimulationSnapshot => ({
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
})

export const useSimulationStore = create<SimulationViewState>((set, get) => ({
  status: Status.Idle,
  speed: 10,
  snapshot: emptySnapshot(),
  comparison: [],
  experimentResults: [],
  experimentSummaries: [],
  scenarioDeltas: [],
  validationErrors: [],
  simulationRevision: 0,
  resultRevision: 0,
  resultsStale: false,
  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),
  setSnapshot: (snapshot) =>
    set({
      snapshot,
      status: snapshot.status,
      resultsStale: false,
      modelStaleMessage: undefined,
    }),
  setComparison: (comparison) =>
    set({
      comparison,
      resultRevision: get().resultRevision + 1,
      resultsStale: false,
      modelStaleMessage: undefined,
    }),
  setExperiment: (experimentResults, experimentSummaries, scenarioDeltas) =>
    set({
      experimentResults,
      experimentSummaries,
      scenarioDeltas,
      resultRevision: get().resultRevision + 1,
      resultsStale: false,
      modelStaleMessage: undefined,
    }),
  setSelectedLogEntity: (selectedLogEntity) => set({ selectedLogEntity }),
  setError: (lastError) => set({ lastError }),
  setValidationErrors: (validationErrors) => set({ validationErrors }),
  setSimulationRevision: (simulationRevision) => set({ simulationRevision }),
  invalidateResults: (reason = '模型已修改，请重置或重新运行') => {
    const hasResults =
      get().comparison.length > 0 ||
      get().experimentResults.length > 0 ||
      get().snapshot.time > 0 ||
      get().snapshot.eventQueue.length > 0 ||
      get().snapshot.statistics.completedCount > 0 ||
      get().snapshot.completedTasks > 0
    set({
      resultsStale: true,
      modelStaleMessage: reason,
      comparison: [],
      experimentResults: [],
      experimentSummaries: [],
      scenarioDeltas: [],
      snapshot: hasResults
        ? {
            ...emptySnapshot(),
            status: get().status === Status.Running ? Status.Paused : get().status,
          }
        : get().snapshot,
      resultRevision: get().resultRevision + 1,
    })
  },
  clearStaleResults: (clearData = true) =>
    set({
      resultsStale: false,
      modelStaleMessage: undefined,
      ...(clearData
        ? {
            comparison: [],
            experimentResults: [],
            experimentSummaries: [],
            scenarioDeltas: [],
          }
        : {}),
    }),
}))
