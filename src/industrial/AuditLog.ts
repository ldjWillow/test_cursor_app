import type { AuditLogEntry } from './types.ts'
import { nextId } from '../utils/id.ts'

/** Audit log for manual force, mapping/connection changes, faults, external commands. */
export class AuditLog {
  private readonly entries: AuditLogEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries
  }

  record(action: string, actor: string, target?: string, detail?: string): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: nextId('audit'),
      time: Date.now(),
      action,
      actor,
      target,
      detail,
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    return entry
  }

  list(limit = 200): AuditLogEntry[] {
    return this.entries.slice(-limit).reverse()
  }

  clear(): void {
    this.entries.length = 0
  }
}

export const auditLog = new AuditLog()
