import { connectionManager } from './ConnectionManager.ts'
import { signalRegistry } from './SignalRegistry.ts'
import { signalMappingEngine } from './SignalMappingEngine.ts'
import { commandBus, feedbackBus } from './CommandBus.ts'
import { handshakeManager } from './HandshakeManager.ts'
import { controlAuthority } from './ControlAuthority.ts'
import { protocolMonitor } from './ProtocolMonitor.ts'
import { signalTrace } from './SignalTrace.ts'
import { auditLog } from './AuditLog.ts'
import { edgeDetector } from './EdgeDetector.ts'
import { networkFaultInjector } from './NetworkFaultInjector.ts'
import { plcScanSimulator } from './PlcScanSimulator.ts'
import { opcUaServerMode } from './adapters/OpcUaAdapter.ts'
import { getIoTemplate } from './DeviceIoTemplates.ts'
import type { ConnectionConfig, IndustrialSignalMapping, IoMapping } from './types.ts'
import { ProtocolType, SignalQuality } from './types.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import type { ProjectDocument } from '../types/index.ts'

export interface IndustrialProjectSlice {
  connections: ConnectionConfig[]
  signalMappings: IndustrialSignalMapping[]
  ioMappings: IoMapping[]
}

/**
 * IndustrialRuntime wires ConnectionManager ↔ SignalMapping ↔ Command/Feedback buses.
 * Call bootstrapFromProject after loading a ProjectDocument.
 */
export class IndustrialRuntime {
  private unsubscribers: Array<() => void> = []
  private ioMappings: IoMapping[] = []
  private bootstrapped = false

  bootstrapFromProject(project: ProjectDocument): void {
    this.reset()
    deviceRegistry.loadFromProject(project)

    // Register IO template signals for each device
    for (const device of project.devices) {
      const template = getIoTemplate(device.type)
      if (!template) {
        continue
      }
      for (const point of template.points) {
        signalRegistry.ensure(device.id, point.name, {
          type: point.type,
          direction: point.direction,
          writable: point.writable,
          value: point.type === 'BOOLEAN' ? false : point.type === 'STRING' ? '' : 0,
          description: point.description,
        })
      }
      // Default control: conveyors/stackers EXTERNAL (PLC), AGV EXTERNAL (ACS) in commissioning demos
      if (device.type === 'agv') {
        controlAuthority.set(device.id, 'EXTERNAL', 'SAFE_STOP')
      } else if (device.type === 'conveyor' || device.type === 'stacker') {
        controlAuthority.set(device.id, 'EXTERNAL', 'SAFE_STOP')
      } else {
        controlAuthority.set(device.id, 'INTERNAL', 'KEEP_RUNNING')
      }
    }

    const industrial = project.industrial
    if (industrial?.connections?.length) {
      connectionManager.loadConfigs(industrial.connections)
    }
    if (industrial?.signalMappings?.length) {
      signalMappingEngine.setMappings(industrial.signalMappings)
    }
    this.ioMappings = industrial?.ioMappings ?? []

    // PLC scan sync for SCAN_CYCLE mappings
    this.unsubscribers.push(
      plcScanSimulator.onTick(async () => {
        await this.scanCycle()
      }),
    )

    this.bootstrapped = true
  }

  async ensureDemoConnections(): Promise<IndustrialProjectSlice> {
    if (connectionManager.list().length > 0) {
      return this.exportSlice()
    }
    const opc = connectionManager.create({
      name: 'PLC OPC UA',
      type: ProtocolType.OPC_UA,
      settings: { endpointUrl: 'opc.tcp://127.0.0.1:4840', simulated: true },
      autoConnect: false,
    })
    const modbus = connectionManager.create({
      name: 'PLC Modbus TCP',
      type: ProtocolType.MODBUS_TCP,
      settings: { host: '127.0.0.1', port: 502, simulated: true },
      autoConnect: false,
    })
    const mqtt = connectionManager.create({
      name: 'ACS MQTT',
      type: ProtocolType.MQTT,
      settings: { brokerUrl: 'mqtt://127.0.0.1:1883', simulated: true },
      autoConnect: false,
    })
    const tcp = connectionManager.create({
      name: 'WCS TCP',
      type: ProtocolType.TCP_SOCKET,
      settings: { host: '127.0.0.1', port: 9000, simulated: true },
      autoConnect: false,
    })

    await connectionManager.start(opc.config.id)
    await connectionManager.start(modbus.config.id)
    await connectionManager.start(mqtt.config.id)
    await connectionManager.start(tcp.config.id)

    opcUaServerMode.start()

    return this.exportSlice()
  }

  async bindSubscriptions(): Promise<void> {
    for (const mapping of signalMappingEngine.getMappings()) {
      if (!mapping.enabled) {
        continue
      }
      if (mapping.direction === 'OUTPUT') {
        continue
      }
      const unsub = await connectionManager.subscribe(mapping.connectionId, mapping.address, (raw) => {
        const value = signalMappingEngine.applyInbound(raw, mapping)
        void commandBus.handleInputSignal(mapping.signalId, value, mapping.connectionId)
      })
      this.unsubscribers.push(unsub)
    }
  }

  async scanCycle(): Promise<void> {
    for (const mapping of signalMappingEngine.getMappings()) {
      if (!mapping.enabled) {
        continue
      }
      const mode = mapping.updateMode ?? 'EVENT_DRIVEN'
      if (mode !== 'SCAN_CYCLE' && mode !== 'POLLING') {
        continue
      }
      if (mapping.direction === 'OUTPUT' || mapping.direction === 'BIDIRECTIONAL') {
        const signal = signalRegistry.get(mapping.signalId)
        if (!signal) {
          continue
        }
        try {
          await connectionManager.write(
            mapping.connectionId,
            mapping.address,
            signalMappingEngine.applyOutbound(signal.value, mapping),
          )
        } catch {
          signalRegistry.setValue(mapping.signalId, signal.value, {
            quality: SignalQuality.DISCONNECTED,
            source: mapping.connectionId,
          })
        }
      }
      if (mapping.direction === 'INPUT' || mapping.direction === 'BIDIRECTIONAL') {
        try {
          const raw = await connectionManager.read(mapping.connectionId, mapping.address)
          const value = signalMappingEngine.applyInbound(raw, mapping)
          await commandBus.handleInputSignal(mapping.signalId, value, mapping.connectionId)
        } catch {
          signalRegistry.setValue(mapping.signalId, signalRegistry.get(mapping.signalId)?.value, {
            quality: SignalQuality.TIMEOUT,
            source: mapping.connectionId,
          })
        }
      }
    }
  }

  /** Push current device registry feedback into signals + protocol outputs. */
  async syncDeviceFeedback(): Promise<void> {
    for (const status of deviceRegistry.list()) {
      feedbackBus.publishDevice(status.deviceId, status.signals, 'Simulation')
      opcUaServerMode.exposeDevice(status.deviceId, status.signals)
    }
    await feedbackBus.flushOutputs()
  }

  onConnectionStatus(connectionId: string, status: string): void {
    if (status === 'DISCONNECTED' || status === 'ERROR' || status === 'DEGRADED') {
      const mapped = signalMappingEngine.byConnection(connectionId).map((m) => m.signalId)
      signalRegistry.setQualityForConnection(
        connectionId,
        status === 'DEGRADED' ? SignalQuality.UNCERTAIN : SignalQuality.DISCONNECTED,
        mapped,
      )
    }
  }

  exportSlice(): IndustrialProjectSlice {
    return {
      connections: connectionManager.exportConfigs(),
      signalMappings: signalMappingEngine.getMappings(),
      ioMappings: this.ioMappings,
    }
  }

  getIoMappings(): IoMapping[] {
    return this.ioMappings
  }

  setIoMappings(mappings: IoMapping[]): void {
    this.ioMappings = mappings
    auditLog.record('IO_MAPPING_CHANGE', 'user', undefined, `${mappings.length} mappings`)
  }

  reset(): void {
    for (const unsub of this.unsubscribers) {
      unsub()
    }
    this.unsubscribers = []
    connectionManager.clear()
    signalRegistry.clear()
    signalMappingEngine.clear()
    handshakeManager.clear()
    controlAuthority.clear()
    commandBus.clear()
    edgeDetector.reset()
    networkFaultInjector.clear()
    protocolMonitor.clear()
    signalTrace.clear()
    plcScanSimulator.stop()
    opcUaServerMode.stop()
    this.ioMappings = []
    this.bootstrapped = false
  }

  isBootstrapped(): boolean {
    return this.bootstrapped
  }
}

export const industrialRuntime = new IndustrialRuntime()

// Keep connection quality in sync
connectionManager.onStatus((id, status) => {
  industrialRuntime.onConnectionStatus(id, status)
})
