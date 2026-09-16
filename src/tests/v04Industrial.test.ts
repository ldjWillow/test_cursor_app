import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { ConnectionManager } from '../industrial/ConnectionManager.ts'
import { SignalRegistry } from '../industrial/SignalRegistry.ts'
import { SignalMappingEngine, transformInbound, transformOutbound, parseModbusAddress } from '../industrial/SignalMappingEngine.ts'
import { EdgeDetector } from '../industrial/EdgeDetector.ts'
import { HandshakeManager } from '../industrial/HandshakeManager.ts'
import { ControlAuthority } from '../industrial/ControlAuthority.ts'
import { FeedbackBus } from '../industrial/CommandBus.ts'
import { ProtocolMonitor } from '../industrial/ProtocolMonitor.ts'
import { SignalTrace } from '../industrial/SignalTrace.ts'
import { NetworkFaultInjector } from '../industrial/NetworkFaultInjector.ts'
import { HeartbeatManager } from '../industrial/HeartbeatManager.ts'
import { ReconnectPolicy } from '../industrial/ReconnectPolicy.ts'
import { PlcScanSimulator } from '../industrial/PlcScanSimulator.ts'
import { OpcUaAdapter, OpcUaServerMode } from '../industrial/adapters/OpcUaAdapter.ts'
import { ModbusTcpAdapter } from '../industrial/adapters/ModbusTcpAdapter.ts'
import { MqttAdapter, topicMatches } from '../industrial/adapters/MqttAdapter.ts'
import { TcpSocketAdapter } from '../industrial/adapters/TcpSocketAdapter.ts'
import { InMemoryAdapter } from '../industrial/adapters/InMemoryAdapter.ts'
import { expandTopicTemplate, getIoTemplate } from '../industrial/DeviceIoTemplates.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { VirtualConveyor, VirtualAgv, VirtualStacker } from '../virtual/devices.ts'
import { runPlcConveyorDemo, runStackerPlcDemo } from '../industrial/demos/plcDemos.ts'
import { runModbusConveyorDemo, runMqttAgvDemo } from '../industrial/demos/modbusMqttDemos.ts'
import { runFullIntegrationDemo } from '../industrial/demos/fullIntegrationDemo.ts'
import { migrateProject } from '../persistence/migrate.ts'
import { SCHEMA_VERSION } from '../types/index.ts'
import { ProtocolType, EnvironmentName, SignalQuality } from '../industrial/types.ts'
import { connectionManager } from '../industrial/ConnectionManager.ts'
import { signalRegistry } from '../industrial/SignalRegistry.ts'
import { signalMappingEngine } from '../industrial/SignalMappingEngine.ts'
import { handshakeManager } from '../industrial/HandshakeManager.ts'
import { controlAuthority } from '../industrial/ControlAuthority.ts'
import { commandBus } from '../industrial/CommandBus.ts'
import { edgeDetector } from '../industrial/EdgeDetector.ts'
import { protocolMonitor } from '../industrial/ProtocolMonitor.ts'
import { networkFaultInjector } from '../industrial/NetworkFaultInjector.ts'

describe('ProtocolAdapter core', () => {
  it('InMemoryAdapter read/write/subscribe', async () => {
    const adapter = new InMemoryAdapter('mem-1')
    await adapter.connect()
    const values: unknown[] = []
    const unsub = await adapter.subscribe('a', (v) => values.push(v))
    await adapter.write('a', 42)
    expect(await adapter.read('a')).toBe(42)
    expect(values).toEqual([42])
    unsub()
    const test = await adapter.testConnection!()
    expect(test.ok).toBe(true)
    expect(test.stages.some((s) => s.stage === 'TCP')).toBe(true)
  })
})

describe('OPC UA Adapter', () => {
  it('connects simulated, read/write/browse/subscribe', async () => {
    const adapter = new OpcUaAdapter('opc-1', {
      endpointUrl: 'opc.tcp://127.0.0.1:4840',
      simulated: true,
    })
    await adapter.connect()
    expect(adapter.isConnected()).toBe(true)
    await adapter.write('ns=2;s=Conveyor01.Running', true)
    expect(await adapter.read('ns=2;s=Conveyor01.Running')).toBe(true)
    const seen: unknown[] = []
    await adapter.subscribe('ns=2;s=Conveyor01.Running', (v) => seen.push(v))
    await adapter.write('ns=2;s=Conveyor01.Running', false)
    expect(seen).toContain(false)
    expect(adapter.browse('ns=2;s=').length).toBeGreaterThan(0)
    const server = new OpcUaServerMode()
    server.start()
    server.exposeDevice('Conveyor01', { Running: true, Fault: false })
    expect(server.getNode('ns=2;s=Conveyor01.Running')).toBe(true)
    await adapter.disconnect()
  })
})

describe('Modbus TCP Adapter', () => {
  it('reads/writes coils and holding registers', async () => {
    const adapter = new ModbusTcpAdapter('mb-1', { host: '127.0.0.1', port: 502, simulated: true })
    await adapter.connect()
    await adapter.writeCoil(0, true)
    expect(await adapter.readCoil(0)).toBe(true)
    await adapter.writeHoldingRegister(0, 123)
    expect(await adapter.readHoldingRegister(0)).toBe(123)
    expect(parseModbusAddress('40001').area).toBe('holding')
    expect(parseModbusAddress('coil:1').offset).toBe(0)
  })
})

describe('MQTT Adapter', () => {
  it('publish/subscribe with wildcards and topic templates', async () => {
    const adapter = new MqttAdapter('mqtt-1', { brokerUrl: 'mqtt://127.0.0.1:1883', simulated: true })
    await adapter.connect()
    const values: unknown[] = []
    await adapter.subscribe('warehouse/agv/+/status', (v) => values.push(v))
    const topic = await adapter.publishTemplate(
      'warehouse/{deviceType}/{deviceId}/status',
      { deviceType: 'agv', deviceId: 'AGV01' },
      { status: 'MOVING' },
    )
    expect(topic).toBe('warehouse/agv/AGV01/status')
    expect(values[0]).toEqual({ status: 'MOVING' })
    expect(topicMatches('warehouse/#', 'warehouse/agv/01/command')).toBe(true)
    expect(expandTopicTemplate('a/{x}/b', { x: '1' })).toBe('a/1/b')
  })
})

describe('TCP Socket Adapter', () => {
  it('JSON line protocol send/receive', async () => {
    const adapter = new TcpSocketAdapter('tcp-1', { host: '127.0.0.1', port: 9000, simulated: true })
    await adapter.connect()
    const messages: unknown[] = []
    adapter.onMessage((m) => messages.push(m))
    await adapter.send({ type: 'command', deviceId: 'AGV01', command: 'MOVE' })
    expect(messages[0]).toMatchObject({ type: 'command', deviceId: 'AGV01' })
    expect(await adapter.read('inbox:last')).toMatchObject({ command: 'MOVE' })
  })
})

describe('ConnectionManager', () => {
  let cm: ConnectionManager

  beforeEach(() => {
    cm = new ConnectionManager()
  })

  afterEach(() => {
    cm.clear()
  })

  it('creates, connects, tests, and sanitizes secrets', async () => {
    const managed = cm.create({
      name: 'Test OPC',
      type: ProtocolType.OPC_UA,
      settings: { simulated: true, password: 'secret' },
      autoConnect: false,
      environment: EnvironmentName.Development,
    })
    await cm.start(managed.config.id)
    expect(managed.status).toBe('CONNECTED')
    const test = await cm.test(managed.config.id)
    expect(test.ok).toBe(true)
    expect(test.stages.map((s) => s.stage)).toContain('AUTHENTICATION')
    const exported = cm.exportConfigs()[0]!
    expect(exported.settings.password).toBeUndefined()
    expect(exported.secrets?.password).toMatchObject({ kind: 'secret-ref' })
  })

  it('forbids auto-connect to Production', () => {
    expect(() =>
      cm.create({
        name: 'Prod',
        type: ProtocolType.MQTT,
        environment: EnvironmentName.Production,
        autoConnect: true,
        settings: {},
      }),
    ).toThrow(/Production/)
  })

  it('enforces READ_ONLY permission on write', async () => {
    const managed = cm.create({
      name: 'RO',
      type: ProtocolType.OPC_UA,
      permission: 'READ_ONLY' as const,
      settings: { simulated: true },
    })
    await cm.start(managed.config.id)
    await expect(cm.write(managed.config.id, 'ns=2;s=x', 1)).rejects.toThrow(/READ_ONLY/)
  })
})

describe('Reconnect & Heartbeat', () => {
  it('ReconnectPolicy backs off and stops at max attempts', () => {
    const policy = new ReconnectPolicy({ initialDelayMs: 10, maxDelayMs: 100, backoff: 2, maxAttempts: 3 })
    expect(policy.nextDelayMs()).toBe(10)
    expect(policy.nextDelayMs()).toBe(20)
    expect(policy.nextDelayMs()).toBe(40)
    expect(policy.nextDelayMs()).toBeUndefined()
  })

  it('HeartbeatManager detects lost beat', () => {
    const hb = new HeartbeatManager()
    let lost = false
    hb.setLostHandler(() => {
      lost = true
    })
    hb.configure('c1', { enabled: true, intervalMs: 10, timeoutMs: 20 })
    expect(hb.isAlive('c1')).toBe(false)
    hb.beat('c1', Date.now())
    expect(hb.isAlive('c1')).toBe(true)
    expect(lost).toBe(false)
  })
})

describe('Signal Mapping / Edge / Handshake', () => {
  it('scale/offset float mapping', () => {
    expect(transformInbound(123, { dataType: 'FLOAT', scale: 0.1, offset: 0 })).toBeCloseTo(12.3)
    expect(transformOutbound(12.3, { dataType: 'FLOAT', scale: 0.1, offset: 0 })).toBeCloseTo(123)
  })

  it('edge detector fires rising once', () => {
    const edge = new EdgeDetector()
    expect(edge.observe('s', false)).toEqual([])
    expect(edge.observe('s', false)).toEqual([])
    const rising = edge.observe('s', true)
    expect(rising.some((e) => e.kind === 'rising')).toBe(true)
    expect(edge.observe('s', true)).toEqual([])
  })

  it('handshake command+ack+complete', () => {
    const hs = new HandshakeManager()
    hs.create({
      id: 'h1',
      template: 'COMMAND_ACK_COMPLETE',
      commandSignal: 'dev.Start',
      ackSignal: 'dev.Ack',
      completeSignal: 'dev.Complete',
    })
    const start = hs.onCommandEdge('h1', true)
    expect(start.execute).toBe(true)
    expect(start.updates).toEqual([{ signalId: 'dev.Ack', value: true }])
    const done = hs.complete('h1', true)
    expect(done).toEqual([{ signalId: 'dev.Complete', value: true }])
    const clear = hs.onCommandEdge('h1', false)
    expect(clear.updates.some((u) => u.signalId === 'dev.Ack' && u.value === false)).toBe(true)
  })
})

describe('Control Authority', () => {
  it('rejects INTERNAL command on EXTERNAL device', () => {
    const auth = new ControlAuthority()
    auth.set('agv-1', 'EXTERNAL', 'SAFE_STOP')
    const decision = auth.authorize('agv-1', 'INTERNAL')
    expect(decision.allowed).toBe(false)
    expect(decision.event).toBe('CONTROL_AUTHORITY_CONFLICT')
  })
})

describe('Fault injection & quality', () => {
  it('packet loss and disconnect', () => {
    const faults = new NetworkFaultInjector()
    faults.configure('c1', { packetLossPct: 100 })
    expect(faults.shouldDrop('c1')).toBe(true)
    faults.configure('c1', { packetLossPct: 0, disconnect: true })
    expect(faults.isDisconnected('c1')).toBe(true)
  })

  it('signal quality DISCONNECTED', () => {
    const registry = new SignalRegistry()
    registry.ensure('c', 'Running', { type: 'BOOLEAN', direction: 'OUTPUT' })
    registry.setQualityForConnection('conn-1', SignalQuality.DISCONNECTED, ['c.Running'])
    expect(registry.get('c.Running')?.quality).toBe('DISCONNECTED')
  })
})

describe('IO templates', () => {
  it('provides conveyor/stacker/agv templates', () => {
    expect(getIoTemplate('conveyor')?.points.some((p) => p.name === 'Start')).toBe(true)
    expect(getIoTemplate('stacker')?.points.some((p) => p.name === 'Complete')).toBe(true)
    expect(getIoTemplate('agv')?.points.some((p) => p.name === 'Battery')).toBe(true)
  })
})

describe('PLC scan', () => {
  it('ticks scan cycle handlers', async () => {
    const scan = new PlcScanSimulator()
    let cycles = 0
    scan.onTick(() => {
      cycles += 1
    })
    await scan.tickOnce()
    await scan.tickOnce()
    expect(cycles).toBe(2)
  })
})

describe('Command / Feedback bus', () => {
  beforeEach(() => {
    deviceRegistry.clear()
    connectionManager.clear()
    signalRegistry.clear()
    signalMappingEngine.clear()
    handshakeManager.clear()
    controlAuthority.clear()
    commandBus.clear()
    edgeDetector.reset()
    protocolMonitor.clear()
    networkFaultInjector.clear()
  })

  it('maps rising Start to DeviceCommand START', async () => {
    deviceRegistry.register(new VirtualConveyor('conveyor-1', 'C1'))
    controlAuthority.set('conveyor-1', 'EXTERNAL', 'SAFE_STOP')
    signalRegistry.ensure('conveyor-1', 'Start', { direction: 'INPUT', writable: true, type: 'BOOLEAN' })
    edgeDetector.observe('conveyor-1.Start', false)
    const responses = await commandBus.handleInputSignal('conveyor-1.Start', true, 'OPC-UA')
    expect(responses[0]?.status).toBe('accepted')
    expect(deviceRegistry.get('conveyor-1')?.getStatus().state).toBe('RUNNING')
  })

  it('rejects authority conflict via command bus', async () => {
    deviceRegistry.register(new VirtualAgv('agv-1', 'A1'))
    controlAuthority.set('agv-1', 'EXTERNAL', 'SAFE_STOP')
    const response = await commandBus.dispatch({
      deviceId: 'agv-1',
      commandType: 'MOVE',
      source: 'INTERNAL',
    })
    expect(response.status).toBe('rejected')
    expect(response.message).toContain('CONTROL_AUTHORITY_CONFLICT')
  })

  it('feedback bus publishes device signals', () => {
    const bus = new FeedbackBus()
    signalRegistry.ensure('conveyor-1', 'Running', { direction: 'OUTPUT', type: 'BOOLEAN' })
    bus.publishDevice('conveyor-1', { Running: true }, 'Simulation')
    expect(signalRegistry.get('conveyor-1.Running')?.value).toBe(true)
  })
})

describe('Protocol monitor & signal trace', () => {
  it('records protocol log and CSV trace', () => {
    const monitor = new ProtocolMonitor()
    monitor.log({
      protocol: 'OPC_UA',
      connectionId: 'c1',
      direction: 'TX',
      address: 'ns=2;s=X',
      value: true,
      result: 'OK',
    })
    expect(monitor.list({ protocol: 'OPC_UA' })).toHaveLength(1)

    const trace = new SignalTrace()
    trace.record({
      signalId: 's1',
      signalName: 'Running',
      oldValue: false,
      newValue: true,
      source: 'Simulation',
    })
    expect(trace.toCsv()).toContain('Running')
    expect(trace.graphSeries(['s1']).s1?.length).toBe(1)
  })
})

describe('V0.4 demos', () => {
  beforeEach(() => {
    deviceRegistry.clear()
    connectionManager.clear()
    signalRegistry.clear()
    signalMappingEngine.clear()
    handshakeManager.clear()
    controlAuthority.clear()
    commandBus.clear()
    edgeDetector.reset()
    protocolMonitor.clear()
    networkFaultInjector.clear()
  })

  it('PLC conveyor demo', async () => {
    const steps = await runPlcConveyorDemo('conveyor-1')
    expect(steps.some((s) => s.event === 'CONV_RUNNING')).toBe(true)
    expect(steps.some((s) => s.event === 'SENSOR_ON')).toBe(true)
    expect(steps.some((s) => s.event === 'DEMO_COMPLETE')).toBe(true)
  })

  it('Stacker PLC handshake demo', async () => {
    const steps = await runStackerPlcDemo('stacker-1')
    expect(steps.some((s) => s.event === 'ACK')).toBe(true)
    expect(steps.some((s) => s.event === 'COMPLETE')).toBe(true)
  })

  it('Modbus conveyor demo with scale', async () => {
    const steps = await runModbusConveyorDemo('conveyor-1')
    expect(steps.some((s) => s.event === 'SPEED_REGISTER')).toBe(true)
  })

  it('MQTT AGV demo', async () => {
    const steps = await runMqttAgvDemo('agv-1')
    expect(steps.some((s) => s.event === 'TASK_COMPLETE')).toBe(true)
  })

  it('full WCS/ACS/PLC integration demo', async () => {
    const { ok, steps } = await runFullIntegrationDemo()
    expect(ok).toBe(true)
    expect(steps.length).toBeGreaterThan(10)
  })
})

describe('Schema migration to 0.4', () => {
  it('migrates 0.3 project and adds industrial slice', () => {
    const migrated = migrateProject({
      schemaVersion: '0.3',
      project: { name: 'Demo', version: 3 },
      devices: [],
      nodes: [],
      edges: [],
      tasks: [],
      simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0 },
    })
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.industrial).toEqual({
      connections: [],
      signalMappings: [],
      ioMappings: [],
    })
  })
})

describe('Stacker virtual advance', () => {
  it('progresses MOVING→PICKING→PLACING→COMPLETE', async () => {
    const stacker = new VirtualStacker('s1', 'S1')
    await stacker.receiveCommand({
      commandId: '1',
      deviceId: 's1',
      commandType: 'INBOUND',
      timestamp: 1,
      parameters: { column: 10, level: 5 },
    })
    expect(stacker.advance()).toBe('PICKING')
    expect(stacker.advance()).toBe('PLACING')
    expect(stacker.advance()).toBe('COMPLETE')
    expect(stacker.getStatus().signals.CurrentColumn).toBe(10)
  })
})

describe('SignalMappingEngine', () => {
  it('stores and filters mappings', () => {
    const engine = new SignalMappingEngine()
    engine.add({
      id: 'm1',
      signalId: 'c.Start',
      connectionId: 'opc',
      address: 'ns=2;s=Start',
      direction: 'INPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    })
    expect(engine.byConnection('opc')).toHaveLength(1)
    engine.enable('m1', false)
    expect(engine.byConnection('opc')).toHaveLength(0)
  })
})
