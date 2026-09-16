import { describe, expect, it } from 'vitest'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { agvScenario } from '../domain/base/scenarios.ts'
import { buildDigitalTwinState } from '../twin/fromSnapshot.ts'
import { CoordinateTransformer } from '../coords/CoordinateTransformer.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { VirtualAgv, VirtualConveyor } from '../virtual/devices.ts'
import { faultManager } from '../virtual/FaultManager.ts'
import { signalMapper } from '../signal/SignalMapper.ts'
import { replayEngine } from '../replay/ReplayEngine.ts'
import { InMemoryProtocolAdapter } from '../gateway/ProtocolAdapter.ts'
import { migrateProject } from '../persistence/migrate.ts'
import { SCHEMA_VERSION } from '../types/index.ts'
import { SensorManager } from '../virtual/SensorManager.ts'

describe('DigitalTwinState', () => {
  it('maps simulation snapshot into twin devices without inventing AGV logic', () => {
    const project = agvScenario(3, 20)
    const engine = createEngine(project)
    engine.runUntilEmpty()
    const twin = buildDigitalTwinState({
      snapshot: engine.getState(),
      project,
      world: engine.world,
      operatingMode: 'simulation',
    })
    expect(twin.simulationTime).toBe(engine.getState().time)
    expect(Object.values(twin.devices).some((device) => device.type === 'agv')).toBe(true)
    expect(Object.keys(twin.tasks).length).toBe(20)
  })
})

describe('CoordinateTransformer', () => {
  it('round-trips canvas and world meters', () => {
    const coords = new CoordinateTransformer(20)
    const world = coords.canvasToWorld({ x: 200, y: 100 }, 0)
    expect(world.x).toBe(10)
    expect(world.y).toBe(5)
    const canvas = coords.worldToCanvas(world)
    expect(canvas.x).toBe(200)
    expect(canvas.y).toBe(100)
    const three = coords.worldToThree(world)
    expect(three).toEqual({ x: 10, y: 0, z: 5 })
  })
})

describe('VirtualDevice commands', () => {
  it('accepts and rejects AGV commands by state machine', async () => {
    const agv = new VirtualAgv('agv-1', 'AGV-01')
    const accepted = await agv.receiveCommand({
      commandId: 'c1',
      deviceId: 'agv-1',
      commandType: 'ASSIGN_TASK',
      timestamp: 1,
      parameters: { taskId: 't1' },
    })
    expect(accepted.status).toBe('accepted')
    const rejected = await agv.receiveCommand({
      commandId: 'c2',
      deviceId: 'agv-1',
      commandType: 'ASSIGN_TASK',
      timestamp: 2,
      parameters: { taskId: 't2' },
    })
    expect(rejected.status).toBe('rejected')
  })

  it('starts and stops conveyors', async () => {
    const conveyor = new VirtualConveyor('conveyor-1', 'Conveyor-01')
    await conveyor.receiveCommand({
      commandId: 'c1',
      deviceId: 'conveyor-1',
      commandType: 'START',
      timestamp: 1,
    })
    expect(conveyor.getStatus().state).toBe('RUNNING')
    await conveyor.receiveCommand({
      commandId: 'c2',
      deviceId: 'conveyor-1',
      commandType: 'STOP',
      timestamp: 2,
    })
    expect(conveyor.getStatus().state).toBe('STOPPED')
  })

  it('rejects commands while faulted until reset', async () => {
    const agv = new VirtualAgv('agv-1', 'AGV-01')
    agv.injectFault()
    const rejected = await agv.receiveCommand({
      commandId: 'c1',
      deviceId: 'agv-1',
      commandType: 'MOVE',
      timestamp: 1,
    })
    expect(rejected.status).toBe('rejected')
    await agv.receiveCommand({
      commandId: 'c2',
      deviceId: 'agv-1',
      commandType: 'RESET',
      timestamp: 2,
    })
    expect(agv.getStatus().state).toBe('IDLE')
  })
})

describe('FaultInjection', () => {
  it('triggers scheduled faults at simulation time', () => {
    faultManager.reset()
    faultManager.schedule('agv-3', 'FAULT', 10, 'AGV-03 FAULT')
    expect(faultManager.tick(5)).toHaveLength(0)
    const triggered = faultManager.tick(10)
    expect(triggered).toHaveLength(1)
    expect(faultManager.isFaulted('agv-3')).toBe(true)
  })
})

describe('SignalMapping', () => {
  it('maps device signals to external names', () => {
    signalMapper.reset()
    signalMapper.setMappings([{ id: 'm1', source: 'conveyor-1.running', target: 'Q_CONV01_RUNNING' }])
    signalMapper.updateFromDeviceSignals('conveyor-1', { running: true }, 1000)
    expect(signalMapper.get('Q_CONV01_RUNNING')?.value).toBe(true)
  })
})

describe('ReplayEngine', () => {
  it('plays back log entries by speed', () => {
    replayEngine.load([
      {
        id: '1',
        simulationTime: 0,
        entityId: 'a',
        entityType: 'task',
        eventType: 'TASK_CREATED',
        message: 'created',
      },
      {
        id: '2',
        simulationTime: 5,
        entityId: 'a',
        entityType: 'task',
        eventType: 'TASK_ASSIGNED',
        message: 'assigned',
      },
    ])
    replayEngine.play(5)
    const first = replayEngine.tick(0.5)
    expect(first).toHaveLength(1)
    const second = replayEngine.tick(1)
    expect(second.some((entry) => entry.eventType === 'TASK_ASSIGNED')).toBe(true)
  })
})

describe('ProtocolAdapter', () => {
  it('publishes in-memory messages to subscribers', async () => {
    const adapter = new InMemoryProtocolAdapter()
    await adapter.connect()
    const seen: unknown[] = []
    adapter.subscribe('device.status', (message) => seen.push(message.payload))
    await adapter.send('device.status', { online: true })
    expect(seen).toEqual([{ online: true }])
  })
})

describe('DeviceRegistry + project load', () => {
  it('loads virtual devices from project', async () => {
    const project = agvScenario(2, 5)
    deviceRegistry.loadFromProject(project)
    expect(deviceRegistry.list().filter((item) => item.type === 'agv')).toHaveLength(2)
    const response = await deviceRegistry.sendCommand({
      deviceId: 'agv-1',
      commandType: 'ASSIGN_TASK',
      parameters: { taskId: 't-1' },
    })
    expect(response.status).toBe('accepted')
  })
})

describe('SensorManager', () => {
  it('turns ON when material enters radius', () => {
    const sensors = new SensorManager()
    sensors.register({
      id: 'sensor-1',
      name: 'Sensor01',
      x: 10,
      y: 10,
      z: 0,
      triggerType: 'presence',
      active: false,
      radius: 1,
    })
    sensors.updateFromMaterials([{ id: 'mat-1', x: 10.2, y: 10.1 }])
    expect(sensors.list()[0]?.active).toBe(true)
    sensors.updateFromMaterials([{ id: 'mat-1', x: 20, y: 20 }])
    expect(sensors.list()[0]?.active).toBe(false)
  })
})

describe('Schema 0.3 migration', () => {
  it('upgrades legacy projects and adds assets', () => {
    const migrated = migrateProject({
      project: { name: 'old', version: 1 },
      devices: [],
      nodes: [],
      edges: [],
      tasks: [],
      simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0 },
    })
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.assets).toBeTruthy()
  })
})

describe('2D/3D consistency via twin mapping', () => {
  it('keeps device ids aligned between snapshot and twin', () => {
    const project = agvScenario(3, 10)
    const engine = createEngine(project)
    engine.step()
    const snapshot = engine.getState()
    const twin = buildDigitalTwinState({ snapshot, project, world: engine.world })
    for (const device of snapshot.devices) {
      expect(twin.devices[device.id]?.id).toBe(device.id)
    }
  })
})
