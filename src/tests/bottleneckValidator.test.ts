import { describe, expect, it } from 'vitest'
import { BottleneckAnalyzer } from '../statistics/BottleneckAnalyzer.ts'
import { ReservationTrafficManager } from '../traffic/TrafficManager.ts'
import { SimulationWorld } from '../simulation/SimulationWorld.ts'
import { modelValidator } from '../validation/ModelValidator.ts'
import { agvScenario, emptyProject } from '../domain/base/scenarios.ts'
import { migrateProject } from '../persistence/migrate.ts'
import { SCHEMA_VERSION } from '../types/index.ts'

describe('BottleneckAnalyzer', () => {
  it('flags high utilization and route waiting', () => {
    const analyzer = new BottleneckAnalyzer()
    const traffic = new ReservationTrafficManager()
    traffic.setNodeCapacity('Intersection-N12', 1)
    traffic.reserveNode('agv-1', 'Intersection-N12', 0)
    traffic.enqueueWaiter({
      agvId: 'agv-2',
      resourceType: 'node',
      resourceId: 'Intersection-N12',
      since: 0,
    })
    // Force a sample after waiters exist so waitingIntegral accumulates.
    traffic.canEnterNode('agv-3', 'Intersection-N12', 0)
    traffic.releaseNode('agv-1', 'Intersection-N12', 200)
    expect(traffic.routeWaitingTime('Intersection-N12')).toBeGreaterThan(60)
    traffic.dequeueReady('node', 'Intersection-N12', 200)

    const bottlenecks = analyzer.analyze({
      world: new SimulationWorld(),
      traffic,
      now: 200,
      resources: [
        {
          id: 'stacker-1',
          name: 'Stacker-01',
          type: 'stacker',
          utilization: 0.96,
          averageQueueLength: 1,
        },
        {
          id: 'conveyor-3',
          name: 'Conveyor-03',
          type: 'conveyor',
          utilization: 0.5,
          averageQueueLength: 17.2,
        },
      ],
    })

    expect(bottlenecks.some((item) => item.id === 'stacker-1')).toBe(true)
    expect(bottlenecks.some((item) => item.id === 'conveyor-3')).toBe(true)
    expect(bottlenecks.some((item) => item.id === 'Intersection-N12')).toBe(true)
  })
})

describe('ModelValidator', () => {
  it('accepts the default AGV scenario', () => {
    expect(modelValidator.validate(agvScenario(3, 10))).toEqual([])
  })

  it('detects missing path and invalid speeds', () => {
    const project = emptyProject()
    project.devices.push({
      id: 'agv-1',
      type: 'agv',
      name: 'AGV',
      x: 0,
      y: 0,
      params: {
        speed: 0,
        capacity: 0,
        loadTime: 1,
        unloadTime: 1,
        batteryCapacity: 100,
        currentBattery: 100,
        chargeThreshold: 20,
      },
    })
    project.simulationConfig.taskCount = 10
    project.simulationConfig.taskSourceId = 'missing'
    project.simulationConfig.taskTargetId = 'also-missing'
    project.tasks = [
      {
        id: 't1',
        sourceId: 'missing',
        targetId: 'also-missing',
        createTime: 0,
        priority: 1,
        status: 'WAITING',
      },
    ]
    const issues = modelValidator.validate(project)
    const codes = issues.map((issue) => issue.code)
    expect(codes).toContain('INVALID_SPEED')
    expect(codes).toContain('INVALID_CAPACITY')
    expect(codes).toContain('TASK_SOURCE_MISSING')
    expect(codes).toContain('NO_PATH')
  })
})

describe('Schema migration', () => {
  it('upgrades legacy projects to schema 0.2', () => {
    const legacy = {
      project: { name: 'old', version: 1 },
      devices: [],
      nodes: [],
      edges: [{ id: 'e1', from: 'a', to: 'b', kind: 'path', distance: 1, maxSpeed: 1, enabled: true }],
      tasks: [],
      simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0 },
    }
    const migrated = migrateProject(legacy)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.edges[0]?.capacity).toBe(1)
    expect(migrated.simulationConfig.enableTraffic).toBe(true)
  })
})
