import type { Bottleneck } from '../types/index.ts'
import type { SimulationWorld } from '../simulation/SimulationWorld.ts'
import type { TrafficManager } from '../traffic/TrafficManager.ts'

const UTILIZATION_THRESHOLD = 0.9
const QUEUE_THRESHOLD = 8
const ROUTE_WAITING_THRESHOLD = 60

export interface BottleneckAnalyzerInput {
  world: SimulationWorld
  traffic: TrafficManager
  now: number
  resources: Array<{
    id: string
    name: string
    type: string
    utilization: number
    averageQueueLength: number
  }>
}

/**
 * Deterministic bottleneck rules — no AI.
 */
export class BottleneckAnalyzer {
  analyze(input: BottleneckAnalyzerInput): Bottleneck[] {
    const bottlenecks: Bottleneck[] = []
    const seen = new Set<string>()

    const push = (item: Bottleneck): void => {
      const key = `${item.id}:${item.reason}`
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      bottlenecks.push(item)
    }

    for (const resource of input.resources) {
      if (resource.utilization > UTILIZATION_THRESHOLD) {
        push({
          id: resource.id,
          name: resource.name,
          reason: `Utilization: ${(resource.utilization * 100).toFixed(1)}%`,
          utilization: resource.utilization,
          averageQueueLength: resource.averageQueueLength,
          kind: 'resource',
        })
      }
      if (resource.averageQueueLength > QUEUE_THRESHOLD) {
        push({
          id: resource.id,
          name: resource.name,
          reason: `Average Queue: ${resource.averageQueueLength.toFixed(1)}`,
          utilization: resource.utilization,
          averageQueueLength: resource.averageQueueLength,
          kind: 'queue',
        })
      }
    }

    for (const item of input.traffic.allRouteWaiting()) {
      if (item.waitingTime > ROUTE_WAITING_THRESHOLD) {
        push({
          id: item.id,
          name: item.id,
          reason: `Route Waiting: ${item.waitingTime.toFixed(1)}s`,
          routeWaitingTime: item.waitingTime,
          kind: item.id.includes('edge') || item.id.includes('-fwd') || item.id.includes('-rev')
            ? 'edge'
            : 'intersection',
        })
      }
    }

    return bottlenecks.sort((a, b) => {
      const score = (item: Bottleneck): number =>
        (item.utilization ?? 0) * 100 + (item.averageQueueLength ?? 0) + (item.routeWaitingTime ?? 0)
      return score(b) - score(a)
    })
  }
}

export const bottleneckAnalyzer = new BottleneckAnalyzer()
