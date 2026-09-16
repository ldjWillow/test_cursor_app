import { describe, expect, it } from 'vitest'
import { standardWarehouseScenario } from '../domain/base/scenarios.ts'
import { experimentManager } from '../experiment/ExperimentManager.ts'
import { defaultAgvScenarios } from '../experiment/scenarioOverrides.ts'
import { modelValidator } from '../validation/ModelValidator.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'

describe('Standard warehouse V0.2 acceptance', () => {
  it('validates and completes a reduced standard scene', () => {
    const project = standardWarehouseScenario(4, 100)
    expect(modelValidator.validate(project)).toEqual([])
    const engine = createEngine(project)
    engine.runUntilEmpty()
    const state = engine.getState()
    expect(state.completedTasks).toBe(100)
    expect(state.statistics.throughput).toBeGreaterThan(0)
    expect(state.eventLog.length).toBeGreaterThan(0)
  })

  it('compares AGV scenarios on the standard layout', () => {
    const base = standardWarehouseScenario(3, 80)
    const { summaries, results } = experimentManager.runExperiment(base, {
      id: 'std',
      name: 'standard',
      scenarios: defaultAgvScenarios([3, 4, 5, 6]),
      replications: 1,
      baseSeed: 1001,
    })
    expect(results).toHaveLength(4)
    expect(summaries).toHaveLength(4)
    expect(summaries.every((item) => item.completedTasks.mean === 80)).toBe(true)
    const deltas = experimentManager.compareSummaries(summaries)
    expect(deltas.length).toBe(3)
  }, 60_000)
})
