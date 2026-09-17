import type { ProjectDocument, TaskGeneratorConfig, TransportTask } from '../types/index.ts'
import { TaskStatus } from '../types/index.ts'
import { RandomGenerator } from '../utils/RandomGenerator.ts'
import { nextDemandInterval } from './DemandProfile.ts'
import { nextId } from '../utils/id.ts'

export interface TaskGenerationPlan {
  tasks: TransportTask[]
  /** Dynamic generation continues via events when true. */
  dynamic: boolean
}

/**
 * Precompute fixed/count-based tasks, or leave dynamic generation to the engine
 * for exponential / demand profiles.
 */
export class TaskGenerator {
  constructor(private readonly random: RandomGenerator) {}

  plan(project: ProjectDocument): TaskGenerationPlan {
    const config = project.simulationConfig.taskGenerator
    const sourceId = config?.sourceId ?? project.simulationConfig.taskSourceId
    const targetId = config?.targetId ?? project.simulationConfig.taskTargetId

    // Explicit task list in the project takes precedence when generator is absent.
    if (!config && project.tasks.length > 0) {
      return { tasks: project.tasks.map((task) => ({ ...task })), dynamic: false }
    }

    if (!sourceId || !targetId) {
      return { tasks: project.tasks.map((task) => ({ ...task })), dynamic: false }
    }

    const mode = config?.mode ?? (project.simulationConfig.taskInterval > 0 ? 'fixed' : 'fixed')
    const interval = config?.interval ?? project.simulationConfig.taskInterval
    const maxTasks = config?.maxTasks ?? project.simulationConfig.taskCount
    const startTime = config?.startTime ?? 0
    const endTime = config?.endTime

    if (mode === 'fixed' && interval <= 0) {
      // Burst: all tasks at startTime (MVP behavior).
      const count = Math.max(0, maxTasks ?? 0)
      const tasks = Array.from({ length: count }, (_, index) =>
        this.makeTask(sourceId, targetId, startTime, index + 1),
      )
      return { tasks, dynamic: false }
    }

    if (mode === 'fixed') {
      const tasks: TransportTask[] = []
      let time = startTime
      let index = 0
      while (true) {
        if (maxTasks !== undefined && maxTasks > 0 && index >= maxTasks) {
          break
        }
        if (endTime !== undefined && time > endTime) {
          break
        }
        if (maxTasks === undefined && endTime === undefined && index >= (project.simulationConfig.taskCount || 0)) {
          break
        }
        tasks.push(this.makeTask(sourceId, targetId, time, index + 1))
        index += 1
        time += interval
        if (interval <= 0) {
          break
        }
        // Safety for misconfigured generators.
        if (index > 100_000) {
          break
        }
      }
      return { tasks, dynamic: false }
    }

    // Exponential / demand: seed first arrival dynamically.
    return { tasks: [], dynamic: true }
  }

  /** Next inter-arrival for dynamic modes. */
  nextArrivalDelay(config: TaskGeneratorConfig, currentTime: number): number | undefined {
    if (config.endTime !== undefined && currentTime >= config.endTime) {
      return undefined
    }
    if (config.mode === 'exponential') {
      const ratePerSecond = 1 / Math.max(1e-6, config.interval)
      return this.random.nextExponential(ratePerSecond)
    }
    if (config.mode === 'demand' && config.demandProfile) {
      return nextDemandInterval(config.demandProfile, currentTime, this.random)
    }
    return config.interval > 0 ? config.interval : undefined
  }

  makeTask(sourceId: string, targetId: string, createTime: number, priority: number): TransportTask {
    return {
      id: nextId('task'),
      sourceId,
      targetId,
      createTime,
      priority,
      status: TaskStatus.Waiting,
    }
  }
}

export function createTaskGenerator(seed: number): TaskGenerator {
  return new TaskGenerator(new RandomGenerator(seed))
}
