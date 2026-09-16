import { DeviceType, EdgeKind, TaskStatus } from '../../types/index.ts'
import type { PlacedDevice, ProjectDocument, ProjectEdge, TransportTask } from '../../types/index.ts'
import { defaultParams } from './defaults.ts'

export function emptyProject(name = 'Untitled warehouse'): ProjectDocument {
  return {
    project: { name, version: 1 },
    devices: [],
    nodes: [],
    edges: [],
    tasks: [],
    simulationConfig: {
      seed: 1,
      taskCount: 0,
      taskInterval: 0,
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
  }
}

function bidirectional(id: string, from: string, to: string, distance: number): ProjectEdge[] {
  return [pathEdge(`${id}-fwd`, from, to, distance), pathEdge(`${id}-rev`, to, from, distance)]
}

export function conveyorScenario(): ProjectDocument {
  return {
    project: { name: 'Source-Conveyor-Sink', version: 1 },
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
    simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0 },
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
    project: { name: `AGV transport (${agvCount} vehicles)`, version: 1 },
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
    },
  }
}

export function asrsScenario(): ProjectDocument {
  return {
    project: { name: 'Rack + Stacker inbound', version: 1 },
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
    simulationConfig: { seed: 1, taskCount: 0, taskInterval: 0 },
  }
}
