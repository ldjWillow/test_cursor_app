import { Input, InputNumber } from 'antd'
import { DeviceType, SimulationStatus } from '../../types/index.ts'
import type { DeviceParams, PlacedDevice, ProjectEdge } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <InputNumber
        size="small"
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(typeof next === 'number' ? next : 0)}
        style={{ width: '100%' }}
      />
    </label>
  )
}

function ParamFields({ device, disabled }: { device: PlacedDevice; disabled?: boolean }) {
  const update = (params: DeviceParams) => useProjectStore.getState().updateDeviceParams(device.id, params)
  const params = device.params

  if (device.type === DeviceType.Source && 'generationInterval' in params) {
    return (
      <>
        <NumberField
          label="generationInterval (s)"
          value={params.generationInterval}
          disabled={disabled}
          onChange={(generationInterval) => update({ ...params, generationInterval })}
        />
        <NumberField
          label="totalCount"
          value={params.totalCount}
          disabled={disabled}
          onChange={(totalCount) => update({ ...params, totalCount })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Conveyor && 'length' in params) {
    return (
      <>
        <NumberField label="length (m)" value={params.length} disabled={disabled} onChange={(length) => update({ ...params, length })} />
        <NumberField label="speed (m/s)" value={params.speed} disabled={disabled} onChange={(speed) => update({ ...params, speed })} />
        <NumberField label="capacity" value={params.capacity} disabled={disabled} onChange={(capacity) => update({ ...params, capacity })} />
      </>
    )
  }
  if (device.type === DeviceType.Agv && 'loadTime' in params) {
    return (
      <>
        <NumberField label="speed (m/s)" value={params.speed} disabled={disabled} onChange={(speed) => update({ ...params, speed })} />
        <NumberField label="capacity" value={params.capacity} disabled={disabled} onChange={(capacity) => update({ ...params, capacity })} />
        <NumberField label="loadTime (s)" value={params.loadTime} disabled={disabled} onChange={(loadTime) => update({ ...params, loadTime })} />
        <NumberField
          label="unloadTime (s)"
          value={params.unloadTime}
          disabled={disabled}
          onChange={(unloadTime) => update({ ...params, unloadTime })}
        />
        <NumberField
          label="batteryCapacity"
          value={params.batteryCapacity}
          disabled={disabled}
          onChange={(batteryCapacity) => update({ ...params, batteryCapacity })}
        />
        <NumberField
          label="currentBattery"
          value={params.currentBattery}
          disabled={disabled}
          onChange={(currentBattery) => update({ ...params, currentBattery })}
        />
        <NumberField
          label="chargeThreshold"
          value={params.chargeThreshold}
          disabled={disabled}
          onChange={(chargeThreshold) => update({ ...params, chargeThreshold })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Rack && 'rows' in params) {
    return (
      <>
        <NumberField label="rows" value={params.rows} disabled={disabled} onChange={(rows) => update({ ...params, rows })} />
        <NumberField label="columns" value={params.columns} disabled={disabled} onChange={(columns) => update({ ...params, columns })} />
        <NumberField label="levels" value={params.levels} disabled={disabled} onChange={(levels) => update({ ...params, levels })} />
      </>
    )
  }
  if (device.type === DeviceType.Stacker && 'forkTime' in params) {
    return (
      <>
        <NumberField
          label="horizontalSpeed"
          value={params.horizontalSpeed}
          disabled={disabled}
          onChange={(horizontalSpeed) => update({ ...params, horizontalSpeed })}
        />
        <NumberField
          label="verticalSpeed"
          value={params.verticalSpeed}
          disabled={disabled}
          onChange={(verticalSpeed) => update({ ...params, verticalSpeed })}
        />
        <NumberField label="forkTime (s)" value={params.forkTime} disabled={disabled} onChange={(forkTime) => update({ ...params, forkTime })} />
      </>
    )
  }
  if (device.type === DeviceType.Station && 'processTime' in params) {
    return (
      <>
        <NumberField
          label="processTime (s)"
          value={params.processTime}
          disabled={disabled}
          onChange={(processTime) => update({ ...params, processTime })}
        />
        <NumberField label="capacity" value={params.capacity} disabled={disabled} onChange={(capacity) => update({ ...params, capacity })} />
      </>
    )
  }
  return <div className="panel-hint">No extra parameters for this device.</div>
}

function EdgeFields({ edge, disabled }: { edge: ProjectEdge; disabled?: boolean }) {
  const updateEdge = (patch: Partial<ProjectEdge>) => {
    useProjectStore.getState().updateEdge(edge.id, patch)
  }
  return (
    <>
      <div className="prop-static">Edge ID: {edge.id}</div>
      <div className="prop-static">From: {edge.from}</div>
      <div className="prop-static">To: {edge.to}</div>
      <div className="prop-static">Kind: {edge.kind}</div>
      <NumberField label="distance" value={edge.distance} disabled={disabled} onChange={(distance) => updateEdge({ distance })} />
      <NumberField label="maxSpeed" value={edge.maxSpeed} disabled={disabled} onChange={(maxSpeed) => updateEdge({ maxSpeed })} />
    </>
  )
}

export default function PropertyPanel() {
  const selectedId = useProjectStore((state) => state.selectedId)
  const selectedKind = useProjectStore((state) => state.selectedKind)
  const document = useProjectStore((state) => state.document)
  const status = useSimulationStore((state) => state.status)
  const device = document.devices.find((item) => item.id === selectedId)
  const edge = document.edges.find((item) => item.id === selectedId)
  const runtime = useSimulationStore((state) => state.snapshot.devices.find((item) => item.id === selectedId))
  const disabled = status === SimulationStatus.Running

  return (
    <aside className="panel property-panel">
      <div className="panel-title">Properties</div>
      {disabled && <div className="panel-hint">编辑已锁定：仿真运行中。请先 Pause 或 Reset。</div>}
      {!selectedId && <div className="panel-hint">Select a device or edge.</div>}
      {selectedKind === 'device' && device && (
        <div className="prop-form">
          <label className="prop-field">
            <span>Name</span>
            <Input
              size="small"
              value={device.name}
              disabled={disabled}
              onChange={(event) => useProjectStore.getState().updateDeviceName(device.id, event.target.value)}
            />
          </label>
          <div className="prop-static">Type: {device.type}</div>
          <div className="prop-static">ID: {device.id}</div>
          <div className="prop-static">
            Position: {device.x.toFixed(0)}, {device.y.toFixed(0)}
          </div>
          {runtime && <div className="prop-static">Runtime status: {runtime.status}</div>}
          <ParamFields device={device} disabled={disabled} />
        </div>
      )}
      {selectedKind === 'edge' && edge && <EdgeFields edge={edge} disabled={disabled} />}
    </aside>
  )
}
