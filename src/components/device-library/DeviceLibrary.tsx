import { DeviceType } from '../../types/index.ts'
import type { DeviceType as DeviceTypeName } from '../../types/index.ts'

const ITEMS: Array<{ type: DeviceTypeName; label: string }> = [
  { type: DeviceType.Source, label: 'Source' },
  { type: DeviceType.Sink, label: 'Sink' },
  { type: DeviceType.Station, label: 'Station' },
  { type: DeviceType.Conveyor, label: 'Conveyor' },
  { type: DeviceType.Agv, label: 'AGV' },
  { type: DeviceType.Rack, label: 'Rack' },
  { type: DeviceType.Stacker, label: 'Stacker' },
  { type: DeviceType.Charger, label: 'Charger' },
  { type: DeviceType.PathNode, label: 'Path Node' },
]

export default function DeviceLibrary() {
  return (
    <aside className="panel device-library">
      <div className="panel-title">Device Library</div>
      <p className="panel-hint">Drag a device onto the canvas. Connect stations/path nodes to build AGV routes. Connect Source → Conveyor → Sink for material flow.</p>
      <div className="library-list">
        {ITEMS.map((item) => (
          <div
            key={item.type}
            className={`library-item library-${item.type}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/warehousesim', item.type)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <span className="library-swatch" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
