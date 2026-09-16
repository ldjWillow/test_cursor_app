import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from 'reactflow'
import type { Connection, EdgeChange, NodeChange } from 'reactflow'
import DeviceNode from './nodes/DeviceNode.tsx'
import WaypointNode from './nodes/WaypointNode.tsx'
import OffsetEdge from './edges/OffsetEdge.tsx'
import { useProjectStore } from '../store/projectStore.ts'
import { DeviceType, SimulationStatus } from '../types/index.ts'
import type { DeviceType as DeviceTypeName } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'

const nodeTypes = {
  device: DeviceNode,
  waypoint: WaypointNode,
}

const edgeTypes = {
  offset: OffsetEdge,
}

/** Padding that keeps nodes clear of minimap / controls chrome inside the canvas cell. */
const SAFE_FIT_PADDING = 0.22

function CanvasInner() {
  const nodes = useProjectStore((state) => state.nodes)
  const edges = useProjectStore((state) => state.edges)
  const revision = useProjectStore((state) => state.revision)
  const setNodes = useProjectStore((state) => state.setNodes)
  const setEdges = useProjectStore((state) => state.setEdges)
  const connect = useProjectStore((state) => state.connect)
  const addDevice = useProjectStore((state) => state.addDevice)
  const setSelection = useProjectStore((state) => state.setSelection)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const copySelected = useProjectStore((state) => state.copySelected)
  const pasteClipboard = useProjectStore((state) => state.pasteClipboard)
  const duplicateSelected = useProjectStore((state) => state.duplicateSelected)
  const removeSelected = useProjectStore((state) => state.removeSelected)
  const snapshot = useSimulationStore((state) => state.snapshot)
  const simStatus = useSimulationStore((state) => state.status)
  const setSelectedLogEntity = useSimulationStore((state) => state.setSelectedLogEntity)
  const setError = useSimulationStore((state) => state.setError)
  const { screenToFlowPosition, fitView, getViewport, setViewport } = useReactFlow()
  const [minimapOpen, setMinimapOpen] = useState(true)
  const editingLocked = simStatus === SimulationStatus.Running

  const displayNodes = useMemo(() => {
    if (
      snapshot.devices.length === 0 ||
      simStatus === SimulationStatus.Idle
    ) {
      return nodes
    }
    const byId = new Map(snapshot.devices.map((device) => [device.id, device]))
    return nodes.map((node) => {
      const runtime = byId.get(node.id)
      if (!runtime || runtime.type !== DeviceType.Agv) {
        return node
      }
      return {
        ...node,
        position: { x: runtime.x, y: runtime.y },
        data: {
          ...node.data,
          name: runtime.name,
          status: runtime.status,
        },
      }
    })
  }, [nodes, snapshot.devices, simStatus])

  const refitSafe = useCallback(() => {
    fitView({ padding: SAFE_FIT_PADDING, duration: 200 })
  }, [fitView])

  useEffect(() => {
    refitSafe()
  }, [revision, refitSafe])

  useEffect(() => {
    const onResize = () => refitSafe()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [refitSafe])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const status = useSimulationStore.getState().status
      if (status === SimulationStatus.Running) {
        const blocked = changes.some((change) => change.type === 'position' || change.type === 'remove')
        if (blocked) {
          setError('编辑已锁定：仿真运行中。请先 Pause 或 Reset。')
        }
        const nextChanges = changes.filter(
          (change) => change.type !== 'position' && change.type !== 'remove',
        )
        if (nextChanges.length === 0) {
          return
        }
        setNodes(applyNodeChanges(nextChanges, useProjectStore.getState().nodes))
        return
      }
      setNodes(applyNodeChanges(changes, useProjectStore.getState().nodes))
    },
    [setNodes, setError],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const status = useSimulationStore.getState().status
      if (status === SimulationStatus.Running) {
        setError('编辑已锁定：仿真运行中。请先 Pause 或 Reset。')
        return
      }
      setEdges(applyEdgeChanges(changes, useProjectStore.getState().edges))
    },
    [setEdges, setError],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (useSimulationStore.getState().status === SimulationStatus.Running) {
        setError('编辑已锁定：仿真运行中。请先 Pause 或 Reset。')
        return
      }
      connect(connection)
    },
    [connect, setError],
  )

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      if (useSimulationStore.getState().status === SimulationStatus.Running) {
        setError('编辑已锁定：仿真运行中。请先 Pause 或 Reset。')
        return
      }
      const type = event.dataTransfer.getData('application/warehousesim') as DeviceTypeName
      const templateId = event.dataTransfer.getData('application/warehousesim-template')
      if (!type) {
        return
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addDevice(type, position, templateId || undefined)
    },
    [addDevice, screenToFlowPosition, setError],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault()
        redo()
      } else if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelected()
      } else if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteClipboard()
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (useProjectStore.getState().selectedId) {
          event.preventDefault()
          removeSelected()
        }
      } else if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        refitSafe()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, copySelected, pasteClipboard, duplicateSelected, removeSelected, refitSafe])

  return (
    <div className="canvas-inner">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
          if (selectedNodes[0]) {
            setSelection(selectedNodes[0].id, 'device')
            setSelectedLogEntity(selectedNodes[0].id)
            return
          }
          if (selectedEdges[0]) {
            setSelection(selectedEdges[0].id, 'edge')
            return
          }
          setSelection(null, null)
        }}
        onNodeDragStop={(_event, _node, currentNodes) => {
          useProjectStore.getState().commitNodePositions(currentNodes)
        }}
        onNodeDrag={(_event, node) => {
          // Auto-pan when dragging near the viewport edge.
          const viewport = getViewport()
          const bounds = document.querySelector('.react-flow__viewport')?.parentElement?.getBoundingClientRect()
          if (!bounds) {
            return
          }
          const screenX = node.positionAbsolute?.x ?? node.position.x
          const screenY = node.positionAbsolute?.y ?? node.position.y
          const projectedX = screenX * viewport.zoom + viewport.x
          const projectedY = screenY * viewport.zoom + viewport.y
          const margin = 48
          let dx = 0
          let dy = 0
          if (projectedX < margin) dx = 12
          if (projectedX > bounds.width - margin) dx = -12
          if (projectedY < margin) dy = 12
          if (projectedY > bounds.height - margin) dy = -12
          if (dx || dy) {
            setViewport({ x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom })
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={onDrop}
        deleteKeyCode={null}
        nodesDraggable={!editingLocked}
        nodesConnectable={!editingLocked}
        elementsSelectable
        autoPanOnNodeDrag
        autoPanOnConnect
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: SAFE_FIT_PADDING }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Lines} gap={16} color="#243044" />
        {minimapOpen && (
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(8, 12, 18, 0.7)"
            style={{ background: '#121821' }}
          />
        )}
        <Controls />
      </ReactFlow>
      <div className="canvas-overlays">
        <button type="button" className="canvas-chip" onClick={() => setMinimapOpen((open) => !open)}>
          {minimapOpen ? 'Hide minimap' : 'Show minimap'}
        </button>
        <button type="button" className="canvas-chip" onClick={refitSafe}>
          Fit safe view
        </button>
        {editingLocked && <span className="canvas-chip canvas-chip-warn">Editing locked (RUNNING)</span>}
      </div>
    </div>
  )
}

export default function WarehouseCanvas() {
  return (
    <div className="canvas-shell">
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </div>
  )
}
