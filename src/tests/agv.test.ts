import { describe, expect, it } from 'vitest'
import { agvScenario } from '../domain/base/scenarios.ts'
import { compareAgvCounts, runProjectToCompletion } from '../simulation/experiments.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { EventType } from '../simulation/SimulationEvent.ts'

describe('AGV transport', () => {
  it('completes 100 tasks with 3 AGVs', () => {
    const state = runProjectToCompletion(agvScenario(3, 100))
    expect(state.completedTasks).toBe(100)
    expect(state.statistics.averageCycleTime).toBeGreaterThan(0)
    expect(state.statistics.agvUtilization).toBeGreaterThan(0)
    expect(state.statistics.throughput).toBeGreaterThan(0)
  })

  it('drives the AGV lifecycle with simulation events', () => {
    const engine = createEngine(agvScenario(1, 1))
    const types: string[] = []
    const original = engine.runNextEvent.bind(engine)
    engine.runNextEvent = () => {
      const peek = engine.queue.peek()
      const result = original()
      if (peek) {
        types.push(peek.type)
      }
      return result
    }
    engine.runUntilEmpty()
    expect(types).toContain(EventType.TaskCreated)
    expect(types).toContain(EventType.TaskAssigned)
    expect(types).toContain(EventType.AgvAdvanceHop)
    expect(types).toContain(EventType.AgvLoad)
    expect(types).toContain(EventType.AgvUnload)
    expect(types).toContain(EventType.TaskCompleted)
    expect(types).toContain(EventType.AgvIdle)
  })

  it('compares 3, 4, 5 and 6 AGVs using the current model snapshot', () => {
    const base = agvScenario(3, 100)
    const rows = compareAgvCounts(base, [3, 4, 5, 6])
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.completedTasks).toBe(100)
      expect(row.taskCount).toBe(100)
      expect(row.scenarioHash).toBeTruthy()
      expect(row.throughput).toBeGreaterThan(0)
    }
    expect(rows[3]?.simulationTime).toBeLessThanOrEqual(rows[0]?.simulationTime ?? 0)
  })
})
