import { describe, expect, it } from 'vitest'
import { emptyProject } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { conveyorScenario } from '../domain/base/scenarios.ts'
import { runProjectToCompletion } from '../simulation/experiments.ts'

describe('simulation core', () => {
  it('executes events in time order', () => {
    const engine = createEngine(emptyProject())
    const order: number[] = []
    engine.register('TEST', (event) => {
      order.push(event.time)
    })
    engine.scheduleEvent({ time: 30, type: 'TEST' })
    engine.scheduleEvent({ time: 10, type: 'TEST' })
    engine.scheduleEvent({ time: 20, type: 'TEST' })
    engine.runUntilEmpty()
    expect(order).toEqual([10, 20, 30])
  })

  it('executes same-time events by priority ascending', () => {
    const engine = createEngine(emptyProject())
    const order: number[] = []
    engine.register('TEST', (event) => {
      order.push(event.priority ?? 0)
    })
    engine.scheduleEvent({ time: 5, type: 'TEST', priority: 1 })
    engine.scheduleEvent({ time: 5, type: 'TEST', priority: 3 })
    engine.scheduleEvent({ time: 5, type: 'TEST', priority: 2 })
    engine.runUntilEmpty()
    expect(order).toEqual([1, 2, 3])
  })

  it('resets clock and queue', () => {
    const engine = createEngine(emptyProject())
    engine.register('TEST', () => undefined)
    engine.scheduleEvent({ time: 12, type: 'TEST' })
    engine.step()
    expect(engine.getCurrentTime()).toBe(12)
    engine.reset()
    expect(engine.getCurrentTime()).toBe(0)
    expect(engine.queue.isEmpty).toBe(true)
  })

  it('step executes only one event', () => {
    const engine = createEngine(emptyProject())
    let count = 0
    engine.register('TEST', () => {
      count += 1
    })
    engine.scheduleEvent({ time: 1, type: 'TEST' })
    engine.scheduleEvent({ time: 2, type: 'TEST' })
    engine.step()
    expect(count).toBe(1)
    expect(engine.getCurrentTime()).toBe(1)
    expect(engine.queue.size).toBe(1)
  })

  it('is deterministic for the same input', () => {
    const first = runProjectToCompletion(conveyorScenario())
    const second = runProjectToCompletion(conveyorScenario())
    expect(first.statistics).toEqual(second.statistics)
    expect(first.time).toBe(second.time)
    expect(first.statistics.completedCount).toBe(second.statistics.completedCount)
  })
})
