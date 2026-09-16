import { describe, expect, it } from 'vitest'
import { Graph, astar, dijkstra, pathTravelTime } from '../routing/Graph.ts'

function lineGraph(): Graph {
  const graph = new Graph()
  graph.addNode({ id: 'A', x: 0, y: 0 })
  graph.addNode({ id: 'N1', x: 10, y: 0 })
  graph.addNode({ id: 'N2', x: 20, y: 0 })
  graph.addNode({ id: 'B', x: 30, y: 0 })
  graph.addEdge({ id: '1', from: 'A', to: 'N1', distance: 10, maxSpeed: 2, enabled: true })
  graph.addEdge({ id: '2', from: 'N1', to: 'N2', distance: 10, maxSpeed: 2, enabled: true })
  graph.addEdge({ id: '3', from: 'N2', to: 'B', distance: 10, maxSpeed: 2, enabled: true })
  return graph
}

describe('routing', () => {
  it('finds A-N1-N2-B with Dijkstra', () => {
    const result = dijkstra(lineGraph(), 'A', 'B')
    expect(result?.path).toEqual(['A', 'N1', 'N2', 'B'])
    expect(result?.distance).toBe(30)
  })

  it('finds the same path with A*', () => {
    const result = astar(lineGraph(), 'A', 'B')
    expect(result?.path).toEqual(['A', 'N1', 'N2', 'B'])
  })

  it('computes travel time as distance / speed', () => {
    const graph = lineGraph()
    const result = astar(graph, 'A', 'B')
    expect(result).toBeDefined()
    if (!result) {
      return
    }
    expect(pathTravelTime(graph, result.path, 1)).toBe(30)
    expect(pathTravelTime(graph, result.path, 2)).toBe(15)
  })
})
