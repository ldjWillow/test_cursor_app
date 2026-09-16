import { runPlcConveyorDemo, runStackerPlcDemo } from './plcDemos.ts'
import { runModbusConveyorDemo, runMqttAgvDemo } from './modbusMqttDemos.ts'
import { connectionManager } from '../ConnectionManager.ts'
import { commandBus } from '../CommandBus.ts'
import { controlAuthority } from '../ControlAuthority.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { VirtualAgv, VirtualConveyor, VirtualStacker } from '../../virtual/devices.ts'
import { ProtocolType } from '../types.ts'
import { TcpSocketAdapter } from '../adapters/TcpSocketAdapter.ts'
import type { DemoStep } from './plcDemos.ts'

/**
 * Full V0.4 acceptance demo:
 * WCS (HTTP/TCP) + PLC (OPC UA / Modbus) + ACS (MQTT)
 * Source → Conveyor → AGV → Stacker → Rack
 */
export async function runFullIntegrationDemo(): Promise<{
  steps: DemoStep[]
  ok: boolean
}> {
  const steps: DemoStep[] = []
  const t0 = Date.now()
  const mark = (event: string, detail?: string) => steps.push({ time: Date.now() - t0, event, detail })

  // Ensure devices
  if (!deviceRegistry.get('conveyor-1')) {
    deviceRegistry.register(new VirtualConveyor('conveyor-1', 'Conveyor01'))
  }
  if (!deviceRegistry.get('agv-1')) {
    deviceRegistry.register(new VirtualAgv('agv-1', 'AGV01'))
  }
  if (!deviceRegistry.get('stacker-1')) {
    deviceRegistry.register(new VirtualStacker('stacker-1', 'Stacker01'))
  }

  controlAuthority.set('conveyor-1', 'EXTERNAL', 'SAFE_STOP')
  controlAuthority.set('stacker-1', 'EXTERNAL', 'SAFE_STOP')
  controlAuthority.set('agv-1', 'EXTERNAL', 'SAFE_STOP')

  // WCS TCP connection
  const wcs =
    connectionManager.get('demo-wcs-tcp') ??
    connectionManager.create({
      id: 'demo-wcs-tcp',
      name: 'WCS TCP',
      type: ProtocolType.TCP_SOCKET,
      settings: { host: '127.0.0.1', port: 9000, simulated: true },
    })
  if (!wcs.adapter.isConnected()) {
    await connectionManager.start(wcs.config.id)
  }

  mark('WCS_CREATE_TASK', 'inbound putaway')
  const tcp = wcs.adapter as unknown as TcpSocketAdapter
  await tcp.send({
    type: 'command',
    deviceId: 'agv-1',
    command: 'CREATE_TASK',
    payload: { sourceId: 'in-1', targetId: 'rack-1' },
  })

  const plcSteps = await runPlcConveyorDemo('conveyor-1')
  steps.push(...plcSteps.map((s) => ({ ...s, event: `PLC:${s.event}` })))
  mark('SENSOR_TRIGGER', 'handoff to AGV')

  const mqttSteps = await runMqttAgvDemo('agv-1')
  steps.push(...mqttSteps.map((s) => ({ ...s, event: `ACS:${s.event}` })))
  mark('AGV_ARRIVED')

  const stackerSteps = await runStackerPlcDemo('stacker-1')
  steps.push(...stackerSteps.map((s) => ({ ...s, event: `STACKER:${s.event}` })))

  const modbusSteps = await runModbusConveyorDemo('conveyor-1')
  steps.push(...modbusSteps.map((s) => ({ ...s, event: `MODBUS:${s.event}` })))

  // Authority conflict check
  controlAuthority.set('agv-1', 'EXTERNAL', 'SAFE_STOP')
  const rejected = await commandBus.dispatch({
    deviceId: 'agv-1',
    commandType: 'MOVE',
    source: 'INTERNAL',
  })
  mark('AUTHORITY_CONFLICT', rejected.message)
  const ok = rejected.status === 'rejected' && steps.some((s) => s.event.includes('TASK_COMPLETE') || s.event.includes('DEMO_COMPLETE') || s.event.includes('COMPLETE'))

  mark('FULL_DEMO_DONE', ok ? 'OK' : 'PARTIAL')
  return { steps, ok }
}
