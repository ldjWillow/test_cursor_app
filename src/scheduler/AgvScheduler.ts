import { AgvStatus, TaskStatus } from '../types/index.ts'
import { astar, pathTravelTime } from '../routing/Graph.ts'
import type { Graph } from '../routing/Graph.ts'
import { distance } from '../utils/math.ts'
import type { AgvRuntime, TaskRuntime } from '../simulation/runtimeTypes.ts'

export interface Assignment {
  taskId: string
  agvId: string
  pathToPickup: string[]
  travelTime: number
}

export interface AgvSchedulingContext {
  time: number
  waitingTasks: TaskRuntime[]
  idleAgvs: AgvRuntime[]
  graph: Graph
}

export interface AgvSchedulingStrategy {
  readonly name: string
  assign(context: AgvSchedulingContext): Assignment[]
}

function pathOrFallback(
  graph: Graph,
  fromId: string,
  toId: string,
  fromX: number,
  fromY: number,
): { path: string[]; distance: number } {
  const result = astar(graph, fromId, toId)
  if (result) {
    return result
  }
  const target = graph.getNode(toId)
  const dist = target ? distance(fromX, fromY, target.x, target.y) : 0
  return { path: [fromId, toId], distance: dist }
}

export class NearestAvailableAgvStrategy implements AgvSchedulingStrategy {
  readonly name = 'nearest-available'

  assign(context: AgvSchedulingContext): Assignment[] {
    const assignments: Assignment[] = []
    const remainingAgvs = [...context.idleAgvs]
    for (const task of context.waitingTasks) {
      if (remainingAgvs.length === 0) {
        break
      }
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY
      let bestPath: string[] = []
      for (let i = 0; i < remainingAgvs.length; i += 1) {
        const agv = remainingAgvs[i]
        if (!agv) {
          continue
        }
        const route = pathOrFallback(context.graph, agv.nodeId, task.sourceId, agv.x, agv.y)
        if (route.distance < bestDistance) {
          bestDistance = route.distance
          bestIndex = i
          bestPath = route.path
        }
      }
      const chosen = remainingAgvs.splice(bestIndex, 1)[0]
      if (!chosen) {
        continue
      }
      assignments.push({
        taskId: task.id,
        agvId: chosen.id,
        pathToPickup: bestPath,
        travelTime: pathTravelTime(context.graph, bestPath, chosen.speed),
      })
    }
    return assignments
  }
}

export class FifoAgvStrategy implements AgvSchedulingStrategy {
  readonly name = 'fifo'

  assign(context: AgvSchedulingContext): Assignment[] {
    const assignments: Assignment[] = []
    const agvs = [...context.idleAgvs]
    for (const task of context.waitingTasks) {
      const agv = agvs.shift()
      if (!agv) {
        break
      }
      const route = pathOrFallback(context.graph, agv.nodeId, task.sourceId, agv.x, agv.y)
      assignments.push({
        taskId: task.id,
        agvId: agv.id,
        pathToPickup: route.path,
        travelTime: pathTravelTime(context.graph, route.path, agv.speed),
      })
    }
    return assignments
  }
}

export class AgvScheduler {
  constructor(private strategy: AgvSchedulingStrategy = new NearestAvailableAgvStrategy()) {}

  setStrategy(strategy: AgvSchedulingStrategy): void {
    this.strategy = strategy
  }

  dispatch(context: AgvSchedulingContext): Assignment[] {
    const idleAgvs = context.idleAgvs.filter((agv) => agv.status === AgvStatus.Idle)
    const waitingTasks = context.waitingTasks.filter((task) => task.status === TaskStatus.Waiting)
    return this.strategy.assign({ ...context, idleAgvs, waitingTasks })
  }
}
