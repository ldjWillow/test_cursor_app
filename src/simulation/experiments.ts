import type { AgvComparisonRow, ExperimentResult, ProjectDocument, ReplicationSummary } from '../types/index.ts'
import { createEngine } from './SimulationEngine.ts'
import { experimentManager, defaultExperiment } from '../experiment/ExperimentManager.ts'
import { defaultAgvScenarios } from '../experiment/scenarioOverrides.ts'
import { scenarioHash } from '../utils/scenarioHash.ts'

export function runProjectToCompletion(project: ProjectDocument) {
  const engine = createEngine(project)
  engine.runUntilEmpty()
  return engine.getState()
}

/**
 * Compare AGV fleet sizes against a full snapshot of the current model
 * (tasks, topology, params, seed). Each scenario runs in an isolated engine.
 */
export function compareAgvCounts(
  base: ProjectDocument,
  counts: number[] = [3, 4, 5, 6],
): AgvComparisonRow[] {
  const hash = scenarioHash(base)
  const taskCount = base.simulationConfig.taskCount || base.tasks.length
  const definition = {
    ...defaultExperiment(),
    scenarios: defaultAgvScenarios(counts),
    replications: 1,
    baseSeed: base.simulationConfig.seed,
  }
  const { summaries } = experimentManager.runExperiment(structuredClone(base), definition)
  return summaries.map((summary) => ({
    agvCount: summary.agvCount,
    throughput: summary.throughput.mean,
    utilization: summary.agvUtilization.mean,
    averageWaitingTime: summary.averageWaitingTime.mean,
    averageCycleTime: summary.averageCycleTime.mean,
    completedTasks: Math.round(summary.completedTasks.mean),
    simulationTime: summary.results[0]?.simulationTime ?? 0,
    emptyTravelRatio: summary.emptyTravelRatio.mean,
    routeWaitingTime: summary.routeWaitingTime.mean,
    taskCount,
    scenarioHash: hash,
    seed: base.simulationConfig.seed,
  }))
}

export function runAgvExperiment(
  base: ProjectDocument,
  counts: number[] = [3, 4, 5, 6],
  replications = 1,
  baseSeed = 1001,
): { results: ExperimentResult[]; summaries: ReplicationSummary[] } {
  return experimentManager.runExperiment(structuredClone(base), {
    id: 'exp-agv-count',
    name: 'AGV count experiment',
    scenarios: defaultAgvScenarios(counts),
    replications,
    baseSeed,
  })
}
