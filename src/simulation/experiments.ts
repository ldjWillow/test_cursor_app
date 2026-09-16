import type { AgvComparisonRow, ProjectDocument } from '../types/index.ts'
import { agvScenario } from '../domain/base/scenarios.ts'
import { createEngine } from './SimulationEngine.ts'

export function runProjectToCompletion(project: ProjectDocument) {
  const engine = createEngine(project)
  engine.runUntilEmpty()
  return engine.getState()
}

export function compareAgvCounts(
  counts: number[] = [3, 4, 5, 6],
  taskCount = 100,
): AgvComparisonRow[] {
  return counts.map((agvCount) => {
    const snapshot = runProjectToCompletion(agvScenario(agvCount, taskCount))
    return {
      agvCount,
      throughput: snapshot.statistics.throughput,
      utilization: snapshot.statistics.agvUtilization,
      averageWaitingTime: snapshot.statistics.averageWaitingTime,
      averageCycleTime: snapshot.statistics.averageCycleTime,
      completedTasks: snapshot.completedTasks,
      simulationTime: snapshot.time,
    }
  })
}
