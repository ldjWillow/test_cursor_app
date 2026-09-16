import { useCallback, useEffect, useMemo } from 'react'
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
import { useProjectStore } from '../store/projectStore.ts'
import { DeviceType, SimulationStatus } from '../types/index.ts'
import type { DeviceType as DeviceTypeName } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'

const nodeTypes = {
  device: DeviceNode,
  waypoint: WaypointNode,
}

function CanvasInner() {
  const nodes = useProjectStore((state) => state.nodes)
  const edges = useProjectStore((state) => state.edges)
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
  const { screenToFlowPosition } = useReactFlow()

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
      }
    })
  }, [nodes, snapshot.devices, simStatus])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const status = useSimulationStore.getState().status
      const nextChanges =
        status === SimulationStatus.Idle
          ? changes
          : changes.filter((change) => change.type !== 'position')
      if (nextChanges.length === 0) {
        return
      }
      setNodes(applyNodeChanges(nextChanges, useProjectStore.getState().nodes))
    },
    [setNodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(applyEdgeChanges(changes, useProjectStore.getState().edges))
    },
    [setEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      connect(connection)
    },
    [connect],
  )

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/warehousesim') as DeviceTypeName
      const templateId = event.dataTransfer.getData('application/warehousesim-template')
      if (!type) {
        return
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addDevice(type, position, templateId || undefined)
    },
    [addDevice, screenToFlowPosition],
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
        // React Flow also handles delete; keep store in sync for selection-only deletes.
        if (useProjectStore.getState().selectedId) {
          event.preventDefault()
          removeSelected()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, copySelected, pasteClipboard, duplicateSelected, removeSelected])

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
        if (selectedNodes[0]) {
          setSelection(selectedNodes[0].id, 'device')
          setSelectedLogEntity(selectedNodes[0].id)
          useDigitalTwinStore.getState().selectDevice(selectedNodes[0].id)
          return
        }
        if (selectedEdges[0]) {
          setSelection(selectedEdges[0].id, 'edge')
          return
        }
        setSelection(null, null)
        useDigitalTwinStore.getState().selectDevice(undefined)
      }}
      onNodeDragStop={(_event, _node, currentNodes) => {
        useProjectStore.getState().commitNodePositions(currentNodes)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={onDrop}
      deleteKeyCode={null}
      snapToGrid
      snapGrid={[16, 16]}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Lines} gap={16} color="#243044" />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(8, 12, 18, 0.7)"
        style={{ background: '#121821' }}
      />
      <Controls />
    </ReactFlow>
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
