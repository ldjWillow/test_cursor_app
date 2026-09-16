import { describe, expect, it } from 'vitest'
import { ReservationTrafficManager } from '../traffic/TrafficManager.ts'

describe('TrafficManager reservations', () => {
  it('reserves and releases edges with capacity 1', () => {
    const traffic = new ReservationTrafficManager()
    traffic.setEdgeCapacity('e1', 1)
    expect(traffic.canEnterEdge('agv-1', 'e1', 0)).toBe(true)
    expect(traffic.reserveEdge('agv-1', 'e1', 0)).toBe(true)
    expect(traffic.canEnterEdge('agv-2', 'e1', 1)).toBe(false)
    expect(traffic.reserveEdge('agv-2', 'e1', 1)).toBe(false)
    traffic.releaseEdge('agv-1', 'e1', 2)
    expect(traffic.canEnterEdge('agv-2', 'e1', 2)).toBe(true)
  })

  it('supports node intersection capacity', () => {
    const traffic = new ReservationTrafficManager()
    traffic.setNodeCapacity('C', 1)
    expect(traffic.reserveNode('agv-a', 'C', 0)).toBe(true)
    expect(traffic.reserveNode('agv-b', 'C', 0)).toBe(false)
    traffic.enqueueWaiter({ agvId: 'agv-b', resourceType: 'node', resourceId: 'C', since: 0 })
    traffic.releaseNode('agv-a', 'C', 5)
    expect(traffic.dequeueReady('node', 'C', 5)).toBe('agv-b')
  })

  it('tracks waiting queue for blocked AGVs', () => {
    const traffic = new ReservationTrafficManager()
    traffic.setEdgeCapacity('edge-12', 1)
    traffic.reserveEdge('agv-1', 'edge-12', 0)
    traffic.enqueueWaiter({
      agvId: 'agv-3',
      resourceType: 'edge',
      resourceId: 'edge-12',
      since: 5,
    })
    expect(traffic.waitingFor('agv-3')?.resourceId).toBe('edge-12')
    traffic.releaseEdge('agv-1', 'edge-12', 11)
    expect(traffic.dequeueReady('edge', 'edge-12', 11)).toBe('agv-3')
    expect(traffic.waitingFor('agv-3')).toBeUndefined()
  })
})
