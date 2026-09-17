/// <reference lib="webworker" />
import { createEngine } from '../simulation/SimulationEngine.ts'
import { compareAgvCounts, runAgvExperiment } from '../simulation/experiments.ts'
import type { ProjectDocument } from '../types/index.ts'

export type WorkerRequest =
  | { id: string; type: 'runToEnd'; project: ProjectDocument; maxEvents?: number }
  | { id: string; type: 'compareAgvs'; counts: number[]; taskCount: number }
  | { id: string; type: 'runExperiment'; project: ProjectDocument; counts: number[]; replications: number; seed: number }

export type WorkerResponse =
  | { id: string; type: 'progress'; progress: number; message: string }
  | { id: string; type: 'result'; result: unknown }
  | { id: string; type: 'error'; message: string }

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    ctx.postMessage({ id: request.id, type: 'progress', progress: 0.05, message: 'starting' } satisfies WorkerResponse)
    if (request.type === 'runToEnd') {
      const engine = createEngine(request.project)
      engine.start()
      const maxEvents = request.maxEvents ?? 200_000
      let steps = 0
      while (!engine.queue.isEmpty && steps < maxEvents) {
        engine.step()
        steps += 1
        if (steps % 5000 === 0) {
          ctx.postMessage({
            id: request.id,
            type: 'progress',
            progress: Math.min(0.95, steps / maxEvents),
            message: `events:${steps}`,
          } satisfies WorkerResponse)
        }
      }
      if (!engine.queue.isEmpty) {
        ctx.postMessage({
          id: request.id,
          type: 'error',
          message: `MAX_EVENTS:${maxEvents}`,
        } satisfies WorkerResponse)
        return
      }
      ctx.postMessage({ id: request.id, type: 'result', result: engine.getState() } satisfies WorkerResponse)
      return
    }
    if (request.type === 'compareAgvs') {
      ctx.postMessage({ id: request.id, type: 'progress', progress: 0.2, message: 'compare' } satisfies WorkerResponse)
      const result = compareAgvCounts(request.counts, request.taskCount)
      ctx.postMessage({ id: request.id, type: 'result', result } satisfies WorkerResponse)
      return
    }
    if (request.type === 'runExperiment') {
      ctx.postMessage({ id: request.id, type: 'progress', progress: 0.2, message: 'experiment' } satisfies WorkerResponse)
      const result = runAgvExperiment(request.project, request.counts, request.replications, request.seed)
      ctx.postMessage({ id: request.id, type: 'result', result } satisfies WorkerResponse)
    }
  } catch (error) {
    ctx.postMessage({
      id: request.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse)
  }
}
