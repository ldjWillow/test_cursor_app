export type EdgeKind = 'rising' | 'falling' | 'change'

export interface EdgeEvent {
  signalId: string
  kind: EdgeKind
  oldValue: unknown
  newValue: unknown
  time: number
}

/**
 * Industrial edge detection — StartCommand false→true fires once, not every scan.
 */
export class EdgeDetector {
  private readonly previous = new Map<string, unknown>()

  observe(signalId: string, value: unknown, time = Date.now()): EdgeEvent[] {
    const events: EdgeEvent[] = []
    const oldValue = this.previous.get(signalId)
    if (!this.previous.has(signalId)) {
      this.previous.set(signalId, value)
      return events
    }
    if (Object.is(oldValue, value)) {
      return events
    }
    events.push({ signalId, kind: 'change', oldValue, newValue: value, time })
    if (oldValue === false && value === true) {
      events.push({ signalId, kind: 'rising', oldValue, newValue: value, time })
    }
    if (oldValue === true && value === false) {
      events.push({ signalId, kind: 'falling', oldValue, newValue: value, time })
    }
    this.previous.set(signalId, value)
    return events
  }

  reset(signalId?: string): void {
    if (signalId) {
      this.previous.delete(signalId)
    } else {
      this.previous.clear()
    }
  }

  getPrevious(signalId: string): unknown {
    return this.previous.get(signalId)
  }
}

export const edgeDetector = new EdgeDetector()
