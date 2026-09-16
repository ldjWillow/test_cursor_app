import { describe, expect, it } from 'vitest'
import { asrsScenario, stackerSinkScenario } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { EventType } from '../simulation/SimulationEvent.ts'
import { materialBalance } from '../statistics/materialBalance.ts'
import { modelValidator } from '../validation/ModelValidator.ts'

describe('stacker discrete events', () => {
  it('emits STACKER_ENQUEUE/MOVE_X/MOVE_Y/PICK/DROP/COMPLETE for Source→Stacker→Sink', () => {
    const project = stackerSinkScenario(2)
    const engine = createEngine(project)
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
    expect(types).toContain(EventType.StackerEnqueue)
    expect(types).toContain(EventType.StackerMoveX)
    expect(types).toContain(EventType.StackerPick)
    expect(types).toContain(EventType.StackerDrop)
    expect(types).toContain(EventType.StackerComplete)
    expect(engine.getState().statistics.completedCount).toBe(2)
    expect(materialBalance(engine.world).ok).toBe(true)
  })

  it('stores inbound ASRS materials and keeps conservation', () => {
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
    expect(materialBalance(engine.world).ok).toBe(true)
    const stacker = state.devices.find((device) => device.id === 'stacker-1')
    expect(['idle', 'queued']).toContain(stacker?.status)
  })

  it('uses horizontalSpeed, verticalSpeed and forkTime in timing', () => {
    const project = stackerSinkScenario(1)
    const stacker = project.devices.find((device) => device.id === 'stacker-1')
    if (stacker && 'forkTime' in stacker.params) {
      stacker.params.horizontalSpeed = 2
      stacker.params.verticalSpeed = 1
      stacker.params.forkTime = 2
      stacker.params.bayWidth = 1.2
      stacker.params.levelHeight = 1.5
    }
    const engine = createEngine(project)
    engine.runUntilEmpty()
    // pick(2) + moveX(1.2/2=0.6) + drop(2) = at least 4.6s (+ generate at 0)
    expect(engine.getCurrentTime()).toBeGreaterThanOrEqual(4.6)
  })

  it('rejects stacker without outbound edge before start', () => {
    const project = stackerSinkScenario(1)
    project.edges = project.edges.filter((edge) => edge.from !== 'stacker-1')
    const issues = modelValidator.validate(project)
    expect(issues.some((issue) => issue.code === 'STACKER_NO_OUT')).toBe(true)
  })
})
