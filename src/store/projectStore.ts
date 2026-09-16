import { create } from 'zustand'
import type { Connection, Edge, Node } from 'reactflow'
import {
  DeviceType,
  EdgeKind,
} from '../types/index.ts'
import type {
  DeviceParams,
  DeviceType as DeviceTypeName,
  PlacedDevice,
  ProjectDocument,
  ProjectEdge,
} from '../types/index.ts'
import { defaultParams, MATERIAL_FLOW_TYPES, PATH_TYPES } from '../domain/base/defaults.ts'
import { agvScenario, emptyProject } from '../domain/base/scenarios.ts'
import { createUuid } from '../utils/id.ts'
import { distance } from '../utils/math.ts'

export interface ProjectStore {
  document: ProjectDocument
  selectedId: string | null
  selectedKind: 'device' | 'edge' | null
  nodes: Node[]
  edges: Edge[]
  revision: number
  setDocument: (document: ProjectDocument) => void
  newProject: () => void
  addDevice: (type: DeviceTypeName, position: { x: number; y: number }) => void
  updateDeviceParams: (id: string, params: DeviceParams) => void
  updateDeviceName: (id: string, name: string) => void
  setSelection: (id: string | null, kind?: 'device' | 'edge' | null) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  connect: (connection: Connection) => void
  removeSelected: () => void
  replaceTasks: (sourceId: string, targetId: string, count: number) => void
  setProjectName: (name: string) => void
  updateEdge: (id: string, patch: Partial<ProjectEdge>) => void
}

function toRfNode(device: PlacedDevice): Node {
  return {
    id: device.id,
    type: device.type === DeviceType.PathNode ? 'waypoint' : 'device',
    position: { x: device.x, y: device.y },
    data: {
      deviceType: device.type,
      name: device.name,
    },
  }
}

function toRfEdge(edge: ProjectEdge): Edge {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    animated: edge.kind === EdgeKind.Flow,
    style: {
      stroke: edge.kind === EdgeKind.Flow ? '#3ecf8e' : '#6ea8fe',
      strokeWidth: 2,
    },
    data: { kind: edge.kind },
  }
}

function syncFromDocument(document: ProjectDocument): Pick<ProjectStore, 'document' | 'nodes' | 'edges'> {
  return {
    document,
    nodes: document.devices.map(toRfNode),
    edges: document.edges.map(toRfEdge),
  }
}

function persistPositions(document: ProjectDocument, nodes: Node[]): ProjectDocument {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return {
    ...document,
    devices: document.devices.map((device) => {
      const node = byId.get(device.id)
      if (!node) {
        return device
      }
      return { ...device, x: node.position.x, y: node.position.y }
    }),
    nodes: document.nodes.map((pathNode) => {
      const node = byId.get(pathNode.id)
      if (!node) {
        return pathNode
      }
      return { ...pathNode, x: node.position.x, y: node.position.y }
    }),
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...syncFromDocument(agvScenario(3, 100)),
  selectedId: null,
  selectedKind: null,
  revision: 1,

  setDocument: (document) => {
    set({
      ...syncFromDocument(document),
      selectedId: null,
      selectedKind: null,
      revision: get().revision + 1,
    })
  },

  newProject: () => {
    get().setDocument(emptyProject('WarehouseSim'))
  },

  addDevice: (type, position) => {
    const count = get().document.devices.filter((device) => device.type === type).length + 1
    const device: PlacedDevice = {
      id: createUuid(type),
      type,
      name: `${type}-${String(count).padStart(2, '0')}`,
      x: position.x,
      y: position.y,
      params: defaultParams(type),
    }
    const document = {
      ...get().document,
      devices: [...get().document.devices, device],
      nodes:
        PATH_TYPES.includes(type)
          ? [...get().document.nodes, { id: device.id, x: device.x, y: device.y, label: device.name }]
          : get().document.nodes,
    }
    set({
      document,
      nodes: [...get().nodes, toRfNode(device)],
      revision: get().revision + 1,
    })
  },

  updateDeviceParams: (id, params) => {
    const document = {
      ...get().document,
      devices: get().document.devices.map((device) =>
        device.id === id ? { ...device, params } : device,
      ),
    }
    set({ document, revision: get().revision + 1 })
  },

  updateDeviceName: (id, name) => {
    const document = {
      ...get().document,
      devices: get().document.devices.map((device) =>
        device.id === id ? { ...device, name } : device,
      ),
    }
    set({
      document,
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, name } } : node,
      ),
      revision: get().revision + 1,
    })
  },

  setSelection: (id, kind = id ? 'device' : null) => {
    set({ selectedId: id, selectedKind: kind })
  },

  setNodes: (nodes) => {
    const ids = new Set(nodes.map((node) => node.id))
    const positioned = persistPositions(get().document, nodes)
    set({
      nodes,
      document: {
        ...positioned,
        devices: positioned.devices.filter((device) => ids.has(device.id)),
        nodes: positioned.nodes.filter((node) => ids.has(node.id)),
        edges: positioned.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
      },
    })
  },

  setEdges: (edges) => {
    const remaining = new Set(edges.map((edge) => edge.id))
    set({
      edges,
      document: {
        ...get().document,
        edges: get().document.edges.filter((edge) => remaining.has(edge.id)),
      },
      revision: get().revision + 1,
    })
  },

  connect: (connection) => {
    if (!connection.source || !connection.target) {
      return
    }
    const sourceDevice = get().document.devices.find((device) => device.id === connection.source)
    const targetDevice = get().document.devices.find((device) => device.id === connection.target)
    if (!sourceDevice || !targetDevice) {
      return
    }
    const pathLink =
      PATH_TYPES.includes(sourceDevice.type) && PATH_TYPES.includes(targetDevice.type)
    const flowLink =
      MATERIAL_FLOW_TYPES.includes(sourceDevice.type) &&
      MATERIAL_FLOW_TYPES.includes(targetDevice.type)
    const kind = pathLink ? EdgeKind.Path : flowLink ? EdgeKind.Flow : EdgeKind.Flow
    const dist = distance(sourceDevice.x, sourceDevice.y, targetDevice.x, targetDevice.y)
    const makeEdge = (from: string, to: string, suffix: string): ProjectEdge => ({
      id: createUuid(`edge${suffix}`),
      from,
      to,
      kind,
      distance: kind === EdgeKind.Path ? Math.max(0.1, dist / 20) : 0,
      maxSpeed: 2,
      enabled: true,
    })
    const created = [makeEdge(connection.source, connection.target, '')]
    if (kind === EdgeKind.Path) {
      created.push(makeEdge(connection.target, connection.source, '-rev'))
    }
    const document = {
      ...get().document,
      edges: [...get().document.edges, ...created],
    }
    set({
      document,
      edges: document.edges.map(toRfEdge),
      revision: get().revision + 1,
    })
  },

  removeSelected: () => {
    const { selectedId, selectedKind, document } = get()
    if (!selectedId) {
      return
    }
    if (selectedKind === 'edge') {
      const nextEdges = document.edges.filter((edge) => edge.id !== selectedId)
      set({
        document: { ...document, edges: nextEdges },
        edges: nextEdges.map(toRfEdge),
        selectedId: null,
        selectedKind: null,
        revision: get().revision + 1,
      })
      return
    }
    const nextDevices = document.devices.filter((device) => device.id !== selectedId)
    const nextNodes = document.nodes.filter((node) => node.id !== selectedId)
    const nextEdges = document.edges.filter(
      (edge) => edge.from !== selectedId && edge.to !== selectedId,
    )
    const nextTasks = document.tasks.filter(
      (task) => task.sourceId !== selectedId && task.targetId !== selectedId,
    )
    const nextDocument = {
      ...document,
      devices: nextDevices,
      nodes: nextNodes,
      edges: nextEdges,
      tasks: nextTasks,
    }
    set({
      ...syncFromDocument(nextDocument),
      selectedId: null,
      selectedKind: null,
      revision: get().revision + 1,
    })
  },

  replaceTasks: (sourceId, targetId, count) => {
    const tasks = Array.from({ length: count }, (_, index) => ({
      id: `task-${index + 1}`,
      sourceId,
      targetId,
      createTime: 0,
      priority: index + 1,
      status: 'WAITING' as const,
    }))
    const document = {
      ...get().document,
      tasks,
      simulationConfig: {
        ...get().document.simulationConfig,
        taskCount: count,
        taskSourceId: sourceId,
        taskTargetId: targetId,
      },
    }
    set({ document, revision: get().revision + 1 })
  },

  setProjectName: (name) => {
    set({
      document: { ...get().document, project: { ...get().document.project, name } },
    })
  },

  updateEdge: (id, patch) => {
    const document = {
      ...get().document,
      edges: get().document.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
    }
    set({
      document,
      edges: document.edges.map(toRfEdge),
      revision: get().revision + 1,
    })
  },
}))

export function selectedDevice(): PlacedDevice | undefined {
  const state = useProjectStore.getState()
  if (!state.selectedId || state.selectedKind === 'edge') {
    return undefined
  }
  return state.document.devices.find((device) => device.id === state.selectedId)
}
