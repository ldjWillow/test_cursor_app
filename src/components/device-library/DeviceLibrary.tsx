import { DeviceType } from '../../types/index.ts'
import type { DeviceType as DeviceTypeName } from '../../types/index.ts'
import { DEVICE_TEMPLATES } from '../../domain/base/templates.ts'

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
      <p className="panel-hint">
        Drag a device onto the canvas. Connect stations/path nodes to build AGV routes. Templates
        apply preset speeds/capacities.
      </p>
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
      <div className="panel-title" style={{ marginTop: 16 }}>
        Templates
      </div>
      <div className="library-list">
        {DEVICE_TEMPLATES.map((template) => (
          <div
            key={template.id}
            className={`library-item library-${template.type}`}
            draggable
            title={template.description}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/warehousesim', template.type)
              event.dataTransfer.setData('application/warehousesim-template', template.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <span className="library-swatch" />
            <span>
              {template.name}
              <br />
              <small className="panel-hint">{template.description}</small>
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}
