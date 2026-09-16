export interface TrafficReservation {
  agvId: string
  nodeId: string
  time: number
}

export interface TrafficManager {
  canEnter(agvId: string, nodeId: string, time: number): boolean
  reserve(agvId: string, nodeId: string, time: number): void
  release(agvId: string, nodeId: string, time: number): void
}

export class NoOpTrafficManager implements TrafficManager {
  canEnter(_agvId: string, _nodeId: string, _time: number): boolean {
    return true
  }

  reserve(_agvId: string, _nodeId: string, _time: number): void {
    // Reserved for intersection control in a later version.
  }

  release(_agvId: string, _nodeId: string, _time: number): void {
    // Reserved for intersection control in a later version.
  }
}
