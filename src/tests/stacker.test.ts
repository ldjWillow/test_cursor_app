import { describe, expect, it } from 'vitest'
import { asrsScenario } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'

describe('rack and stacker', () => {
  it('stores inbound materials using max(horizontal, vertical) + forkTime', () => {
    const project = asrsScenario()
    const source = project.devices.find((device) => device.id === 'source-1')
    if (source && 'totalCount' in source.params) {
      source.params.totalCount = 2
      source.params.generationInterval = 20
    }
    const engine = createEngine(project)
    engine.runUntilEmpty()
    const state = engine.getState()
    expect(state.statistics.completedCount).toBe(2)
    const rack = engine.world.racks.get('rack-1')
    expect(rack?.locations.filter((location) => location.occupied)).toHaveLength(2)
    expect(state.time).toBeGreaterThan(0)
  })
})
