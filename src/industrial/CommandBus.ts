import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import type { DeviceCommand, DeviceResponse } from '../virtual/types.ts'
import { controlAuthority } from './ControlAuthority.ts'
import { auditLog } from './AuditLog.ts'
import { edgeDetector } from './EdgeDetector.ts'
import { handshakeManager } from './HandshakeManager.ts'
import { signalRegistry } from './SignalRegistry.ts'
import { signalTrace } from './SignalTrace.ts'
import { signalMappingEngine } from './SignalMappingEngine.ts'
import { connectionManager } from './ConnectionManager.ts'
import type { ControlMode, TimeoutStrategy } from './types.ts'
import { nextId } from '../utils/id.ts'

export interface PendingCommand {
  commandId: string
  deviceId: string
  commandType: string
  sentAt: number
  timeoutMs: number
  strategy: TimeoutStrategy
  retries: number
  maxRetries: number
}

/**
 * Command Bus — external signals become DeviceCommands (never raw state writes).
 */
export class CommandBus {
  private readonly pending = new Map<string, PendingCommand>()
  private readonly timeoutHandlers = new Map<string, ReturnType<typeof setTimeout>>()

  async dispatch(input: {
    deviceId: string
    commandType: string
    parameters?: Record<string, unknown>
    source: ControlMode
    commandId?: string
    timeoutMs?: number
    strategy?: TimeoutStrategy
  }): Promise<DeviceResponse> {
    const auth = controlAuthority.authorize(input.deviceId, input.source)
    if (!auth.allowed) {
      const response: DeviceResponse = {
        commandId: input.commandId ?? nextId('cmd'),
        deviceId: input.deviceId,
        status: 'rejected',
        message: auth.reason ?? 'CONTROL_AUTHORITY_CONFLICT',
        timestamp: Date.now(),
      }
      auditLog.record('EXTERNAL_COMMAND_REJECTED', input.source, input.deviceId, response.message)
      return response
    }

    const commandId = input.commandId ?? nextId('cmd')
    const timeoutMs = input.timeoutMs ?? 10_000
    const strategy = input.strategy ?? 'FAIL'

    this.trackPending({
      commandId,
      deviceId: input.deviceId,
      commandType: input.commandType,
      sentAt: Date.now(),
      timeoutMs,
      strategy,
      retries: 0,
      maxRetries: 2,
    })

    const response = await deviceRegistry.sendCommand({
      deviceId: input.deviceId,
      commandType: input.commandType,
      parameters: input.parameters,
      commandId,
    })

    auditLog.record('EXTERNAL_COMMAND', input.source, input.deviceId, `${input.commandType}:${response.status}`)

    if (response.status === 'accepted' || response.status === 'completed') {
      this.clearPending(commandId)
    }

    return response
  }

  /**
   * Map an inbound signal write through edge detection → optional handshake → DeviceCommand.
   */
  async handleInputSignal(signalId: string, value: unknown, source: string): Promise<DeviceResponse[]> {
    const signal = signalRegistry.get(signalId)
    if (!signal) {
      return []
    }
    const oldValue = signal.value
    // Seed edge detector so the first false→true after registration is detected
    if (edgeDetector.getPrevious(signalId) === undefined) {
      edgeDetector.observe(signalId, oldValue)
    }
    signalRegistry.setValue(signalId, value, { source, quality: 'GOOD' })
    signalTrace.record({
      signalId,
      signalName: signal.name,
      oldValue,
      newValue: value,
      source,
    })

    const edges = edgeDetector.observe(signalId, value)
    const rising = edges.some((e) => e.kind === 'rising')
    const responses: DeviceResponse[] = []

    // Handshake-aware start signals
    for (const hs of handshakeManager.list()) {
      if (hs.commandSignal !== signalId) {
        continue
      }
      const result = handshakeManager.onCommandEdge(hs.id, rising, {
        commandId: typeof value === 'object' && value && 'commandId' in (value as object)
          ? (value as { commandId: string }).commandId
          : undefined,
      })
      for (const update of result.updates) {
        const prev = signalRegistry.get(update.signalId)?.value
        signalRegistry.setValue(update.signalId, update.value, { source: 'Handshake' })
        signalTrace.record({
          signalId: update.signalId,
          signalName: update.signalId,
          oldValue: prev,
          newValue: update.value,
          source: 'Handshake',
        })
        await this.publishMappedOutputs(update.signalId)
      }
      if (result.execute) {
        const commandType = inferCommandType(signal.name)
        responses.push(
          await this.dispatch({
            deviceId: signal.deviceId,
            commandType,
            source: 'EXTERNAL',
          }),
        )
      }
    }

    // Direct mapping without handshake: Start/Stop/Reset rising edges
    if (rising && !handshakeManager.list().some((h) => h.commandSignal === signalId)) {
      const commandType = inferCommandType(signal.name)
      if (commandType) {
        responses.push(
          await this.dispatch({
            deviceId: signal.deviceId,
            commandType,
            source: 'EXTERNAL',
            parameters: typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined,
          }),
        )
      }
    }

    return responses
  }

  async publishMappedOutputs(signalId: string): Promise<void> {
    const signal = signalRegistry.get(signalId)
    if (!signal) {
      return
    }
    for (const mapping of signalMappingEngine.bySignal(signalId)) {
      if (mapping.direction === 'INPUT') {
        continue
      }
      const outbound = signalMappingEngine.applyOutbound(signal.value, mapping)
      try {
        await connectionManager.write(mapping.connectionId, mapping.address, outbound)
      } catch {
        // connection may be down — quality handled elsewhere
      }
    }
  }

  private trackPending(pending: PendingCommand): void {
    this.clearPending(pending.commandId)
    this.pending.set(pending.commandId, pending)
    const timer = setTimeout(() => {
      void this.onTimeout(pending.commandId)
    }, pending.timeoutMs)
    this.timeoutHandlers.set(pending.commandId, timer)
  }

  private clearPending(commandId: string): void {
    const timer = this.timeoutHandlers.get(commandId)
    if (timer) {
      clearTimeout(timer)
    }
    this.timeoutHandlers.delete(commandId)
    this.pending.delete(commandId)
  }

  private async onTimeout(commandId: string): Promise<void> {
    const pending = this.pending.get(commandId)
    if (!pending) {
      return
    }
    auditLog.record('COMMAND_TIMEOUT', 'system', pending.deviceId, pending.commandType)
    if (pending.strategy === 'IGNORE') {
      this.clearPending(commandId)
      return
    }
    if (pending.strategy === 'RETRY' && pending.retries < pending.maxRetries) {
      pending.retries += 1
      await deviceRegistry.sendCommand({
        deviceId: pending.deviceId,
        commandType: pending.commandType,
        commandId,
      })
      this.trackPending(pending)
      return
    }
    // FAIL
    this.clearPending(commandId)
  }

  listPending(): PendingCommand[] {
    return [...this.pending.values()]
  }

  clear(): void {
    for (const id of [...this.timeoutHandlers.keys()]) {
      this.clearPending(id)
    }
  }
}

function inferCommandType(signalName: string): string {
  const n = signalName.toLowerCase()
  if (n.includes('start') || n === 'taskcommand') {
    return n === 'taskcommand' || n.includes('task') ? 'START_TASK' : 'START'
  }
  if (n.includes('stop')) {
    return 'STOP'
  }
  if (n.includes('reset')) {
    return 'RESET'
  }
  if (n.includes('cancel')) {
    return 'CANCEL'
  }
  if (n.includes('mission') || n.includes('move')) {
    return 'MOVE'
  }
  return signalName.toUpperCase()
}

/**
 * Feedback Bus — device state → signals → protocol outputs.
 */
export class FeedbackBus {
  publishDevice(deviceId: string, signals: Record<string, unknown>, source = 'Simulation'): void {
    for (const [name, value] of Object.entries(signals)) {
      const signalId = `${deviceId}.${name}`
      const existing = signalRegistry.get(signalId)
      const oldValue = existing?.value
      signalRegistry.syncDeviceSignals(deviceId, { [name]: value }, source)
      signalTrace.record({
        signalId,
        signalName: name,
        oldValue,
        newValue: value,
        source,
      })
    }
  }

  async flushOutputs(deviceId?: string): Promise<void> {
    const signals = signalRegistry.list(deviceId ? { deviceId } : undefined)
    for (const signal of signals) {
      if (signal.direction === 'INPUT' || signal.direction === 'INTERNAL') {
        continue
      }
      for (const mapping of signalMappingEngine.bySignal(signal.id)) {
        if (mapping.direction === 'INPUT') {
          continue
        }
        const outbound = signalMappingEngine.applyOutbound(signal.value, mapping)
        try {
          await connectionManager.write(mapping.connectionId, mapping.address, outbound)
        } catch {
          // ignore offline
        }
      }
    }
  }
}

export const commandBus = new CommandBus()
export const feedbackBus = new FeedbackBus()

/** Convenience for command typing when callers already built DeviceCommand. */
export async function dispatchDeviceCommand(
  command: Omit<DeviceCommand, 'timestamp'> & { timestamp?: number },
  source: ControlMode = 'EXTERNAL',
): Promise<DeviceResponse> {
  return commandBus.dispatch({
    deviceId: command.deviceId,
    commandType: command.commandType,
    parameters: command.parameters,
    commandId: command.commandId,
    source,
  })
}
