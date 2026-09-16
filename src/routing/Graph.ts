import type { PathGraphNode, ProjectEdge } from '../types/index.ts'
import { distance } from '../utils/math.ts'

export interface RoutingNode {
  id: string
  x: number
  y: number
}

export interface RoutingEdge {
  id: string
  from: string
  to: string
  distance: number
  maxSpeed: number
  enabled: boolean
}

interface Neighbor {
  nodeId: string
  edge: RoutingEdge
}

export class Graph {
  private readonly nodes = new Map<string, RoutingNode>()
  private readonly outgoing = new Map<string, Neighbor[]>()
  private readonly edges: RoutingEdge[] = []

  addNode(node: RoutingNode): void {
    this.nodes.set(node.id, node)
    if (!this.outgoing.has(node.id)) {
      this.outgoing.set(node.id, [])
    }
  }

  addEdge(edge: RoutingEdge): void {
    this.edges.push(edge)
    const list = this.outgoing.get(edge.from) ?? []
    list.push({ nodeId: edge.to, edge })
    this.outgoing.set(edge.from, list)
  }

  getNode(id: string): RoutingNode | undefined {
    return this.nodes.get(id)
  }

  getNodes(): RoutingNode[] {
    return [...this.nodes.values()]
  }

  neighbors(id: string): Neighbor[] {
    return this.outgoing.get(id) ?? []
  }

  findEdge(from: string, to: string): RoutingEdge | undefined {
    return this.outgoing.get(from)?.find((item) => item.nodeId === to && item.edge.enabled)?.edge
  }

  static fromProject(nodes: PathGraphNode[], edges: ProjectEdge[]): Graph {
    const graph = new Graph()
    for (const node of nodes) {
      graph.addNode({ id: node.id, x: node.x, y: node.y })
    }
    for (const edge of edges) {
      if (edge.kind !== 'path' || !edge.enabled) {
        continue
      }
      const from = graph.getNode(edge.from)
      const to = graph.getNode(edge.to)
      const computed =
        from && to ? distance(from.x, from.y, to.x, to.y) : edge.distance
      graph.addEdge({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        distance: edge.distance > 0 ? edge.distance : computed,
        maxSpeed: edge.maxSpeed,
        enabled: edge.enabled,
      })
    }
    return graph
  }
}

interface SearchResult {
  path: string[]
  distance: number
}

function reconstruct(
  cameFrom: Map<string, string>,
  current: string,
): string[] {
  const path = [current]
  while (cameFrom.has(current)) {
    const previous = cameFrom.get(current)
    if (!previous) {
      break
    }
    path.push(previous)
    current = previous
  }
  path.reverse()
  return path
}

function heuristic(graph: Graph, a: string, b: string): number {
  const nodeA = graph.getNode(a)
  const nodeB = graph.getNode(b)
  if (!nodeA || !nodeB) {
    return 0
  }
  return distance(nodeA.x, nodeA.y, nodeB.x, nodeB.y)
}

function shortestPath(
  graph: Graph,
  start: string,
  goal: string,
  useHeuristic: boolean,
): SearchResult | undefined {
  if (!graph.getNode(start) || !graph.getNode(goal)) {
    return undefined
  }
  if (start === goal) {
    return { path: [start], distance: 0 }
  }

  const open: Array<{ id: string; f: number; g: number }> = [{ id: start, f: 0, g: 0 }]
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[start, 0]])
  const closed = new Set<string>()

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f || a.g - b.g)
    const current = open.shift()
    if (!current) {
      break
    }
    if (current.id === goal) {
      return {
        path: reconstruct(cameFrom, current.id),
        distance: current.g,
      }
    }
    if (closed.has(current.id)) {
      continue
    }
    closed.add(current.id)

    for (const neighbor of graph.neighbors(current.id)) {
      if (!neighbor.edge.enabled) {
        continue
      }
      const tentative = current.g + neighbor.edge.distance
      const previous = gScore.get(neighbor.nodeId)
      if (previous !== undefined && tentative >= previous) {
        continue
      }
      cameFrom.set(neighbor.nodeId, current.id)
      gScore.set(neighbor.nodeId, tentative)
      const h = useHeuristic ? heuristic(graph, neighbor.nodeId, goal) : 0
      open.push({ id: neighbor.nodeId, f: tentative + h, g: tentative })
    }
  }

  return undefined
}

export function dijkstra(graph: Graph, start: string, goal: string): SearchResult | undefined {
  return shortestPath(graph, start, goal, false)
}

export function astar(graph: Graph, start: string, goal: string): SearchResult | undefined {
  return shortestPath(graph, start, goal, true)
}

export function pathTravelTime(
  graph: Graph,
  path: string[],
  speed: number,
): number {
  let total = 0
  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i]
    const to = path[i + 1]
    if (!from || !to) {
      continue
    }
    const edge = graph.findEdge(from, to)
    if (edge) {
      const velocity = Math.max(0.0001, Math.min(speed, edge.maxSpeed))
      total += edge.distance / velocity
      continue
    }
    const nodeFrom = graph.getNode(from)
    const nodeTo = graph.getNode(to)
    if (nodeFrom && nodeTo) {
      total += distance(nodeFrom.x, nodeFrom.y, nodeTo.x, nodeTo.y) / Math.max(0.0001, speed)
    }
  }
  return total
}

export function interpolatePath(
  graph: Graph,
  path: string[],
  progress: number,
): { x: number; y: number } | undefined {
  if (path.length === 0) {
    return undefined
  }
  const start = graph.getNode(path[0] ?? '')
  if (!start) {
    return undefined
  }
  if (path.length === 1) {
    return { x: start.x, y: start.y }
  }

  const segments: Array<{ from: RoutingNode; to: RoutingNode; length: number }> = []
  let total = 0
  for (let i = 0; i < path.length - 1; i += 1) {
    const fromId = path[i]
    const toId = path[i + 1]
    if (!fromId || !toId) {
      continue
    }
    const from = graph.getNode(fromId)
    const to = graph.getNode(toId)
    if (!from || !to) {
      continue
    }
    const length = distance(from.x, from.y, to.x, to.y)
    segments.push({ from, to, length })
    total += length
  }
  if (total === 0 || segments.length === 0) {
    return { x: start.x, y: start.y }
  }

  let remaining = clamp01(progress) * total
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const t = segment.length === 0 ? 1 : remaining / segment.length
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        y: segment.from.y + (segment.to.y - segment.from.y) * t,
      }
    }
    remaining -= segment.length
  }
  const last = segments[segments.length - 1]
  return last ? { x: last.to.x, y: last.to.y } : { x: start.x, y: start.y }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
