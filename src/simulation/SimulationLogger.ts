import type { SimulationLogEntry } from '../types/index.ts'
import { nextId } from '../utils/id.ts'

const DEFAULT_CAP = 5_000

export class SimulationLogger {
  private entries: SimulationLogEntry[] = []
  private readonly cap: number

  constructor(cap = DEFAULT_CAP) {
    this.cap = cap
  }

  clear(): void {
    this.entries = []
  }

  log(
    simulationTime: number,
    entityId: string,
    entityType: string,
    eventType: string,
    message: string,
  ): SimulationLogEntry {
    const entry: SimulationLogEntry = {
      id: nextId('log'),
      simulationTime,
      entityId,
      entityType,
      eventType,
      message,
    }
    this.entries.push(entry)
    if (this.entries.length > this.cap) {
      this.entries.splice(0, this.entries.length - this.cap)
    }
    return entry
  }

  all(): SimulationLogEntry[] {
    return this.entries
  }

  filter(entityId?: string, eventType?: string): SimulationLogEntry[] {
    return this.entries.filter((entry) => {
      if (entityId && entry.entityId !== entityId) {
        return false
      }
      if (eventType && entry.eventType !== eventType) {
        return false
      }
      return true
    })
  }
}
