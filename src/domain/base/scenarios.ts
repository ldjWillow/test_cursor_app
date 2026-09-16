import { DeviceType, EdgeKind, SCHEMA_VERSION, TaskStatus } from '../../types/index.ts'
import type { PlacedDevice, ProjectDocument, ProjectEdge, TransportTask } from '../../types/index.ts'
import { defaultParams } from './defaults.ts'

export function emptyProject(name = 'Untitled warehouse'): ProjectDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name, version: 2 },
    devices: [],
    nodes: [],
    edges: [],
    tasks: [],
    simulationConfig: {
      seed: 1,
      taskCount: 0,
      taskInterval: 0,
      enableTraffic: true,
    },
  }
}

function device(
  id: string,
  type: PlacedDevice['type'],
  name: string,
  x: number,
  y: number,
  overrides: Record<string, unknown> = {},
): PlacedDevice {
  return {
    id,
    type,
    name,
    x,
    y,
    params: { ...defaultParams(type), ...overrides },
  }
}

function flow(id: string, from: string, to: string): ProjectEdge {
  return {
    id,
    from,
    to,
    kind: EdgeKind.Flow,
    distance: 0,
    maxSpeed: 1,
    enabled: true,
    capacity: 1,
  }
}

function pathEdge(id: string, from: string, to: string, distance: number, maxSpeed = 2): ProjectEdge {
  return {
    id,
    from,
    to,
    kind: EdgeKind.Path,
    distance,
    maxSpeed,
    enabled: true,
    capacity: 1,
  }
}

function bidirectional(id: string, from: string, to: string, distance: number): ProjectEdge[] {
  return [pathEdge(`${id}-fwd`, from, to, distance), pathEdge(`${id}-rev`, to, from, distance)]
}

export function conveyorScenario(): ProjectDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: 'Source-Conveyor-Sink', version: 2 },
    devices: [
      device('source-1', DeviceType.Source, 'Source-01', 80, 180, {
        generationInterval: 1,
        totalCount: 100,
      }),
      device('conveyor-1', DeviceType.Conveyor, 'Conveyor-01', 300, 180, {
        length: 10,
        speed: 1,
        capacity: 10,
      }),
      device('sink-1', DeviceType.Sink, 'Sink-01', 520, 180),
    ],
    nodes: [],
    edges: [flow('flow-1', 'source-1', 'conveyor-1'), flow('flow-2', 'conveyor-1', 'sink-1')],
    tasks: [],
    simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0, enableTraffic: true },
  }
}

export function agvScenario(agvCount = 3, taskCount = 100): ProjectDocument {
  const agvs = Array.from({ length: agvCount }, (_, index) =>
    device(`agv-${index + 1}`, DeviceType.Agv, `AGV-${String(index + 1).padStart(2, '0')}`, 80, 80 + index * 36, {
      speed: 1.5,
      loadTime: 4,
      unloadTime: 4,
    }),
  )

  const tasks: TransportTask[] = Array.from({ length: taskCount }, (_, index) => ({
    id: `task-${index + 1}`,
    sourceId: 'station-a',
    targetId: 'station-b',
    createTime: 0,
    priority: index + 1,
    status: TaskStatus.Waiting,
  }))

  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: `AGV transport (${agvCount} vehicles)`, version: 2 },
    devices: [
      device('station-a', DeviceType.Station, 'Station A', 80, 220),
      device('path-n1', DeviceType.PathNode, 'N1', 220, 220, { label: 'N1' }),
      device('path-n2', DeviceType.PathNode, 'N2', 360, 220, { label: 'N2' }),
      device('station-b', DeviceType.Station, 'Station B', 500, 220),
      ...agvs,
    ],
    nodes: [
      { id: 'station-a', x: 80, y: 220, label: 'A' },
      { id: 'path-n1', x: 220, y: 220, label: 'N1' },
      { id: 'path-n2', x: 360, y: 220, label: 'N2' },
      { id: 'station-b', x: 500, y: 220, label: 'B' },
    ],
    edges: [
      ...bidirectional('a-n1', 'station-a', 'path-n1', 10),
      ...bidirectional('n1-n2', 'path-n1', 'path-n2', 10),
      ...bidirectional('n2-b', 'path-n2', 'station-b', 10),
    ],
    tasks,
    simulationConfig: {
      seed: 1,
      taskCount,
      taskSourceId: 'station-a',
      taskTargetId: 'station-b',
      taskInterval: 0,
      enableTraffic: true,
    },
  }
}

export function asrsScenario(): ProjectDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: 'Rack + Stacker inbound', version: 2 },
    devices: [
      device('source-1', DeviceType.Source, 'Inbound-Source', 80, 180, {
        generationInterval: 8,
        totalCount: 20,
      }),
      device('stacker-1', DeviceType.Stacker, 'Stacker-01', 280, 180),
      device('rack-1', DeviceType.Rack, 'Rack-01', 480, 140, {
        rows: 1,
        columns: 8,
        levels: 4,
      }),
    ],
    nodes: [],
    edges: [flow('flow-1', 'source-1', 'stacker-1'), flow('flow-2', 'stacker-1', 'rack-1')],
    tasks: [],
    simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0, enableTraffic: true },
  }
}

/**
 * Standard validation warehouse for V0.2 experiments:
 * 2 pickup stations, 2 dropoff stations, mid stations, stacker/rack spur,
 * AGV path network, and N staggered transport tasks.
 */
export function standardWarehouseScenario(agvCount = 4, taskCount = 1000): ProjectDocument {
  const devices = [
    device('station-s1', DeviceType.Station, 'Source-Station-1', 60, 160),
    device('station-s2', DeviceType.Station, 'Source-Station-2', 60, 260),
    device('n1', DeviceType.PathNode, 'N1', 180, 210, { label: 'N1' }),
    device('n2', DeviceType.PathNode, 'Intersection-N2', 320, 210, { label: 'N2' }),
    device('n3', DeviceType.PathNode, 'N3', 460, 210, { label: 'N3' }),
    device('station-t1', DeviceType.Station, 'Sink-Station-1', 600, 160),
    device('station-t2', DeviceType.Station, 'Sink-Station-2', 600, 260),
    device('station-m1', DeviceType.Station, 'Station-M1', 320, 80),
    device('station-m2', DeviceType.Station, 'Station-M2', 320, 340),
    device('stacker-1', DeviceType.Stacker, 'Stacker-01', 460, 340),
    device('rack-1', DeviceType.Rack, 'Rack-01', 580, 340, { rows: 1, columns: 6, levels: 3 }),
    ...Array.from({ length: agvCount }, (_, index) =>
      device(
        `agv-${index + 1}`,
        DeviceType.Agv,
        `AGV-${String(index + 1).padStart(2, '0')}`,
        80,
        60 + index * 32,
        { speed: 1.5, loadTime: 3, unloadTime: 3 },
      ),
    ),
  ]

  const pairs: Array<[string, string]> = [
    ['station-s1', 'station-t1'],
    ['station-s2', 'station-t2'],
    ['station-s1', 'station-t2'],
    ['station-s2', 'station-t1'],
  ]

  const tasks: TransportTask[] = Array.from({ length: taskCount }, (_, index) => {
    const pair = pairs[index % pairs.length]!
    return {
      id: `task-${index + 1}`,
      sourceId: pair[0],
      targetId: pair[1],
      createTime: index * 3,
      priority: index + 1,
      status: TaskStatus.Waiting,
    }
  })

  const pathIds = [
    'station-s1',
    'station-s2',
    'n1',
    'n2',
    'n3',
    'station-t1',
    'station-t2',
    'station-m1',
    'station-m2',
    'stacker-1',
    'rack-1',
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: `Standard warehouse (${agvCount} AGVs)`, version: 2 },
    devices,
    nodes: devices
      .filter((item) => pathIds.includes(item.id))
      .map((item) => ({ id: item.id, x: item.x, y: item.y, label: item.name })),
    edges: [
      ...bidirectional('s1-n1', 'station-s1', 'n1', 10),
      ...bidirectional('s2-n1', 'station-s2', 'n1', 10),
      ...bidirectional('n1-n2', 'n1', 'n2', 10),
      ...bidirectional('n2-n3', 'n2', 'n3', 10),
      ...bidirectional('n3-t1', 'n3', 'station-t1', 10),
      ...bidirectional('n3-t2', 'n3', 'station-t2', 10),
      ...bidirectional('n2-m1', 'n2', 'station-m1', 8),
      ...bidirectional('n2-m2', 'n2', 'station-m2', 8),
      ...bidirectional('m2-stacker', 'station-m2', 'stacker-1', 8),
      ...bidirectional('stacker-rack', 'stacker-1', 'rack-1', 6),
    ].map((edge) => ({
      ...edge,
      // Main spine keeps capacity 1 to exercise TrafficManager; station spurs are wider.
      capacity: edge.id.includes('n1-n2') || edge.id.includes('n2-n3') ? 1 : 2,
    })),
    tasks,
    simulationConfig: {
      seed: 1001,
      taskCount,
      taskSourceId: 'station-s1',
      taskTargetId: 'station-t1',
      taskInterval: 3,
      enableTraffic: true,
    },
  }
}
