import type { HandshakeTemplate } from './types.ts'

export interface HandshakeState {
  id: string
  template: HandshakeTemplate
  commandSignal: string
  ackSignal?: string
  completeSignal?: string
  failSignal?: string
  commandIdSignal?: string
  sequenceSignal?: string
  active: boolean
  commandId?: number | string
  sequence?: number
  startedAt?: number
}

export interface HandshakeUpdate {
  signalId: string
  value: unknown
}

/**
 * PLC handshake templates: Simple Bool, Command+Ack, Ack+Complete, CommandId, Sequence.
 */
export class HandshakeManager {
  private readonly handshakes = new Map<string, HandshakeState>()

  create(input: Omit<HandshakeState, 'active'>): HandshakeState {
    const state: HandshakeState = { ...input, active: false }
    this.handshakes.set(state.id, state)
    return state
  }

  get(id: string): HandshakeState | undefined {
    return this.handshakes.get(id)
  }

  list(): HandshakeState[] {
    return [...this.handshakes.values()]
  }

  /**
   * Process an input command edge. Returns signal writes (ack/complete) and whether
   * the device command should execute.
   */
  onCommandEdge(
    handshakeId: string,
    rising: boolean,
    opts: { commandId?: number | string; sequence?: number } = {},
  ): { execute: boolean; updates: HandshakeUpdate[] } {
    const hs = this.handshakes.get(handshakeId)
    if (!hs) {
      return { execute: false, updates: [] }
    }

    if (hs.template === 'SIMPLE_BOOL') {
      return { execute: rising, updates: [] }
    }

    if (!rising) {
      // PLC cleared start → clear ack/complete
      const updates: HandshakeUpdate[] = []
      if (hs.ackSignal) {
        updates.push({ signalId: hs.ackSignal, value: false })
      }
      if (hs.completeSignal) {
        updates.push({ signalId: hs.completeSignal, value: false })
      }
      if (hs.failSignal) {
        updates.push({ signalId: hs.failSignal, value: false })
      }
      hs.active = false
      return { execute: false, updates }
    }

    hs.active = true
    hs.startedAt = Date.now()
    hs.commandId = opts.commandId
    hs.sequence = opts.sequence
    const updates: HandshakeUpdate[] = []
    if (hs.ackSignal) {
      updates.push({ signalId: hs.ackSignal, value: true })
    }
    return { execute: true, updates }
  }

  complete(handshakeId: string, ok = true): HandshakeUpdate[] {
    const hs = this.handshakes.get(handshakeId)
    if (!hs || !hs.active) {
      return []
    }
    const updates: HandshakeUpdate[] = []
    if (hs.template === 'COMMAND_ACK_COMPLETE' || hs.template === 'COMMAND_ID' || hs.template === 'SEQUENCE') {
      if (ok && hs.completeSignal) {
        updates.push({ signalId: hs.completeSignal, value: true })
      }
      if (!ok && hs.failSignal) {
        updates.push({ signalId: hs.failSignal, value: true })
      }
    }
    if (hs.template === 'COMMAND_ACK' && hs.ackSignal) {
      // stay acked until PLC clears
    }
    return updates
  }

  clear(): void {
    this.handshakes.clear()
  }
}

export const handshakeManager = new HandshakeManager()
