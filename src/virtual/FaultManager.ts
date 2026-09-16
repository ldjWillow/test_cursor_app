export interface FaultEvent {
  id: string
  deviceId: string
  faultType: string
  triggerTime: number
  message: string
  active: boolean
}

export class FaultManager {
  private readonly scheduled: FaultEvent[] = []
  private readonly active = new Map<string, FaultEvent>()
  private seq = 0

  schedule(deviceId: string, faultType: string, triggerTime: number, message?: string): FaultEvent {
    this.seq += 1
    const event: FaultEvent = {
      id: `fault-${this.seq}`,
      deviceId,
      faultType,
      triggerTime,
      message: message ?? `${faultType} on ${deviceId}`,
      active: false,
    }
    this.scheduled.push(event)
    return event
  }

  injectNow(deviceId: string, faultType: string, message?: string): FaultEvent {
    const event = this.schedule(deviceId, faultType, 0, message)
    event.active = true
    this.active.set(deviceId, event)
    return event
  }

  clear(deviceId: string): void {
    this.active.delete(deviceId)
  }

  tick(simulationTime: number): FaultEvent[] {
    const triggered: FaultEvent[] = []
    for (const event of this.scheduled) {
      if (!event.active && simulationTime >= event.triggerTime) {
        event.active = true
        this.active.set(event.deviceId, event)
        triggered.push(event)
      }
    }
    return triggered
  }

  isFaulted(deviceId: string): boolean {
    return this.active.has(deviceId)
  }

  listActive(): FaultEvent[] {
    return [...this.active.values()]
  }

  reset(): void {
    this.scheduled.length = 0
    this.active.clear()
  }
}

export const faultManager = new FaultManager()
