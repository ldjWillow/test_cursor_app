import { describe, expect, it } from 'vitest'
import { agvScenario } from '../domain/base/scenarios.ts'
import { applyScenarioOverrides, defaultAgvScenarios } from '../experiment/scenarioOverrides.ts'
import { ExperimentManager, defaultExperiment } from '../experiment/ExperimentManager.ts'
import { DeviceType } from '../types/index.ts'

describe('Scenario overrides', () => {
  it('overrides agv count without cloning unrelated layout', () => {
    const base = agvScenario(3, 50)
    const overridden = applyScenarioOverrides(base, { agvCount: 6 })
    expect(overridden.devices.filter((device) => device.type === DeviceType.Agv)).toHaveLength(6)
    expect(overridden.devices.find((device) => device.id === 'station-a')).toBeTruthy()
    expect(base.devices.filter((device) => device.type === DeviceType.Agv)).toHaveLength(3)
  })

  it('overrides agv speed', () => {
    const base = agvScenario(2, 10)
    const overridden = applyScenarioOverrides(base, { agvSpeed: 2.5 })
    const speeds = overridden.devices
      .filter((device) => device.type === DeviceType.Agv)
      .map((device) => (device.params as { speed: number }).speed)
    expect(speeds.every((speed) => speed === 2.5)).toBe(true)
  })
})

describe('ExperimentManager', () => {
  it('runs multiple scenarios and collects KPIs', () => {
    const manager = new ExperimentManager()
    const base = agvScenario(3, 30)
    const definition = {
      ...defaultExperiment(),
      scenarios: defaultAgvScenarios([3, 4]),
      replications: 1,
      baseSeed: 1001,
    }
    const { results, summaries } = manager.runExperiment(base, definition)
    expect(results).toHaveLength(2)
    expect(summaries).toHaveLength(2)
    expect(results.every((item) => item.completedTasks === 30)).toBe(true)
    expect(results.map((item) => item.agvCount).sort()).toEqual([3, 4])
    expect(summaries[0]?.throughput.mean).toBeGreaterThan(0)
  })

  it('supports replications with mean/std/min/max', () => {
    const manager = new ExperimentManager()
    const base = agvScenario(3, 20)
    // Use exponential generator so seed affects arrival times.
    base.tasks = []
    base.simulationConfig.taskCount = 20
    base.simulationConfig.taskGenerator = {
      mode: 'exponential',
      interval: 5,
      sourceId: 'station-a',
      targetId: 'station-b',
      startTime: 0,
      maxTasks: 20,
    }
    const { summaries } = manager.runExperiment(base, {
      id: 'rep',
      name: 'rep',
      scenarios: defaultAgvScenarios([3]),
      replications: 3,
      baseSeed: 1001,
    })
    const summary = summaries[0]
    expect(summary?.replications).toBe(3)
    expect(summary?.throughput.min).toBeLessThanOrEqual(summary!.throughput.max)
    expect(summary?.throughput.std).toBeGreaterThanOrEqual(0)
  })

  it('computes scenario comparison deltas', () => {
    const manager = new ExperimentManager()
    const base = agvScenario(3, 25)
    const { summaries } = manager.runExperiment(base, {
      id: 'cmp',
      name: 'cmp',
      scenarios: defaultAgvScenarios([3, 4, 5]),
      replications: 1,
      baseSeed: 7,
    })
    const deltas = manager.compareSummaries(summaries)
    expect(deltas).toHaveLength(2)
    expect(deltas[0]?.fromAgvCount).toBe(3)
    expect(deltas[0]?.toAgvCount).toBe(4)
  })
})
