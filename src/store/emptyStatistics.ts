import type { StatisticsSnapshot } from '../types/index.ts'

export function emptyStatistics(): StatisticsSnapshot {
  return {
    throughput: 0,
    completedTasks: 0,
    failedTasks: 0,
    generatedCount: 0,
    completedCount: 0,
    averageWaitingTime: 0,
    averageCycleTime: 0,
    resourceUtilization: 0,
    agvUtilization: 0,
    conveyorUtilization: 0,
    stackerUtilization: 0,
    idleTime: 0,
    busyTime: 0,
    averageQueueLength: 0,
    resources: [],
    bottlenecks: [],
  }
}
