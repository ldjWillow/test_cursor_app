import { describe, expect, it } from 'vitest'
import { conveyorScenario } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { emptyProject } from '../domain/base/scenarios.ts'
import { DeviceType, EdgeKind } from '../types/index.ts'
import { defaultParams } from '../domain/base/defaults.ts'

describe('source conveyor sink', () => {
  it('moves one material with travelTime = length / speed', () => {
    const project = conveyorScenario()
    const source = project.devices.find((device) => device.type === DeviceType.Source)
    if (source && 'totalCount' in source.params) {
      source.params.totalCount = 1
    }
    const engine = createEngine(project)
    engine.runUntilEmpty()
    expect(engine.getCurrentTime()).toBe(10)
    expect(engine.getState().statistics.completedCount).toBe(1)
    expect(engine.getState().statistics.generatedCount).toBe(1)
  })

  it('delivers 100 materials to the sink', () => {
    const engine = createEngine(conveyorScenario())
    engine.runUntilEmpty()
    const state = engine.getState()
    expect(state.statistics.generatedCount).toBe(100)
    expect(state.statistics.completedCount).toBe(100)
    expect(state.statistics.throughput).toBeGreaterThan(0)
  })

  it('queues when conveyor capacity is exhausted', () => {
    const project = emptyProject()
    project.devices = [
      {
        id: 'source-1',
        type: DeviceType.Source,
        name: 'S',
        x: 0,
        y: 0,
        params: { ...defaultParams(DeviceType.Source), generationInterval: 0.1, totalCount: 3 },
      },
      {
        id: 'conveyor-1',
        type: DeviceType.Conveyor,
        name: 'C',
        x: 10,
        y: 0,
        params: { ...defaultParams(DeviceType.Conveyor), length: 10, speed: 1, capacity: 1 },
      },
      {
        id: 'sink-1',
        type: DeviceType.Sink,
        name: 'K',
        x: 20,
        y: 0,
        params: defaultParams(DeviceType.Sink),
      },
    ]
    project.edges = [
      { id: 'e1', from: 'source-1', to: 'conveyor-1', kind: EdgeKind.Flow, distance: 0, maxSpeed: 1, enabled: true },
      { id: 'e2', from: 'conveyor-1', to: 'sink-1', kind: EdgeKind.Flow, distance: 0, maxSpeed: 1, enabled: true },
    ]
    const engine = createEngine(project)
    engine.runUntilEmpty()
    const state = engine.getState()
    expect(state.statistics.completedCount).toBe(3)
    expect(state.statistics.averageWaitingTime).toBeGreaterThan(0)
  })
})
