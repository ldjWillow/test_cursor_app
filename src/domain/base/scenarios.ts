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
 * 2 Source stations, 2 Sink stations, 1 Stacker, 6 Stations, AGV path network, 1000 tasks.
 */
export function standardWarehouseScenario(agvCount = 4, taskCount = 1000): ProjectDocument {
  const stations = [
    device('station-s1', DeviceType.Station, 'Source-Station-1', 80, 120),
    device('station-s2', DeviceType.Station, 'Source-Station-2', 80, 280),
    device('station-t1', DeviceType.Station, 'Sink-Station-1', 720, 120),
    device('station-t2', DeviceType.Station, 'Sink-Station-2', 720, 280),
    device('station-m1', DeviceType.Station, 'Station-M1', 280, 80),
    device('station-m2', DeviceType.Station, 'Station-M2', 520, 80),
  ]

  const pathNodes = [
    device('n-c', DeviceType.PathNode, 'Intersection-C', 400, 200, { label: 'C' }),
    device('n-a', DeviceType.PathNode, 'N-A', 200, 200, { label: 'A' }),
    device('n-b', DeviceType.PathNode, 'N-B', 600, 200, { label: 'B' }),
    device('n-d', DeviceType.PathNode, 'N-D', 400, 80, { label: 'D' }),
    device('n-e', DeviceType.PathNode, 'N-E', 400, 320, { label: 'E' }),
  ]

  const stacker = device('stacker-1', DeviceType.Stacker, 'Stacker-01', 400, 400)
  const rack = device('rack-1', DeviceType.Rack, 'Rack-01', 520, 400, {
    rows: 1,
    columns: 6,
    levels: 3,
  })

  const agvs = Array.from({ length: agvCount }, (_, index) =>
    device(`agv-${index + 1}`, DeviceType.Agv, `AGV-${String(index + 1).padStart(2, '0')}`, 120 + index * 28, 200, {
      speed: 1.5,
      loadTime: 3,
      unloadTime: 3,
    }),
  )

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
      createTime: Math.floor(index / 4) * 2,
      priority: index + 1,
      status: TaskStatus.Waiting,
    }
  })

  const nodes = [...stations, ...pathNodes, stacker, rack].map((item) => ({
    id: item.id,
    x: item.x,
    y: item.y,
    label: item.name,
  }))

  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: `Standard warehouse (${agvCount} AGVs)`, version: 2 },
    devices: [...stations, ...pathNodes, stacker, rack, ...agvs],
    nodes,
    edges: [
      ...bidirectional('s1-a', 'station-s1', 'n-a', 12),
      ...bidirectional('s2-a', 'station-s2', 'n-a', 12),
      ...bidirectional('a-c', 'n-a', 'n-c', 10),
      ...bidirectional('c-b', 'n-c', 'n-b', 10),
      ...bidirectional('b-t1', 'n-b', 'station-t1', 12),
      ...bidirectional('b-t2', 'n-b', 'station-t2', 12),
      ...bidirectional('c-d', 'n-c', 'n-d', 8),
      ...bidirectional('d-m1', 'n-d', 'station-m1', 8),
      ...bidirectional('d-m2', 'n-d', 'station-m2', 8),
      ...bidirectional('c-e', 'n-c', 'n-e', 8),
      ...bidirectional('e-stacker', 'n-e', 'stacker-1', 8),
      ...bidirectional('stacker-rack', 'stacker-1', 'rack-1', 6),
    ],
    tasks,
    simulationConfig: {
      seed: 1001,
      taskCount,
      taskSourceId: 'station-s1',
      taskTargetId: 'station-t1',
      taskInterval: 2,
      enableTraffic: true,
    },
  }
}
