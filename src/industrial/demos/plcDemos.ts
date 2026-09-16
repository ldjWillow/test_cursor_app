import { connectionManager } from '../ConnectionManager.ts'
import { signalRegistry } from '../SignalRegistry.ts'
import { signalMappingEngine } from '../SignalMappingEngine.ts'
import { commandBus, feedbackBus } from '../CommandBus.ts'
import { handshakeManager } from '../HandshakeManager.ts'
import { controlAuthority } from '../ControlAuthority.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { VirtualConveyor, VirtualStacker } from '../../virtual/devices.ts'
import { ProtocolType } from '../types.ts'
import { nextId } from '../../utils/id.ts'

export interface DemoStep {
  time: number
  event: string
  detail?: string
}

/**
 * PLC Conveyor Demo:
 * PLC Simulator → OPC UA → WarehouseSim → Conveyor01 → Sensor01 → PLC
 */
export async function runPlcConveyorDemo(conveyorId = 'conveyor-1'): Promise<DemoStep[]> {
  const steps: DemoStep[] = []
  const t0 = Date.now()
  const mark = (event: string, detail?: string) => {
    steps.push({ time: Date.now() - t0, event, detail })
  }

  if (!deviceRegistry.get(conveyorId)) {
    deviceRegistry.register(new VirtualConveyor(conveyorId, 'Conveyor01'))
  }
  controlAuthority.set(conveyorId, 'EXTERNAL', 'SAFE_STOP')

  signalRegistry.ensure(conveyorId, 'Start', { direction: 'INPUT', writable: true, type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'Running', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'SensorOut', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'Ack', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'Complete', { direction: 'OUTPUT', type: 'BOOLEAN' })

  const conn =
    connectionManager.get('demo-opcua') ??
    connectionManager.create({
      id: 'demo-opcua',
      name: 'PLC Simulator OPC UA',
      type: ProtocolType.OPC_UA,
      settings: { endpointUrl: 'opc.tcp://127.0.0.1:4840', simulated: true },
    })
  if (!conn.adapter.isConnected()) {
    await connectionManager.start(conn.config.id)
  }

  signalMappingEngine.setMappings([
    {
      id: 'map-start',
      signalId: `${conveyorId}.Start`,
      connectionId: conn.config.id,
      address: 'ns=2;s=Conveyor01.Start',
      direction: 'INPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
    {
      id: 'map-running',
      signalId: `${conveyorId}.Running`,
      connectionId: conn.config.id,
      address: 'ns=2;s=Conveyor01.Running',
      direction: 'OUTPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
    {
      id: 'map-sensor',
      signalId: `${conveyorId}.SensorOut`,
      connectionId: conn.config.id,
      address: 'ns=2;s=Sensor01.Active',
      direction: 'OUTPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
  ])

  handshakeManager.create({
    id: 'hs-conv',
    template: 'COMMAND_ACK_COMPLETE',
    commandSignal: `${conveyorId}.Start`,
    ackSignal: `${conveyorId}.Ack`,
    completeSignal: `${conveyorId}.Complete`,
  })

  mark('PLC_WRITE', 'Conveyor01.Start = true')
  await connectionManager.write(conn.config.id, 'ns=2;s=Conveyor01.Start', true)
  const rawStart = await connectionManager.read(conn.config.id, 'ns=2;s=Conveyor01.Start')
  await commandBus.handleInputSignal(`${conveyorId}.Start`, rawStart, 'OPC-UA')

  const status = deviceRegistry.get(conveyorId)?.getStatus()
  feedbackBus.publishDevice(conveyorId, status?.signals ?? { Running: true }, 'Simulation')
  await feedbackBus.flushOutputs()
  mark('CONV_RUNNING', String(await connectionManager.read(conn.config.id, 'ns=2;s=Conveyor01.Running')))

  const conveyor = deviceRegistry.get(conveyorId) as VirtualConveyor
  conveyor.sensorFlags.SensorOut = true
  feedbackBus.publishDevice(conveyorId, conveyor.getStatus().signals, 'Simulation')
  await feedbackBus.flushOutputs()
  mark('SENSOR_ON', String(await connectionManager.read(conn.config.id, 'ns=2;s=Sensor01.Active')))

  mark('PLC_STOP', 'Start = false → STOP')
  await connectionManager.write(conn.config.id, 'ns=2;s=Conveyor01.Start', false)
  await commandBus.handleInputSignal(`${conveyorId}.Start`, false, 'OPC-UA')
  await commandBus.dispatch({
    deviceId: conveyorId,
    commandType: 'STOP',
    source: 'EXTERNAL',
  })
  feedbackBus.publishDevice(conveyorId, deviceRegistry.get(conveyorId)!.getStatus().signals, 'Simulation')
  await feedbackBus.flushOutputs()
  mark('CONV_STOPPED', deviceRegistry.get(conveyorId)!.getStatus().state)

  // Clear handshake
  for (const update of handshakeManager.onCommandEdge('hs-conv', false).updates) {
    signalRegistry.setValue(update.signalId, update.value, { source: 'Handshake' })
  }

  mark('DEMO_COMPLETE')
  return steps
}

/**
 * Stacker PLC Demo with Command + Ack + Complete handshake.
 */
export async function runStackerPlcDemo(stackerId = 'stacker-1'): Promise<DemoStep[]> {
  const steps: DemoStep[] = []
  const t0 = Date.now()
  const mark = (event: string, detail?: string) => steps.push({ time: Date.now() - t0, event, detail })

  if (!deviceRegistry.get(stackerId)) {
    deviceRegistry.register(new VirtualStacker(stackerId, 'Stacker01'))
  }
  controlAuthority.set(stackerId, 'EXTERNAL', 'SAFE_STOP')
  signalRegistry.ensure(stackerId, 'TaskCommand', { direction: 'INPUT', writable: true, type: 'BOOLEAN' })
  signalRegistry.ensure(stackerId, 'Ack', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(stackerId, 'Complete', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(stackerId, 'CurrentColumn', { direction: 'OUTPUT', type: 'INT', value: 0 })
  signalRegistry.ensure(stackerId, 'CurrentLevel', { direction: 'OUTPUT', type: 'INT', value: 0 })

  const conn =
    connectionManager.get('demo-opcua-stacker') ??
    connectionManager.create({
      id: 'demo-opcua-stacker',
      name: 'Stacker PLC OPC UA',
      type: ProtocolType.OPC_UA,
      settings: { simulated: true, endpointUrl: 'opc.tcp://127.0.0.1:4840' },
    })
  if (!conn.adapter.isConnected()) {
    await connectionManager.start(conn.config.id)
  }

  handshakeManager.create({
    id: 'hs-stacker',
    template: 'COMMAND_ACK_COMPLETE',
    commandSignal: `${stackerId}.TaskCommand`,
    ackSignal: `${stackerId}.Ack`,
    completeSignal: `${stackerId}.Complete`,
  })

  mark('PLC_INBOUND', 'Column=10 Level=5')
  await connectionManager.write(conn.config.id, 'ns=2;s=Stacker01.Command', true)
  await connectionManager.write(conn.config.id, 'ns=2;s=Stacker01.Column', 10)
  await connectionManager.write(conn.config.id, 'ns=2;s=Stacker01.Level', 5)

  const hs = handshakeManager.onCommandEdge('hs-stacker', true, { commandId: nextId('plc') })
  for (const update of hs.updates) {
    signalRegistry.setValue(update.signalId, update.value, { source: 'Handshake' })
  }
  mark('ACK', 'true')

  await commandBus.dispatch({
    deviceId: stackerId,
    commandType: 'INBOUND',
    source: 'EXTERNAL',
    parameters: { column: 10, level: 5 },
  })
  const stacker = deviceRegistry.get(stackerId) as InstanceType<typeof VirtualStacker>
  mark('MOVING', stacker.state)
  stacker.advance()
  mark('PICKING', stacker.state)
  stacker.advance()
  mark('PLACING', stacker.state)
  stacker.advance()
  mark('COMPLETE', stacker.state)

  for (const update of handshakeManager.complete('hs-stacker', true)) {
    signalRegistry.setValue(update.signalId, update.value, { source: 'Handshake' })
  }
  feedbackBus.publishDevice(stackerId, stacker.getStatus().signals, 'Simulation')
  await connectionManager.write(conn.config.id, 'ns=2;s=Stacker01.Complete', true)
  mark('PLC_COMPLETE', 'Complete=true')

  // PLC clears start
  for (const update of handshakeManager.onCommandEdge('hs-stacker', false).updates) {
    signalRegistry.setValue(update.signalId, update.value, { source: 'Handshake' })
  }
  mark('HANDSHAKE_CLEARED')
  return steps
}
