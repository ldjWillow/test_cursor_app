import { create } from 'zustand'
import type { Connection, Edge, Node } from 'reactflow'
import {
  DeviceType,
  EdgeKind,
  SCHEMA_VERSION,
} from '../types/index.ts'
import type {
  DeviceParams,
  DeviceType as DeviceTypeName,
  PlacedDevice,
  ProjectDocument,
  ProjectEdge,
} from '../types/index.ts'
import { defaultParams, MATERIAL_FLOW_TYPES, PATH_TYPES } from '../domain/base/defaults.ts'
import { templateById } from '../domain/base/templates.ts'
import { agvScenario, emptyProject } from '../domain/base/scenarios.ts'
import { ensureSchemaVersion } from '../persistence/migrate.ts'
import { createUuid } from '../utils/id.ts'
import { distance } from '../utils/math.ts'

const HISTORY_LIMIT = 50

export interface ProjectStore {
  document: ProjectDocument
  selectedId: string | null
  selectedKind: 'device' | 'edge' | null
  clipboard: PlacedDevice | null
  nodes: Node[]
  edges: Edge[]
  revision: number
  past: ProjectDocument[]
  future: ProjectDocument[]
  setDocument: (document: ProjectDocument) => void
  newProject: () => void
  addDevice: (type: DeviceTypeName, position: { x: number; y: number }, templateId?: string) => void
  updateDeviceParams: (id: string, params: DeviceParams) => void
  updateDeviceName: (id: string, name: string) => void
  setSelection: (id: string | null, kind?: 'device' | 'edge' | null) => void
  setNodes: (nodes: Node[]) => void
  commitNodePositions: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  connect: (connection: Connection) => void
  removeSelected: () => void
  replaceTasks: (sourceId: string, targetId: string, count: number) => void
  setProjectName: (name: string) => void
  updateEdge: (id: string, patch: Partial<ProjectEdge>) => void
  undo: () => void
  redo: () => void
  copySelected: () => void
  pasteClipboard: () => void
  duplicateSelected: () => void
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
  const normalized = ensureSchemaVersion(document)
  return {
    document: normalized,
    nodes: normalized.devices.map(toRfNode),
    edges: normalized.edges.map(toRfEdge),
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

function pushHistory(
  get: () => ProjectStore,
  set: (partial: Partial<ProjectStore>) => void,
  nextDocument: ProjectDocument,
  extra: Partial<ProjectStore> = {},
): void {
  const current = get().document
  const past = [...get().past, structuredClone(current)].slice(-HISTORY_LIMIT)
  const synced = syncFromDocument(nextDocument)
  set({
    ...synced,
    past,
    future: [],
    revision: get().revision + 1,
    ...extra,
  })
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...syncFromDocument(agvScenario(3, 100)),
  selectedId: null,
  selectedKind: null,
  clipboard: null,
  revision: 1,
  past: [],
  future: [],

  setDocument: (document) => {
    set({
      ...syncFromDocument(document),
      selectedId: null,
      selectedKind: null,
      past: [],
      future: [],
      revision: get().revision + 1,
    })
  },

  newProject: () => {
    get().setDocument(emptyProject('WarehouseSim'))
  },

  addDevice: (type, position, templateId) => {
    const count = get().document.devices.filter((device) => device.type === type).length + 1
    const template = templateId ? templateById(templateId) : undefined
    const device: PlacedDevice = {
      id: createUuid(type),
      type,
      name: template?.name ? `${template.name}-${count}` : `${type}-${String(count).padStart(2, '0')}`,
      x: position.x,
      y: position.y,
      params: template ? structuredClone(template.params) : defaultParams(type),
    }
    const document = {
      ...get().document,
      schemaVersion: SCHEMA_VERSION,
      devices: [...get().document.devices, device],
      nodes:
        PATH_TYPES.includes(type)
          ? [...get().document.nodes, { id: device.id, x: device.x, y: device.y, label: device.name }]
          : get().document.nodes,
    }
    pushHistory(get, set, document)
  },

  updateDeviceParams: (id, params) => {
    const document = {
      ...get().document,
      devices: get().document.devices.map((device) =>
        device.id === id ? { ...device, params } : device,
      ),
    }
    pushHistory(get, set, document)
  },

  updateDeviceName: (id, name) => {
    const document = {
      ...get().document,
      devices: get().document.devices.map((device) =>
        device.id === id ? { ...device, name } : device,
      ),
    }
    pushHistory(get, set, document)
  },

  setSelection: (id, kind = id ? 'device' : null) => {
    const current = get()
    if (current.selectedId === id && current.selectedKind === kind) {
      return
    }
    set({ selectedId: id, selectedKind: kind })
  },

  setNodes: (nodes) => {
    // Live drag updates without history spam.
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

  commitNodePositions: (nodes) => {
    const positioned = persistPositions(get().document, nodes)
    pushHistory(get, set, positioned, { nodes })
  },

  setEdges: (edges) => {
    const remaining = new Set(edges.map((edge) => edge.id))
    const document = {
      ...get().document,
      edges: get().document.edges.filter((edge) => remaining.has(edge.id)),
    }
    pushHistory(get, set, document)
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
      capacity: 1,
    })
    const created = [makeEdge(connection.source, connection.target, '')]
    if (kind === EdgeKind.Path) {
      created.push(makeEdge(connection.target, connection.source, '-rev'))
    }
    const document = {
      ...get().document,
      edges: [...get().document.edges, ...created],
    }
    pushHistory(get, set, document)
  },

  removeSelected: () => {
    const { selectedId, selectedKind, document } = get()
    if (!selectedId) {
      return
    }
    if (selectedKind === 'edge') {
      const nextDocument = {
        ...document,
        edges: document.edges.filter((edge) => edge.id !== selectedId),
      }
      pushHistory(get, set, nextDocument, { selectedId: null, selectedKind: null })
      return
    }
    const nextDocument = {
      ...document,
      devices: document.devices.filter((device) => device.id !== selectedId),
      nodes: document.nodes.filter((node) => node.id !== selectedId),
      edges: document.edges.filter(
        (edge) => edge.from !== selectedId && edge.to !== selectedId,
      ),
      tasks: document.tasks.filter(
        (task) => task.sourceId !== selectedId && task.targetId !== selectedId,
      ),
    }
    pushHistory(get, set, nextDocument, { selectedId: null, selectedKind: null })
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
    pushHistory(get, set, document)
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
    pushHistory(get, set, document)
  },

  undo: () => {
    const { past, document, future } = get()
    const previous = past[past.length - 1]
    if (!previous) {
      return
    }
    set({
      ...syncFromDocument(previous),
      past: past.slice(0, -1),
      future: [structuredClone(document), ...future].slice(0, HISTORY_LIMIT),
      revision: get().revision + 1,
      selectedId: null,
      selectedKind: null,
    })
  },

  redo: () => {
    const { past, document, future } = get()
    const next = future[0]
    if (!next) {
      return
    }
    set({
      ...syncFromDocument(next),
      past: [...past, structuredClone(document)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      revision: get().revision + 1,
      selectedId: null,
      selectedKind: null,
    })
  },

  copySelected: () => {
    const { selectedId, selectedKind, document } = get()
    if (!selectedId || selectedKind === 'edge') {
      return
    }
    const device = document.devices.find((item) => item.id === selectedId)
    if (device) {
      set({ clipboard: structuredClone(device) })
    }
  },

  pasteClipboard: () => {
    const clip = get().clipboard
    if (!clip) {
      return
    }
    const count = get().document.devices.filter((device) => device.type === clip.type).length + 1
    const device: PlacedDevice = {
      ...structuredClone(clip),
      id: createUuid(clip.type),
      name: `${clip.type}-${String(count).padStart(2, '0')}`,
      x: clip.x + 24,
      y: clip.y + 24,
    }
    set({ clipboard: { ...device } })
    const document = {
      ...get().document,
      devices: [...get().document.devices, device],
      nodes: PATH_TYPES.includes(device.type)
        ? [...get().document.nodes, { id: device.id, x: device.x, y: device.y, label: device.name }]
        : get().document.nodes,
    }
    pushHistory(get, set, document, { selectedId: device.id, selectedKind: 'device' })
  },

  duplicateSelected: () => {
    get().copySelected()
    get().pasteClipboard()
  },
}))

export function selectedDevice(): PlacedDevice | undefined {
  const state = useProjectStore.getState()
  if (!state.selectedId || state.selectedKind === 'edge') {
    return undefined
  }
  return state.document.devices.find((device) => device.id === state.selectedId)
}
