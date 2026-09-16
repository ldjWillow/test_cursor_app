import type { DemandPeriod, TransportTask } from '../types/index.ts'
import { TaskStatus } from '../types/index.ts'
import type { RandomGenerator } from '../utils/RandomGenerator.ts'
import { nextId } from '../utils/id.ts'

/**
 * Resolve tasks/hour for a simulation time from a demand profile.
 * Periods are half-open [start, end). Last matching period wins if overlapping.
 */
export function tasksPerHourAt(profile: DemandPeriod[], time: number): number {
  let rate = 0
  for (const period of profile) {
    if (time >= period.startTime && time < period.endTime) {
      rate = period.tasksPerHour
    }
  }
  return rate
}

export function nextDemandInterval(
  profile: DemandPeriod[],
  time: number,
  random: RandomGenerator,
): number | undefined {
  const rate = tasksPerHourAt(profile, time)
  if (rate <= 0) {
    const next = profile.find((period) => period.startTime > time && period.tasksPerHour > 0)
    if (!next) {
      return undefined
    }
    return next.startTime - time
  }
  return random.nextInterArrivalHours(rate)
}

export interface GeneratedTaskSpec {
  createTime: number
  sourceId: string
  targetId: string
  priority: number
}

export function buildFixedIntervalTasks(
  count: number,
  interval: number,
  sourceId: string,
  targetId: string,
  startTime = 0,
): TransportTask[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `task-${index + 1}`,
    sourceId,
    targetId,
    createTime: startTime + index * interval,
    priority: index + 1,
    status: TaskStatus.Waiting,
  }))
}

export function createTransportTask(spec: GeneratedTaskSpec): TransportTask {
  return {
    id: nextId('task'),
    sourceId: spec.sourceId,
    targetId: spec.targetId,
    createTime: spec.createTime,
    priority: spec.priority,
    status: TaskStatus.Waiting,
  }
}
