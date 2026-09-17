import { describe, expect, it } from 'vitest'
import { agvScenario } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'

describe('multi-speed KPI consistency', () => {
  it('1x/5x/10x/50x wall-clock slicing yields same final KPIs', () => {
    const project = agvScenario(3, 40)
    const baselines = [1, 5, 10, 50].map((speed) => {
      const engine = createEngine(project)
      engine.start()
      // Simulate wall-clock slices scaled by speed (same sim-time progress pattern).
      let wall = 0
      while (!engine.queue.isEmpty && wall < 5000) {
        wall += 0.05
        engine.runUntil(engine.getCurrentTime() + 0.05 * speed)
      }
      const stats = engine.getState().statistics
      return {
        speed,
        throughput: Number(stats.throughput.toFixed(6)),
        avgWait: Number(stats.averageWaitingTime.toFixed(6)),
        completed: engine.getState().completedTasks,
        time: Number(engine.getState().time.toFixed(6)),
      }
    })

    const first = baselines[0]!
    for (const row of baselines) {
      expect(row.completed).toBe(first.completed)
      expect(row.throughput).toBe(first.throughput)
      expect(row.avgWait).toBe(first.avgWait)
      expect(row.time).toBe(first.time)
    }
  })
})
