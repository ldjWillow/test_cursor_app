import { BaseEdge, getBezierPath, EdgeLabelRenderer } from 'reactflow'
import type { EdgeProps } from 'reactflow'

/**
 * Bidirectional-safe edge: opposite partners get opposite curvature so hit
 * targets and arrows do not fully overlap.
 */
export default function OffsetEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const offset = typeof data?.offset === 'number' ? data.offset : 0
  const curvature = 0.25 * (offset === 0 ? 0.15 : offset)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3.5 : (style?.strokeWidth as number | undefined) ?? 2,
          stroke: selected ? '#ffd166' : style?.stroke,
        }}
      />
      {/* Wide invisible stroke for reliable hit-testing of curved pairs */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="react-flow__edge-interaction"
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              pointerEvents: 'none',
              background: '#1b2431',
              color: '#ffd166',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid #ffd166',
            }}
            className="nodrag nopan"
          >
            {id}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
