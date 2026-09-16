import { describe, expect, it } from 'vitest'
import { AgvStatus } from '../types/index.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { DeviceType, EdgeKind, SCHEMA_VERSION, TaskStatus } from '../types/index.ts'
import type { ProjectDocument } from '../types/index.ts'
import { defaultParams } from '../domain/base/defaults.ts'

function conflictProject(): ProjectDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: 'conflict', version: 2 },
    devices: [
      {
        id: 'A',
        type: DeviceType.Station,
        name: 'A',
        x: 0,
        y: 100,
        params: defaultParams(DeviceType.Station),
      },
      {
        id: 'B',
        type: DeviceType.Station,
        name: 'B',
        x: 0,
        y: 0,
        params: defaultParams(DeviceType.Station),
      },
      {
        id: 'C',
        type: DeviceType.PathNode,
        name: 'C',
        x: 100,
        y: 50,
        params: { label: 'C' },
      },
      {
        id: 'D',
        type: DeviceType.Station,
        name: 'D',
        x: 200,
        y: 100,
        params: defaultParams(DeviceType.Station),
      },
      {
        id: 'E',
        type: DeviceType.Station,
        name: 'E',
        x: 200,
        y: 0,
        params: defaultParams(DeviceType.Station),
      },
      {
        id: 'agv-1',
        type: DeviceType.Agv,
        name: 'AGV-01',
        x: 0,
        y: 100,
        params: { ...defaultParams(DeviceType.Agv), speed: 1, loadTime: 1, unloadTime: 1 },
      },
      {
        id: 'agv-2',
        type: DeviceType.Agv,
        name: 'AGV-02',
        x: 0,
        y: 0,
        params: { ...defaultParams(DeviceType.Agv), speed: 1, loadTime: 1, unloadTime: 1 },
      },
    ],
    nodes: [
      { id: 'A', x: 0, y: 100 },
      { id: 'B', x: 0, y: 0 },
      { id: 'C', x: 100, y: 50 },
      { id: 'D', x: 200, y: 100 },
      { id: 'E', x: 200, y: 0 },
    ],
    edges: [
      { id: 'a-c', from: 'A', to: 'C', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'c-a', from: 'C', to: 'A', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'b-c', from: 'B', to: 'C', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'c-b', from: 'C', to: 'B', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'c-d', from: 'C', to: 'D', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'd-c', from: 'D', to: 'C', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'c-e', from: 'C', to: 'E', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
      { id: 'e-c', from: 'E', to: 'C', kind: EdgeKind.Path, distance: 10, maxSpeed: 2, enabled: true, capacity: 1 },
    ],
    tasks: [
      {
        id: 'task-1',
        sourceId: 'A',
        targetId: 'D',
        createTime: 0,
        priority: 1,
        status: TaskStatus.Waiting,
      },
      {
        id: 'task-2',
        sourceId: 'B',
        targetId: 'E',
        createTime: 0,
        priority: 2,
        status: TaskStatus.Waiting,
      },
    ],
    simulationConfig: {
      seed: 7,
      taskCount: 2,
      taskSourceId: 'A',
      taskTargetId: 'D',
      taskInterval: 0,
      enableTraffic: true,
    },
  }
}

describe('AGV conflict and waiting state', () => {
  it('forces WAITING_FOR_ROUTE when intersection C is contended', () => {
    const engine = createEngine(conflictProject())
    let sawWaiting = false
    for (let i = 0; i < 5000; i += 1) {
      if (!engine.runNextEvent()) {
        break
      }
      for (const agv of engine.world.agvs.values()) {
        if (agv.status === AgvStatus.WaitingForRoute) {
          sawWaiting = true
        }
      }
    }
    expect(sawWaiting).toBe(true)
    expect(engine.getState().completedTasks).toBe(2)
    expect(engine.getState().statistics.waiting.routeWaitingTime).toBeGreaterThan(0)
  })
})
