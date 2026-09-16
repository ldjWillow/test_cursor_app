import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

interface WaypointNodeData {
  name: string
}

export default function WaypointNode({ data, selected }: NodeProps<WaypointNodeData>) {
  return (
    <div className={`waypoint-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span>{data.name}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
