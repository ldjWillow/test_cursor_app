import type { SimulationWorld } from '../simulation/SimulationWorld.ts'

/**
 * Material conservation:
 * generated = queued + inProcess + completed
 */
export function materialBalance(world: SimulationWorld): {
  generated: number
  queued: number
  inProcess: number
  completed: number
  ok: boolean
} {
  let queued = 0
  let inProcess = 0

  for (const source of world.sources.values()) {
    queued += source.waiting.length
  }
  for (const conveyor of world.conveyors.values()) {
    queued += conveyor.waiting.length
    inProcess += conveyor.occupancy.length
  }
  for (const stacker of world.stackers.values()) {
    queued += stacker.waiting.length + stacker.queue.length
    if (stacker.activeJobId) {
      // Active job is already counted inside queue[0]; do not double-count.
    }
  }
  for (const sink of world.sinks.values()) {
    void sink
  }

  const generated = world.generatedCount
  const completed = world.completedCount
  const ok = generated === queued + inProcess + completed
  return { generated, queued, inProcess, completed, ok }
}
