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
import { isModelEditable } from '../../utils/modelLock.ts'

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

function ParamFields({ device, disabled }: { device: PlacedDevice; disabled: boolean }) {
  const { t } = useTranslation()
  const update = (params: DeviceParams) => useProjectStore.getState().updateDeviceParams(device.id, params)
  const params = device.params

  if (device.type === DeviceType.Source && 'generationInterval' in params) {
    return (
      <>
        <NumberField
          label={t('properties.params.generationInterval')}
          value={params.generationInterval}
          disabled={disabled}
          onChange={(generationInterval) => update({ ...params, generationInterval })}
        />
        <NumberField
          label={t('properties.params.totalCount')}
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
        <NumberField
          label={t('properties.params.length')}
          value={params.length}
          disabled={disabled}
          onChange={(length) => update({ ...params, length })}
        />
        <NumberField
          label={t('properties.params.speed')}
          value={params.speed}
          disabled={disabled}
          onChange={(speed) => update({ ...params, speed })}
        />
        <NumberField
          label={t('properties.params.capacity')}
          value={params.capacity}
          disabled={disabled}
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
          disabled={disabled}
          onChange={(speed) => update({ ...params, speed })}
        />
        <NumberField
          label={t('properties.params.capacity')}
          value={params.capacity}
          disabled={disabled}
          onChange={(capacity) => update({ ...params, capacity })}
        />
        <NumberField
          label={t('properties.params.loadTime')}
          value={params.loadTime}
          disabled={disabled}
          onChange={(loadTime) => update({ ...params, loadTime })}
        />
        <NumberField
          label={t('properties.params.unloadTime')}
          value={params.unloadTime}
          disabled={disabled}
          onChange={(unloadTime) => update({ ...params, unloadTime })}
        />
        <NumberField
          label={t('properties.params.batteryCapacity')}
          value={params.batteryCapacity}
          disabled={disabled}
          onChange={(batteryCapacity) => update({ ...params, batteryCapacity })}
        />
        <NumberField
          label={t('properties.params.currentBattery')}
          value={params.currentBattery}
          disabled={disabled}
          onChange={(currentBattery) => update({ ...params, currentBattery })}
        />
        <NumberField
          label={t('properties.params.chargeThreshold')}
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
        <NumberField
          label={t('properties.params.rows')}
          value={params.rows}
          disabled={disabled}
          onChange={(rows) => update({ ...params, rows })}
        />
        <NumberField
          label={t('properties.params.columns')}
          value={params.columns}
          disabled={disabled}
          onChange={(columns) => update({ ...params, columns })}
        />
        <NumberField
          label={t('properties.params.levels')}
          value={params.levels}
          disabled={disabled}
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
          disabled={disabled}
          onChange={(horizontalSpeed) => update({ ...params, horizontalSpeed })}
        />
        <NumberField
          label={t('properties.params.verticalSpeed')}
          value={params.verticalSpeed}
          disabled={disabled}
          onChange={(verticalSpeed) => update({ ...params, verticalSpeed })}
        />
        <NumberField
          label={t('properties.params.forkTime')}
          value={params.forkTime}
          disabled={disabled}
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
          disabled={disabled}
          onChange={(processTime) => update({ ...params, processTime })}
        />
        <NumberField
          label={t('properties.params.capacity')}
          value={params.capacity}
          disabled={disabled}
          onChange={(capacity) => update({ ...params, capacity })}
        />
      </>
    )
  }
  return <div className="panel-hint">{t('properties.params.none')}</div>
}

function EdgeFields({ edge, disabled }: { edge: ProjectEdge; disabled: boolean }) {
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
        disabled={disabled}
        onChange={(distance) => updateEdge({ distance })}
      />
      <NumberField
        label={t('properties.params.edgeMaxSpeed')}
        value={edge.maxSpeed}
        disabled={disabled}
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
  const simStatus = useSimulationStore((state) => state.status)
  const editable = isModelEditable(simStatus)
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
    <aside className={`panel property-panel${editable ? '' : ' property-panel-locked'}`}>
      <div className="panel-title">{t('properties.title')}</div>
      {!editable && (
        <div className="panel-hint">{t('properties.locked', { defaultValue: '仿真运行中，模型只读' })}</div>
      )}
      {!selectedId && <div className="panel-hint">{t('properties.empty')}</div>}
      {selectedKind === 'device' && device && (
        <div className="prop-form">
          <div className="panel-title panel-title-sub">{t('properties.general')}</div>
          <label className="prop-field">
            <span>{t('properties.name')}</span>
            <Input
              size="small"
              value={device.name}
              disabled={!editable}
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
          <ParamFields device={device} disabled={!editable} />
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
      {selectedKind === 'edge' && edge && <EdgeFields edge={edge} disabled={!editable} />}
    </aside>
  )
}
