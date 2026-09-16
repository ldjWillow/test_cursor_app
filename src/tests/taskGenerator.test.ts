import { describe, expect, it } from 'vitest'
import { RandomGenerator } from '../utils/RandomGenerator.ts'
import { TaskGenerator } from '../simulation/TaskGenerator.ts'
import { tasksPerHourAt, nextDemandInterval } from '../simulation/DemandProfile.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { agvScenario } from '../domain/base/scenarios.ts'
import { SCHEMA_VERSION } from '../types/index.ts'

describe('RandomGenerator seed reproducibility', () => {
  it('produces identical sequences for the same seed', () => {
    const a = new RandomGenerator(12345)
    const b = new RandomGenerator(12345)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('changes sequence when seed changes', () => {
    const a = new RandomGenerator(1)
    const b = new RandomGenerator(2)
    expect(a.next()).not.toEqual(b.next())
  })
})

describe('TaskGenerator', () => {
  it('builds fixed-interval tasks', () => {
    const generator = new TaskGenerator(new RandomGenerator(1))
    const project = agvScenario(2, 0)
    project.tasks = []
    project.simulationConfig = {
      seed: 1,
      taskCount: 5,
      taskSourceId: 'station-a',
      taskTargetId: 'station-b',
      taskInterval: 30,
      taskGenerator: {
        mode: 'fixed',
        interval: 30,
        sourceId: 'station-a',
        targetId: 'station-b',
        startTime: 0,
        maxTasks: 5,
      },
    }
    const plan = generator.plan(project)
    expect(plan.dynamic).toBe(false)
    expect(plan.tasks).toHaveLength(5)
    expect(plan.tasks.map((task) => task.createTime)).toEqual([0, 30, 60, 90, 120])
  })

  it('marks exponential mode as dynamic', () => {
    const generator = new TaskGenerator(new RandomGenerator(1))
    const project = agvScenario(1, 0)
    project.tasks = []
    project.simulationConfig.taskGenerator = {
      mode: 'exponential',
      interval: 20,
      sourceId: 'station-a',
      targetId: 'station-b',
      startTime: 0,
      maxTasks: 10,
    }
    expect(generator.plan(project).dynamic).toBe(true)
  })
})

describe('DemandProfile', () => {
  it('resolves tasks/hour by period', () => {
    const profile = [
      { startTime: 0, endTime: 3600, tasksPerHour: 120 },
      { startTime: 3600, endTime: 7200, tasksPerHour: 60 },
      { startTime: 7200, endTime: 10800, tasksPerHour: 180 },
    ]
    expect(tasksPerHourAt(profile, 10)).toBe(120)
    expect(tasksPerHourAt(profile, 4000)).toBe(60)
    expect(tasksPerHourAt(profile, 8000)).toBe(180)
  })

  it('returns positive inter-arrival during peak', () => {
    const random = new RandomGenerator(42)
    const delay = nextDemandInterval(
      [{ startTime: 0, endTime: 3600, tasksPerHour: 120 }],
      100,
      random,
    )
    expect(delay).toBeGreaterThan(0)
  })
})

describe('Seeded simulation reproducibility', () => {
  it('matches KPIs for same project+seed', () => {
    const base = agvScenario(3, 40)
    base.schemaVersion = SCHEMA_VERSION
    base.simulationConfig.seed = 12345
    const a = createEngine(structuredClone(base))
    a.runUntilEmpty()
    const b = createEngine(structuredClone(base))
    b.runUntilEmpty()
    expect(a.getState().time).toBe(b.getState().time)
    expect(a.getState().completedTasks).toBe(b.getState().completedTasks)
    expect(a.getState().statistics.throughput).toBe(b.getState().statistics.throughput)
    expect(a.getState().statistics.averageWaitingTime).toBe(b.getState().statistics.averageWaitingTime)
  })
})
