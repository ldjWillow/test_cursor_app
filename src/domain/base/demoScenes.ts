import type {
  PlacedDevice,
  ProjectDocument,
  ProjectEdge,
  TransportTask,
} from '../../types/index.ts'
import { DeviceType, EdgeKind, TaskStatus } from '../../types/index.ts'
import { defaultParams } from './defaults.ts'

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

function pathEdge(id: string, from: string, to: string, distance: number): ProjectEdge {
  return {
    id,
    from,
    to,
    kind: EdgeKind.Path,
    distance,
    maxSpeed: 2,
    enabled: true,
    capacity: 1,
  }
}

function bidirectional(id: string, from: string, to: string, distance: number): ProjectEdge[] {
  return [pathEdge(`${id}-fwd`, from, to, distance), pathEdge(`${id}-rev`, to, from, distance)]
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

/** Automated Warehouse Demo for V0.3 digital twin + WCS emulation. */
export function automatedWarehouseDemo(taskCount = 200): ProjectDocument {
  const stations = [
    device('in-1', DeviceType.Station, 'Inbound-01', 60, 120),
    device('in-2', DeviceType.Station, 'Inbound-02', 60, 260),
    device('out-1', DeviceType.Station, 'Outbound-01', 720, 120),
    device('out-2', DeviceType.Station, 'Outbound-02', 720, 260),
    device('n1', DeviceType.PathNode, 'N1', 200, 190, { label: 'N1' }),
    device('n2', DeviceType.PathNode, 'N2', 360, 190, { label: 'N2' }),
    device('n3', DeviceType.PathNode, 'N3', 520, 190, { label: 'N3' }),
    device('charger-1', DeviceType.Charger, 'Charger-01', 200, 60),
  ]

  const conveyors = [
    device('source-1', DeviceType.Source, 'Source-01', 60, 400, {
      generationInterval: 4,
      totalCount: 40,
    }),
    device('conveyor-1', DeviceType.Conveyor, 'Conveyor-01', 240, 400, {
      length: 12,
      speed: 0.8,
      capacity: 8,
    }),
    device('sink-1', DeviceType.Sink, 'Sink-01', 420, 400),
  ]

  const asrs = [
    device('stacker-1', DeviceType.Stacker, 'Stacker-01', 520, 360),
    device('rack-1', DeviceType.Rack, 'Rack-01', 640, 340, {
      rows: 1,
      columns: 10,
      levels: 5,
    }),
  ]

  const agvs = Array.from({ length: 8 }, (_, index) =>
    device(`agv-${index + 1}`, DeviceType.Agv, `AGV-${String(index + 1).padStart(2, '0')}`, 100, 40 + index * 28, {
      speed: 1.5,
      loadTime: 3,
      unloadTime: 3,
    }),
  )

  const pairs: Array<[string, string]> = [
    ['in-1', 'out-1'],
    ['in-2', 'out-2'],
    ['in-1', 'out-2'],
    ['in-2', 'out-1'],
  ]
  const tasks: TransportTask[] = Array.from({ length: taskCount }, (_, index) => {
    const pair = pairs[index % pairs.length]!
    return {
      id: `task-${index + 1}`,
      sourceId: pair[0],
      targetId: pair[1],
      createTime: index * 4,
      priority: index + 1,
      status: TaskStatus.Waiting,
    }
  })

  const layoutDevices = [...stations, ...conveyors, ...asrs, ...agvs]

  return {
    schemaVersion: '0.3',
    project: { name: 'Automated Warehouse Demo', version: 3 },
    devices: layoutDevices,
    nodes: layoutDevices
      .filter((item) =>
        item.type === DeviceType.Station ||
        item.type === DeviceType.PathNode ||
        item.type === DeviceType.Charger ||
        item.type === DeviceType.Stacker ||
        item.type === DeviceType.Rack,
      )
      .map((item) => ({ id: item.id, x: item.x, y: item.y, label: item.name })),
    edges: [
      ...bidirectional('in1-n1', 'in-1', 'n1', 10),
      ...bidirectional('in2-n1', 'in-2', 'n1', 10),
      ...bidirectional('n1-n2', 'n1', 'n2', 10),
      ...bidirectional('n2-n3', 'n2', 'n3', 10),
      ...bidirectional('n3-out1', 'n3', 'out-1', 10),
      ...bidirectional('n3-out2', 'n3', 'out-2', 10),
      ...bidirectional('n1-charger', 'n1', 'charger-1', 8),
      ...bidirectional('n3-stacker', 'n3', 'stacker-1', 8),
      ...bidirectional('stacker-rack', 'stacker-1', 'rack-1', 6),
      flow('flow-1', 'source-1', 'conveyor-1'),
      flow('flow-2', 'conveyor-1', 'sink-1'),
    ].map((edge) => ({
      ...edge,
      capacity: edge.id.includes('n1-n2') || edge.id.includes('n2-n3') ? 1 : 2,
    })),
    tasks,
    simulationConfig: {
      seed: 2026,
      taskCount,
      taskSourceId: 'in-1',
      taskTargetId: 'out-1',
      taskInterval: 4,
      enableTraffic: true,
    },
    assets: {
      agvModel: '',
      rackModel: '',
      stackerModel: '',
    },
  }
}

export const PROJECT_TEMPLATES = [
  { id: 'agv', name: 'AGV Warehouse', description: 'Station-to-station AGV transport' },
  { id: 'asrs', name: 'ASRS Warehouse', description: 'Source → Stacker → Rack' },
  { id: 'conveyor', name: 'Conveyor Warehouse', description: 'Source → Conveyor → Sink' },
  { id: 'agv-asrs', name: 'AGV + ASRS', description: 'Automated warehouse demo' },
] as const
