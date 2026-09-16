import { Input, InputNumber } from 'antd'
import { DeviceType } from '../../types/index.ts'
import type { DeviceParams, PlacedDevice, ProjectEdge } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { round } from '../../utils/math.ts'
import type { AgvRuntimeState } from '../../twin/types.ts'

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <InputNumber
        size="small"
        value={value}
        onChange={(next) => onChange(typeof next === 'number' ? next : 0)}
        style={{ width: '100%' }}
      />
    </label>
  )
}

function ParamFields({ device }: { device: PlacedDevice }) {
  const update = (params: DeviceParams) => useProjectStore.getState().updateDeviceParams(device.id, params)
  const params = device.params

  if (device.type === DeviceType.Source && 'generationInterval' in params) {
    return (
      <>
        <NumberField
          label="generationInterval (s)"
          value={params.generationInterval}
          onChange={(generationInterval) => update({ ...params, generationInterval })}
        />
        <NumberField
          label="totalCount"
          value={params.totalCount}
          onChange={(totalCount) => update({ ...params, totalCount })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Conveyor && 'length' in params) {
    return (
      <>
        <NumberField label="length (m)" value={params.length} onChange={(length) => update({ ...params, length })} />
        <NumberField label="speed (m/s)" value={params.speed} onChange={(speed) => update({ ...params, speed })} />
        <NumberField label="capacity" value={params.capacity} onChange={(capacity) => update({ ...params, capacity })} />
      </>
    )
  }
  if (device.type === DeviceType.Agv && 'loadTime' in params) {
    return (
      <>
        <NumberField label="speed (m/s)" value={params.speed} onChange={(speed) => update({ ...params, speed })} />
        <NumberField label="capacity" value={params.capacity} onChange={(capacity) => update({ ...params, capacity })} />
        <NumberField label="loadTime (s)" value={params.loadTime} onChange={(loadTime) => update({ ...params, loadTime })} />
        <NumberField
          label="unloadTime (s)"
          value={params.unloadTime}
          onChange={(unloadTime) => update({ ...params, unloadTime })}
        />
        <NumberField
          label="batteryCapacity"
          value={params.batteryCapacity}
          onChange={(batteryCapacity) => update({ ...params, batteryCapacity })}
        />
        <NumberField
          label="currentBattery"
          value={params.currentBattery}
          onChange={(currentBattery) => update({ ...params, currentBattery })}
        />
        <NumberField
          label="chargeThreshold"
          value={params.chargeThreshold}
          onChange={(chargeThreshold) => update({ ...params, chargeThreshold })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Rack && 'rows' in params) {
    return (
      <>
        <NumberField label="rows" value={params.rows} onChange={(rows) => update({ ...params, rows })} />
        <NumberField label="columns" value={params.columns} onChange={(columns) => update({ ...params, columns })} />
        <NumberField label="levels" value={params.levels} onChange={(levels) => update({ ...params, levels })} />
      </>
    )
  }
  if (device.type === DeviceType.Stacker && 'forkTime' in params) {
    return (
      <>
        <NumberField
          label="horizontalSpeed"
          value={params.horizontalSpeed}
          onChange={(horizontalSpeed) => update({ ...params, horizontalSpeed })}
        />
        <NumberField
          label="verticalSpeed"
          value={params.verticalSpeed}
          onChange={(verticalSpeed) => update({ ...params, verticalSpeed })}
        />
        <NumberField label="forkTime (s)" value={params.forkTime} onChange={(forkTime) => update({ ...params, forkTime })} />
      </>
    )
  }
  if (device.type === DeviceType.Station && 'processTime' in params) {
    return (
      <>
        <NumberField
          label="processTime (s)"
          value={params.processTime}
          onChange={(processTime) => update({ ...params, processTime })}
        />
        <NumberField label="capacity" value={params.capacity} onChange={(capacity) => update({ ...params, capacity })} />
      </>
    )
  }
  return <div className="panel-hint">No extra parameters for this device.</div>
}

function EdgeFields({ edge }: { edge: ProjectEdge }) {
  const updateEdge = (patch: Partial<ProjectEdge>) => {
    useProjectStore.getState().updateEdge(edge.id, patch)
  }
  return (
    <>
      <div className="prop-static">From {edge.from}</div>
      <div className="prop-static">To {edge.to}</div>
      <NumberField label="distance" value={edge.distance} onChange={(distance) => updateEdge({ distance })} />
      <NumberField label="maxSpeed" value={edge.maxSpeed} onChange={(maxSpeed) => updateEdge({ maxSpeed })} />
    </>
  )
}

const EMPTY_TIMELINE: never[] = []

export default function PropertyPanel() {
  const selectedId = useProjectStore((state) => state.selectedId)
  const selectedKind = useProjectStore((state) => state.selectedKind)
  const document = useProjectStore((state) => state.document)
  const twinDevice = useDigitalTwinStore((state) =>
    selectedId ? state.twin.devices[selectedId] : undefined,
  )
  // Stable empty fallback — a fresh `[]` each select trips React 19 getSnapshot loops.
  const timeline = useSimulationStore(
    (state) => state.snapshot.devices.find((item) => item.id === selectedId)?.timeline ?? EMPTY_TIMELINE,
  )
  const device = document.devices.find((item) => item.id === selectedId)
  const edge = document.edges.find((item) => item.id === selectedId)
  const agvTwin = twinDevice?.type === 'agv' ? (twinDevice as AgvRuntimeState) : undefined

  return (
    <aside className="panel property-panel">
      <div className="panel-title">Properties</div>
      {!selectedId && <div className="panel-hint">Select a device or edge.</div>}
      {selectedKind === 'device' && device && (
        <div className="prop-form">
          <label className="prop-field">
            <span>Name</span>
            <Input
              size="small"
              value={device.name}
              onChange={(event) => useProjectStore.getState().updateDeviceName(device.id, event.target.value)}
            />
          </label>
          <div className="prop-static">Type: {device.type}</div>
          <div className="prop-static">
            Position: {device.x.toFixed(0)}, {device.y.toFixed(0)}
          </div>
          <ParamFields device={device} />
          {agvTwin && (
            <>
              <div className="panel-title" style={{ marginTop: 10 }}>
                Twin Runtime
              </div>
              <div className="prop-static">Status: {agvTwin.status}</div>
              <div className="prop-static">Task: {agvTwin.currentTaskId ?? '-'}</div>
              <div className="prop-static">Battery: {round(agvTwin.battery, 1)}</div>
              <div className="prop-static">Speed: {agvTwin.speed} m/s</div>
              <div className="prop-static">
                World: {round(agvTwin.x, 2)}, {round(agvTwin.y, 2)} m
              </div>
              <div className="prop-static">Node: {agvTwin.nodeId ?? '-'}</div>
              <div className="prop-static">Route Wait: {round(agvTwin.routeWaitingTime, 1)} s</div>
              <div className="prop-static">Travel: {round(agvTwin.travelDistance, 1)} m</div>
              <div className="prop-static">Loaded: {round(agvTwin.loadedTravelDistance, 1)} m</div>
              <div className="prop-static">Empty: {round(agvTwin.emptyTravelDistance, 1)} m</div>
              <div className="panel-title" style={{ marginTop: 8 }}>
                Timeline
              </div>
              <div className="event-list log-scroll">
                {timeline.slice(-12).map((segment, index) => (
                  <div key={`${segment.status}-${segment.startTime}-${index}`}>
                    {segment.startTime.toFixed(1)}-{segment.endTime.toFixed(1)} {segment.status}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {selectedKind === 'edge' && edge && <EdgeFields edge={edge} />}
    </aside>
  )
}
