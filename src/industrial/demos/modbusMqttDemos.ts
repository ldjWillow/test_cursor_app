import { connectionManager } from '../ConnectionManager.ts'
import { signalRegistry } from '../SignalRegistry.ts'
import { signalMappingEngine } from '../SignalMappingEngine.ts'
import { commandBus, feedbackBus } from '../CommandBus.ts'
import { controlAuthority } from '../ControlAuthority.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { VirtualConveyor, VirtualAgv } from '../../virtual/devices.ts'
import { ProtocolType } from '../types.ts'
import type { DemoStep } from './plcDemos.ts'

/**
 * Modbus Conveyor Demo:
 * Coil1 Start, Coil2 Stop, DI100 Running, DI101 Sensor, HR40001 Speed
 */
export async function runModbusConveyorDemo(conveyorId = 'conveyor-1'): Promise<DemoStep[]> {
  const steps: DemoStep[] = []
  const t0 = Date.now()
  const mark = (event: string, detail?: string) => steps.push({ time: Date.now() - t0, event, detail })

  if (!deviceRegistry.get(conveyorId)) {
    deviceRegistry.register(new VirtualConveyor(conveyorId, 'Conveyor01'))
  }
  controlAuthority.set(conveyorId, 'EXTERNAL', 'SAFE_STOP')
  signalRegistry.ensure(conveyorId, 'Start', { direction: 'INPUT', writable: true, type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'Stop', { direction: 'INPUT', writable: true, type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'Running', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'SensorOut', { direction: 'OUTPUT', type: 'BOOLEAN' })
  signalRegistry.ensure(conveyorId, 'Speed', {
    direction: 'OUTPUT',
    type: 'FLOAT',
    value: 0,
  })

  const conn =
    connectionManager.get('demo-modbus') ??
    connectionManager.create({
      id: 'demo-modbus',
      name: 'Modbus PLC',
      type: ProtocolType.MODBUS_TCP,
      settings: { host: '127.0.0.1', port: 502, simulated: true },
    })
  if (!conn.adapter.isConnected()) {
    await connectionManager.start(conn.config.id)
  }

  signalMappingEngine.setMappings([
    {
      id: 'mb-start',
      signalId: `${conveyorId}.Start`,
      connectionId: conn.config.id,
      address: 'coil:1',
      direction: 'INPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
    {
      id: 'mb-stop',
      signalId: `${conveyorId}.Stop`,
      connectionId: conn.config.id,
      address: 'coil:2',
      direction: 'INPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
    {
      id: 'mb-running',
      signalId: `${conveyorId}.Running`,
      connectionId: conn.config.id,
      address: 'discrete:10001',
      direction: 'OUTPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
    {
      id: 'mb-sensor',
      signalId: `${conveyorId}.SensorOut`,
      connectionId: conn.config.id,
      address: 'discrete:10002',
      direction: 'OUTPUT',
      dataType: 'BOOLEAN',
      enabled: true,
    },
    {
      id: 'mb-speed',
      signalId: `${conveyorId}.Speed`,
      connectionId: conn.config.id,
      address: 'holding:40001',
      direction: 'OUTPUT',
      dataType: 'FLOAT',
      scale: 0.1,
      offset: 0,
      enabled: true,
    },
  ])

  mark('MODBUS_WRITE', 'Coil1 Start=true')
  await connectionManager.write(conn.config.id, 'coil:1', true)
  await commandBus.handleInputSignal(`${conveyorId}.Start`, true, 'Modbus')
  feedbackBus.publishDevice(conveyorId, { Running: true, Speed: 12.3 }, 'Simulation')
  signalRegistry.setValue(`${conveyorId}.Speed`, 12.3, { source: 'Simulation' })
  await feedbackBus.flushOutputs()

  const speedRaw = await connectionManager.read(conn.config.id, 'holding:40001')
  mark('SPEED_REGISTER', `PLC sees ${speedRaw} (=12.3 m/s with scale 0.1)`)
  mark('RUNNING', String(await connectionManager.read(conn.config.id, 'discrete:10001')))

  await connectionManager.write(conn.config.id, 'coil:2', true)
  await commandBus.handleInputSignal(`${conveyorId}.Stop`, true, 'Modbus')
  await commandBus.dispatch({ deviceId: conveyorId, commandType: 'STOP', source: 'EXTERNAL' })
  feedbackBus.publishDevice(conveyorId, { Running: false }, 'Simulation')
  await feedbackBus.flushOutputs()
  mark('STOPPED', deviceRegistry.get(conveyorId)!.getStatus().state)
  return steps
}

/**
 * MQTT AGV Demo — ACS publishes command, WarehouseSim publishes status.
 */
export async function runMqttAgvDemo(agvId = 'agv-1'): Promise<DemoStep[]> {
  const steps: DemoStep[] = []
  const t0 = Date.now()
  const mark = (event: string, detail?: string) => steps.push({ time: Date.now() - t0, event, detail })

  if (!deviceRegistry.get(agvId)) {
    deviceRegistry.register(new VirtualAgv(agvId, 'AGV01'))
  }
  controlAuthority.set(agvId, 'EXTERNAL', 'SAFE_STOP')

  const conn =
    connectionManager.get('demo-mqtt') ??
    connectionManager.create({
      id: 'demo-mqtt',
      name: 'ACS MQTT',
      type: ProtocolType.MQTT,
      settings: { brokerUrl: 'mqtt://127.0.0.1:1883', simulated: true },
    })
  if (!conn.adapter.isConnected()) {
    await connectionManager.start(conn.config.id)
  }

  const mqtt = conn.adapter as unknown as {
    publishTemplate: (t: string, v: Record<string, string>, p: unknown) => Promise<string>
    subscribe: (t: string, cb: (v: unknown) => void) => Promise<() => void>
    read: (t: string) => Promise<unknown>
  }

  const statuses: unknown[] = []
  await mqtt.subscribe('warehouse/agv/+/status', (value) => {
    statuses.push(value)
  })

  mark('ACS_COMMAND', 'MOVE Station03')
  const cmdTopic = await mqtt.publishTemplate(
    'warehouse/{deviceType}/{deviceId}/command',
    { deviceType: 'agv', deviceId: 'AGV01' },
    { command: 'MOVE', target: 'Station03' },
  )
  mark('CMD_TOPIC', cmdTopic)

  await commandBus.dispatch({
    deviceId: agvId,
    commandType: 'ASSIGN_TASK',
    source: 'EXTERNAL',
    parameters: { taskId: 'mqtt-1', sourceId: 'Station01', targetId: 'Station03' },
  })
  await commandBus.dispatch({
    deviceId: agvId,
    commandType: 'MOVE',
    source: 'EXTERNAL',
    parameters: { target: 'Station03' },
  })

  await mqtt.publishTemplate(
    'warehouse/{deviceType}/{deviceId}/status',
    { deviceType: 'agv', deviceId: 'AGV01' },
    { status: 'MOVING', position: { x: 1, y: 0 } },
  )
  mark('STATUS_MOVING')

  const agv = deviceRegistry.get(agvId) as VirtualAgv
  agv.markArrivedDropoff()
  agv.markTaskComplete()
  await mqtt.publishTemplate(
    'warehouse/{deviceType}/{deviceId}/status',
    { deviceType: 'agv', deviceId: 'AGV01' },
    { status: 'TASK_COMPLETE', position: { x: 10, y: 0 } },
  )
  mark('TASK_COMPLETE', String(statuses.length))
  return steps
}
