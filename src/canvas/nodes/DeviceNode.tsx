import type { CSSProperties } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useTranslation } from 'react-i18next'
import { DeviceType } from '../../types/index.ts'
import type { DeviceType as DeviceTypeName } from '../../types/index.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { deviceStatusLabel, deviceTypeLabel } from '../../i18n/statusLabels.ts'

const COLORS: Record<DeviceTypeName, string> = {
  source: '#3ecf8e',
  sink: '#f07178',
  station: '#6ea8fe',
  conveyor: '#f5a524',
  agv: '#22d3ee',
  rack: '#c084fc',
  stacker: '#fb923c',
  charger: '#fde047',
  'path-node': '#94a3b8',
}

interface DeviceNodeData {
  deviceType: DeviceTypeName
  name: string
}

export default function DeviceNode({ id, data, selected }: NodeProps<DeviceNodeData>) {
  const { t } = useTranslation()
  const runtime = useSimulationStore((state) => state.snapshot.devices.find((device) => device.id === id))
  const color = COLORS[data.deviceType] ?? '#6ea8fe'
  const status = runtime?.status ?? 'idle'
  const style: CSSProperties = {
    minWidth: data.deviceType === DeviceType.Conveyor ? 140 : 108,
    borderColor: selected ? '#fff' : color,
    boxShadow: selected ? `0 0 0 1px ${color}` : undefined,
  }

  return (
    <div
      className={`device-node device-node-${data.deviceType} status-${String(status).toLowerCase()}`}
      style={style}
    >
      <Handle type="target" position={Position.Left} />
      <div className="device-node-kind" style={{ color }}>
        {deviceTypeLabel(data.deviceType, t)}
      </div>
      <div className="device-node-name">{data.name}</div>
      <div className="device-node-status">{deviceStatusLabel(status, t)}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
