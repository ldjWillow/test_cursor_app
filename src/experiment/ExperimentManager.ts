import type {
  ExperimentDefinition,
  ExperimentResult,
  ProjectDocument,
  ReplicationSummary,
  ScenarioDefinition,
  ScenarioDelta,
  WaitingStatistics,
} from '../types/index.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { applyScenarioOverrides, defaultAgvScenarios } from './scenarioOverrides.ts'

function emptyWaiting(): WaitingStatistics {
  return {
    taskWaitingTime: 0,
    routeWaitingTime: 0,
    resourceWaitingTime: 0,
    loadingWaitingTime: 0,
  }
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function std(values: number[]): number {
  if (values.length <= 1) {
    return 0
  }
  const m = mean(values)
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function summarizeMetric(values: number[]): { mean: number; std: number; min: number; max: number } {
  if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0 }
  }
  return {
    mean: mean(values),
    std: std(values),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function pctDelta(from: number, to: number): number {
  if (Math.abs(from) < 1e-9) {
    return to === 0 ? 0 : 100
  }
  return ((to - from) / Math.abs(from)) * 100
}

export class ExperimentManager {
  runScenario(
    base: ProjectDocument,
    scenario: ScenarioDefinition,
    seed: number,
    replication = 0,
  ): ExperimentResult {
    const project = applyScenarioOverrides(base, { ...scenario.overrides, seed })
    const engine = createEngine(project)
    engine.runUntilEmpty()
    const snapshot = engine.getState()
    const agvCount = project.devices.filter((device) => device.type === 'agv').length
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      agvCount,
      seed,
      replication,
      throughput: snapshot.statistics.throughput,
      averageWaitingTime: snapshot.statistics.averageWaitingTime,
      averageCycleTime: snapshot.statistics.averageCycleTime,
      completedTasks: snapshot.completedTasks,
      agvUtilization: snapshot.statistics.agvUtilization,
      conveyorUtilization: snapshot.statistics.conveyorUtilization,
      stackerUtilization: snapshot.statistics.stackerUtilization,
      emptyTravelRatio: snapshot.statistics.emptyTravelRatio,
      routeWaitingTime: snapshot.statistics.routeWaitingTime,
      waiting: snapshot.statistics.waiting ?? emptyWaiting(),
      simulationTime: snapshot.time,
      bottlenecks: snapshot.statistics.bottlenecks,
    }
  }

  runExperiment(
    base: ProjectDocument,
    definition: ExperimentDefinition,
  ): { results: ExperimentResult[]; summaries: ReplicationSummary[] } {
    const results: ExperimentResult[] = []
    const replications = Math.max(1, definition.replications)
    for (const scenario of definition.scenarios) {
      for (let rep = 0; rep < replications; rep += 1) {
        const seed = definition.baseSeed + rep
        results.push(this.runScenario(base, scenario, seed, rep))
      }
    }
    return { results, summaries: this.summarize(results) }
  }

  summarize(results: ExperimentResult[]): ReplicationSummary[] {
    const byScenario = new Map<string, ExperimentResult[]>()
    for (const result of results) {
      const list = byScenario.get(result.scenarioId) ?? []
      list.push(result)
      byScenario.set(result.scenarioId, list)
    }
    return [...byScenario.entries()].map(([scenarioId, list]) => {
      const first = list[0]!
      return {
        scenarioId,
        scenarioName: first.scenarioName,
        agvCount: first.agvCount,
        replications: list.length,
        throughput: summarizeMetric(list.map((item) => item.throughput)),
        averageWaitingTime: summarizeMetric(list.map((item) => item.averageWaitingTime)),
        averageCycleTime: summarizeMetric(list.map((item) => item.averageCycleTime)),
        agvUtilization: summarizeMetric(list.map((item) => item.agvUtilization)),
        routeWaitingTime: summarizeMetric(list.map((item) => item.routeWaitingTime)),
        emptyTravelRatio: summarizeMetric(list.map((item) => item.emptyTravelRatio)),
        completedTasks: summarizeMetric(list.map((item) => item.completedTasks)),
        results: list,
      }
    })
  }

  compareSummaries(summaries: ReplicationSummary[]): ScenarioDelta[] {
    const ordered = [...summaries].sort((a, b) => a.agvCount - b.agvCount)
    const deltas: ScenarioDelta[] = []
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i]!
      const to = ordered[i + 1]!
      deltas.push({
        fromScenarioId: from.scenarioId,
        toScenarioId: to.scenarioId,
        fromAgvCount: from.agvCount,
        toAgvCount: to.agvCount,
        throughputDeltaPct: pctDelta(from.throughput.mean, to.throughput.mean),
        averageWaitingDeltaPct: pctDelta(from.averageWaitingTime.mean, to.averageWaitingTime.mean),
        agvUtilizationDeltaPct: pctDelta(from.agvUtilization.mean, to.agvUtilization.mean),
        routeWaitingDeltaPct: pctDelta(from.routeWaitingTime.mean, to.routeWaitingTime.mean),
      })
    }
    return deltas
  }
}

export function defaultExperiment(name = 'AGV count sweep'): ExperimentDefinition {
  return {
    id: 'exp-agv-count',
    name,
    scenarios: defaultAgvScenarios([3, 4, 5, 6]),
    replications: 1,
    baseSeed: 1001,
  }
}

export const experimentManager = new ExperimentManager()
