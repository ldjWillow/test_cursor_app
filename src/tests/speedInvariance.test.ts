import { describe, expect, it } from 'vitest'
import { conveyorScenario } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'

describe('simulation speed invariance', () => {
  it('matches full-run results when time is advanced in slices', () => {
    const project = conveyorScenario()
    const full = createEngine(project)
    full.runUntilEmpty()

    const sliced = createEngine(project)
    while (!sliced.queue.isEmpty) {
      sliced.runUntil(sliced.getCurrentTime() + 7)
    }

    expect(sliced.getState().statistics).toEqual(full.getState().statistics)
  })
})
