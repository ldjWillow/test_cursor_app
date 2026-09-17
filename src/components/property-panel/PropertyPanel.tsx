import { Input, InputNumber } from 'antd'
import { useTranslation } from 'react-i18next'
import { DeviceType } from '../../types/index.ts'
import type { DeviceParams, PlacedDevice, ProjectEdge } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { round } from '../../utils/math.ts'
import { formatMeters, formatPercent, formatSeconds, formatSpeed } from '../../utils/formatters.ts'
import type { AgvRuntimeState } from '../../twin/types.ts'
import { agvStatusLabel, deviceTypeLabel } from '../../i18n/statusLabels.ts'

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
  const { t } = useTranslation()
  const update = (params: DeviceParams) => useProjectStore.getState().updateDeviceParams(device.id, params)
  const params = device.params

  if (device.type === DeviceType.Source && 'generationInterval' in params) {
    return (
      <>
        <NumberField
          label={t('properties.params.generationInterval')}
          value={params.generationInterval}
          onChange={(generationInterval) => update({ ...params, generationInterval })}
        />
        <NumberField
          label={t('properties.params.totalCount')}
          value={params.totalCount}
          onChange={(totalCount) => update({ ...params, totalCount })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Conveyor && 'length' in params) {
    return (
      <>
        <NumberField
          label={t('properties.params.length')}
          value={params.length}
          onChange={(length) => update({ ...params, length })}
        />
        <NumberField
          label={t('properties.params.speed')}
          value={params.speed}
          onChange={(speed) => update({ ...params, speed })}
        />
        <NumberField
          label={t('properties.params.capacity')}
          value={params.capacity}
          onChange={(capacity) => update({ ...params, capacity })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Agv && 'loadTime' in params) {
    return (
      <>
        <NumberField
          label={t('properties.params.maxSpeed')}
          value={params.speed}
          onChange={(speed) => update({ ...params, speed })}
        />
        <NumberField
          label={t('properties.params.capacity')}
          value={params.capacity}
          onChange={(capacity) => update({ ...params, capacity })}
        />
        <NumberField
          label={t('properties.params.loadTime')}
          value={params.loadTime}
          onChange={(loadTime) => update({ ...params, loadTime })}
        />
        <NumberField
          label={t('properties.params.unloadTime')}
          value={params.unloadTime}
          onChange={(unloadTime) => update({ ...params, unloadTime })}
        />
        <NumberField
          label={t('properties.params.batteryCapacity')}
          value={params.batteryCapacity}
          onChange={(batteryCapacity) => update({ ...params, batteryCapacity })}
        />
        <NumberField
          label={t('properties.params.currentBattery')}
          value={params.currentBattery}
          onChange={(currentBattery) => update({ ...params, currentBattery })}
        />
        <NumberField
          label={t('properties.params.chargeThreshold')}
          value={params.chargeThreshold}
          onChange={(chargeThreshold) => update({ ...params, chargeThreshold })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Rack && 'rows' in params) {
    return (
      <>
        <NumberField label={t('properties.params.rows')} value={params.rows} onChange={(rows) => update({ ...params, rows })} />
        <NumberField
          label={t('properties.params.columns')}
          value={params.columns}
          onChange={(columns) => update({ ...params, columns })}
        />
        <NumberField
          label={t('properties.params.levels')}
          value={params.levels}
          onChange={(levels) => update({ ...params, levels })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Stacker && 'forkTime' in params) {
    return (
      <>
        <NumberField
          label={t('properties.params.horizontalSpeed')}
          value={params.horizontalSpeed}
          onChange={(horizontalSpeed) => update({ ...params, horizontalSpeed })}
        />
        <NumberField
          label={t('properties.params.verticalSpeed')}
          value={params.verticalSpeed}
          onChange={(verticalSpeed) => update({ ...params, verticalSpeed })}
        />
        <NumberField
          label={t('properties.params.forkTime')}
          value={params.forkTime}
          onChange={(forkTime) => update({ ...params, forkTime })}
        />
      </>
    )
  }
  if (device.type === DeviceType.Station && 'processTime' in params) {
    return (
      <>
        <NumberField
          label={t('properties.params.processTime')}
          value={params.processTime}
          onChange={(processTime) => update({ ...params, processTime })}
        />
        <NumberField
          label={t('properties.params.capacity')}
          value={params.capacity}
          onChange={(capacity) => update({ ...params, capacity })}
        />
      </>
    )
  }
  return <div className="panel-hint">{t('properties.params.none')}</div>
}

function EdgeFields({ edge }: { edge: ProjectEdge }) {
  const { t } = useTranslation()
  const updateEdge = (patch: Partial<ProjectEdge>) => {
    useProjectStore.getState().updateEdge(edge.id, patch)
  }
  return (
    <>
      <div className="prop-static">
        {t('properties.edge.from')}: {edge.from}
      </div>
      <div className="prop-static">
        {t('properties.edge.to')}: {edge.to}
      </div>
      <NumberField
        label={t('properties.params.distance')}
        value={edge.distance}
        onChange={(distance) => updateEdge({ distance })}
      />
      <NumberField
        label={t('properties.params.edgeMaxSpeed')}
        value={edge.maxSpeed}
        onChange={(maxSpeed) => updateEdge({ maxSpeed })}
      />
    </>
  )
}

const EMPTY_TIMELINE: never[] = []

export default function PropertyPanel() {
  const { t } = useTranslation()
  const selectedId = useProjectStore((state) => state.selectedId)
  const selectedKind = useProjectStore((state) => state.selectedKind)
  const document = useProjectStore((state) => state.document)
  const twinDevice = useDigitalTwinStore((state) =>
    selectedId ? state.twin.devices[selectedId] : undefined,
  )
  const timeline = useSimulationStore(
    (state) => state.snapshot.devices.find((item) => item.id === selectedId)?.timeline ?? EMPTY_TIMELINE,
  )
  const device = document.devices.find((item) => item.id === selectedId)
  const edge = document.edges.find((item) => item.id === selectedId)
  const agvTwin = twinDevice?.type === 'agv' ? (twinDevice as AgvRuntimeState) : undefined

  return (
    <aside className="panel property-panel">
      <div className="panel-title">{t('properties.title')}</div>
      {!selectedId && <div className="panel-hint">{t('properties.empty')}</div>}
      {selectedKind === 'device' && device && (
        <div className="prop-form">
          <div className="panel-title panel-title-sub">{t('properties.general')}</div>
          <label className="prop-field">
            <span>{t('properties.name')}</span>
            <Input
              size="small"
              value={device.name}
              onChange={(event) => useProjectStore.getState().updateDeviceName(device.id, event.target.value)}
            />
          </label>
          <div className="prop-static">
            {t('properties.id')}: {device.id}
          </div>
          <div className="prop-static">
            {t('properties.type')}: {deviceTypeLabel(device.type, t)}
          </div>
          <div className="prop-static">
            {t('properties.position')}: {device.x.toFixed(0)}, {device.y.toFixed(0)}
          </div>
          <ParamFields device={device} />
          {agvTwin && (
            <>
              <div className="panel-title panel-title-sub" style={{ marginTop: 10 }}>
                {t('properties.twinRuntime')}
              </div>
              <div className="prop-static">
                {t('properties.twin.status')}: {agvStatusLabel(agvTwin.status, t)}
              </div>
              <div className="prop-static">
                {t('properties.twin.task')}: {agvTwin.currentTaskId ?? '-'}
              </div>
              <div className="prop-static">
                {t('properties.twin.battery')}: {formatPercent(agvTwin.battery / 100, 1)}
              </div>
              <div className="prop-static">
                {t('properties.twin.speed')}: {formatSpeed(agvTwin.speed)}
              </div>
              <div className="prop-static">
                {t('properties.twin.world')}: {round(agvTwin.x, 2)}, {round(agvTwin.y, 2)} m
              </div>
              <div className="prop-static">
                {t('properties.twin.node')}: {agvTwin.nodeId ?? '-'}
              </div>
              <div className="prop-static">
                {t('properties.twin.routeWait')}: {formatSeconds(agvTwin.routeWaitingTime)}
              </div>
              <div className="prop-static">
                {t('properties.twin.travel')}: {formatMeters(agvTwin.travelDistance)}
              </div>
              <div className="prop-static">
                {t('properties.twin.loaded')}: {formatMeters(agvTwin.loadedTravelDistance)}
              </div>
              <div className="prop-static">
                {t('properties.twin.empty')}: {formatMeters(agvTwin.emptyTravelDistance)}
              </div>
              <div className="panel-title panel-title-sub" style={{ marginTop: 8 }}>
                {t('properties.timeline')}
              </div>
              <div className="event-list log-scroll">
                {timeline.slice(-12).map((segment, index) => (
                  <div key={`${segment.status}-${segment.startTime}-${index}`}>
                    {segment.startTime.toFixed(1)}-{segment.endTime.toFixed(1)} {agvStatusLabel(segment.status, t)}
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
