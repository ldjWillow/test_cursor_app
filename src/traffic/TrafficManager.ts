export interface TrafficWaiter {
  agvId: string
  resourceType: 'node' | 'edge'
  resourceId: string
  since: number
}

export interface TrafficManager {
  canEnterNode(agvId: string, nodeId: string, time: number): boolean
  canEnterEdge(agvId: string, edgeId: string, time: number): boolean
  reserveNode(agvId: string, nodeId: string, time: number): boolean
  reserveEdge(agvId: string, edgeId: string, time: number): boolean
  releaseNode(agvId: string, nodeId: string, time: number): void
  releaseEdge(agvId: string, edgeId: string, time: number): void
  /** Legacy compatibility — node-only. */
  canEnter(agvId: string, nodeId: string, time: number): boolean
  reserve(agvId: string, nodeId: string, time: number): void
  release(agvId: string, nodeId: string, time: number): void
  enqueueWaiter(waiter: TrafficWaiter): void
  dequeueReady(resourceType: 'node' | 'edge', resourceId: string, time: number): string | undefined
  waitingFor(agvId: string): TrafficWaiter | undefined
  routeWaitingTime(resourceId: string): number
  allRouteWaiting(): Array<{ id: string; waitingTime: number }>
  reset(): void
}

interface Occupancy {
  holders: Set<string>
  capacity: number
  waiters: TrafficWaiter[]
  waitingIntegral: number
  lastSample: number
  lastQueue: number
}

function sample(occ: Occupancy, time: number): void {
  occ.waitingIntegral += occ.lastQueue * Math.max(0, time - occ.lastSample)
  occ.lastSample = time
  occ.lastQueue = occ.waiters.length
}

export class ReservationTrafficManager implements TrafficManager {
  private readonly nodes = new Map<string, Occupancy>()
  private readonly edges = new Map<string, Occupancy>()
  private readonly waiterByAgv = new Map<string, TrafficWaiter>()

  private getOrCreate(
    map: Map<string, Occupancy>,
    id: string,
    capacity = 1,
  ): Occupancy {
    let occ = map.get(id)
    if (!occ) {
      occ = {
        holders: new Set(),
        capacity,
        waiters: [],
        waitingIntegral: 0,
        lastSample: 0,
        lastQueue: 0,
      }
      map.set(id, occ)
    }
    return occ
  }

  setNodeCapacity(nodeId: string, capacity: number): void {
    this.getOrCreate(this.nodes, nodeId, Math.max(1, capacity)).capacity = Math.max(1, capacity)
  }

  setEdgeCapacity(edgeId: string, capacity: number): void {
    this.getOrCreate(this.edges, edgeId, Math.max(1, capacity)).capacity = Math.max(1, capacity)
  }

  canEnterNode(agvId: string, nodeId: string, _time: number): boolean {
    const occ = this.getOrCreate(this.nodes, nodeId)
    return occ.holders.has(agvId) || occ.holders.size < occ.capacity
  }

  canEnterEdge(agvId: string, edgeId: string, _time: number): boolean {
    const occ = this.getOrCreate(this.edges, edgeId)
    return occ.holders.has(agvId) || occ.holders.size < occ.capacity
  }

  reserveNode(agvId: string, nodeId: string, time: number): boolean {
    const occ = this.getOrCreate(this.nodes, nodeId)
    sample(occ, time)
    if (occ.holders.has(agvId)) {
      return true
    }
    if (occ.holders.size >= occ.capacity) {
      return false
    }
    occ.holders.add(agvId)
    this.clearWaiter(agvId)
    return true
  }

  reserveEdge(agvId: string, edgeId: string, time: number): boolean {
    const occ = this.getOrCreate(this.edges, edgeId)
    sample(occ, time)
    if (occ.holders.has(agvId)) {
      return true
    }
    if (occ.holders.size >= occ.capacity) {
      return false
    }
    occ.holders.add(agvId)
    this.clearWaiter(agvId)
    return true
  }

  releaseNode(agvId: string, nodeId: string, time: number): void {
    const occ = this.nodes.get(nodeId)
    if (!occ) {
      return
    }
    sample(occ, time)
    occ.holders.delete(agvId)
  }

  releaseEdge(agvId: string, edgeId: string, time: number): void {
    const occ = this.edges.get(edgeId)
    if (!occ) {
      return
    }
    sample(occ, time)
    occ.holders.delete(agvId)
  }

  canEnter(agvId: string, nodeId: string, time: number): boolean {
    return this.canEnterNode(agvId, nodeId, time)
  }

  reserve(agvId: string, nodeId: string, time: number): void {
    this.reserveNode(agvId, nodeId, time)
  }

  release(agvId: string, nodeId: string, time: number): void {
    this.releaseNode(agvId, nodeId, time)
  }

  enqueueWaiter(waiter: TrafficWaiter): void {
    const map = waiter.resourceType === 'node' ? this.nodes : this.edges
    const occ = this.getOrCreate(map, waiter.resourceId)
    sample(occ, waiter.since)
    if (!occ.waiters.some((item) => item.agvId === waiter.agvId)) {
      occ.waiters.push(waiter)
    }
    occ.lastQueue = occ.waiters.length
    this.waiterByAgv.set(waiter.agvId, waiter)
  }

  dequeueReady(resourceType: 'node' | 'edge', resourceId: string, time: number): string | undefined {
    const map = resourceType === 'node' ? this.nodes : this.edges
    const occ = map.get(resourceId)
    if (!occ || occ.waiters.length === 0) {
      return undefined
    }
    sample(occ, time)
    if (occ.holders.size >= occ.capacity) {
      return undefined
    }
    const next = occ.waiters.shift()
    occ.lastQueue = occ.waiters.length
    if (!next) {
      return undefined
    }
    this.waiterByAgv.delete(next.agvId)
    return next.agvId
  }

  waitingFor(agvId: string): TrafficWaiter | undefined {
    return this.waiterByAgv.get(agvId)
  }

  routeWaitingTime(resourceId: string): number {
    const node = this.nodes.get(resourceId)
    const edge = this.edges.get(resourceId)
    return (node?.waitingIntegral ?? 0) + (edge?.waitingIntegral ?? 0)
  }

  allRouteWaiting(): Array<{ id: string; waitingTime: number }> {
    const result: Array<{ id: string; waitingTime: number }> = []
    for (const [id, occ] of this.nodes) {
      if (occ.waitingIntegral > 0) {
        result.push({ id, waitingTime: occ.waitingIntegral })
      }
    }
    for (const [id, occ] of this.edges) {
      if (occ.waitingIntegral > 0) {
        result.push({ id, waitingTime: occ.waitingIntegral })
      }
    }
    return result.sort((a, b) => b.waitingTime - a.waitingTime)
  }

  reset(): void {
    this.nodes.clear()
    this.edges.clear()
    this.waiterByAgv.clear()
  }

  private clearWaiter(agvId: string): void {
    const existing = this.waiterByAgv.get(agvId)
    if (!existing) {
      return
    }
    const map = existing.resourceType === 'node' ? this.nodes : this.edges
    const occ = map.get(existing.resourceId)
    if (occ) {
      occ.waiters = occ.waiters.filter((item) => item.agvId !== agvId)
    }
    this.waiterByAgv.delete(agvId)
  }
}

/** Keeps MVP constructor injection working when traffic is disabled. */
export class NoOpTrafficManager implements TrafficManager {
  canEnterNode(): boolean {
    return true
  }
  canEnterEdge(): boolean {
    return true
  }
  reserveNode(): boolean {
    return true
  }
  reserveEdge(): boolean {
    return true
  }
  releaseNode(): void {}
  releaseEdge(): void {}
  canEnter(): boolean {
    return true
  }
  reserve(): void {}
  release(): void {}
  enqueueWaiter(): void {}
  dequeueReady(): undefined {
    return undefined
  }
  waitingFor(): undefined {
    return undefined
  }
  routeWaitingTime(): number {
    return 0
  }
  allRouteWaiting(): Array<{ id: string; waitingTime: number }> {
    return []
  }
  reset(): void {}
}
