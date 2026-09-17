import { Button, Select, Table, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { faultManager } from '../../virtual/FaultManager.ts'
import { signalMapper } from '../../signal/SignalMapper.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { nextId } from '../../utils/id.ts'
import {
  commandStatusLabel,
  deviceStatusLabel,
  deviceTypeLabel,
  operatingModeLabel,
  simulationStatusLabel,
} from '../../i18n/statusLabels.ts'
import { formatLatencyMs } from '../../utils/formatters.ts'

export default function CommissioningPanel() {
  const { t } = useTranslation()
  const operatingMode = useDigitalTwinStore((state) => state.operatingMode)
  const setOperatingMode = useDigitalTwinStore((state) => state.setOperatingMode)
  const twin = useDigitalTwinStore((state) => state.twin)
  const document = useProjectStore((state) => state.document)
  const [selectedAgv, setSelectedAgv] = useState<string>()
  const [busy, setBusy] = useState(false)
  const snapshot = useSimulationStore((state) => state.snapshot)

  const agvOptions = useMemo(
    () =>
      document.devices
        .filter((device) => device.type === 'agv')
        .map((device) => ({ value: device.id, label: device.name })),
    [document.devices],
  )

  const deviceRows = deviceRegistry.list()
  const commands = deviceRegistry.commandLog.slice(-30).reverse()
  const signals = signalMapper.watchTable()
  const faults = faultManager.listActive()

  return (
    <div className="commissioning-panel">
      <div className="panel-title">{t('commissioning.title')}</div>
      <div className="task-config" style={{ marginBottom: 8 }}>
        <Select
          size="small"
          value={operatingMode}
          style={{ minWidth: 120 }}
          options={[
            { value: 'simulation', label: t('toolbar.modeSimulation') },
            { value: 'emulation', label: t('toolbar.modeEmulation') },
            { value: 'replay', label: t('toolbar.modeReplay') },
          ]}
          onChange={setOperatingMode}
        />
        <Tag color={operatingMode === 'emulation' ? 'blue' : 'default'}>
          {operatingModeLabel(operatingMode, t)}
        </Tag>
        <Tag>{simulationStatusLabel(twin.status, t)}</Tag>
        <span className="panel-hint">{t('commissioning.devicesOnline', { count: deviceRows.length })}</span>
      </div>

      <div className="vc-grid">
        <section>
          <div className="panel-title">{t('commissioning.deviceStatus')}</div>
          <Table
            size="small"
            pagination={false}
            rowKey="deviceId"
            dataSource={deviceRows}
            locale={{ emptyText: t('empty.data') }}
            columns={[
              { title: t('commissioning.deviceTable.device'), dataIndex: 'deviceId' },
              {
                title: t('commissioning.deviceTable.type'),
                dataIndex: 'type',
                width: 90,
                render: (value: string) => deviceTypeLabel(value, t),
              },
              {
                title: t('commissioning.deviceTable.state'),
                dataIndex: 'state',
                render: (value: string, row) => (
                  <Tag
                    color={
                      row.fault
                        ? 'red'
                        : value === 'RUNNING' || value === 'MOVING'
                          ? 'green'
                          : value === 'WAITING' || value === 'WAITING_FOR_ROUTE'
                            ? 'orange'
                            : 'default'
                    }
                  >
                    {deviceStatusLabel(value, t)}
                  </Tag>
                ),
              },
            ]}
          />
        </section>

        <section>
          <div className="panel-title">{t('commissioning.wcsActions')}</div>
          <div className="task-config">
            <Select
              size="small"
              placeholder={t('commissioning.placeholderAgv')}
              style={{ minWidth: 140 }}
              options={agvOptions}
              value={selectedAgv}
              onChange={setSelectedAgv}
            />
            <Button
              size="small"
              type="primary"
              loading={busy}
              disabled={!selectedAgv || operatingMode === 'replay'}
              onClick={async () => {
                if (!selectedAgv) {
                  return
                }
                setBusy(true)
                try {
                  const sourceId = document.simulationConfig.taskSourceId ?? 'in-1'
                  const targetId = document.simulationConfig.taskTargetId ?? 'out-1'
                  await deviceRegistry.sendCommand({
                    deviceId: selectedAgv,
                    commandType: 'ASSIGN_TASK',
                    parameters: {
                      taskId: nextId('wcs-task'),
                      sourceId,
                      targetId,
                    },
                  })
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('commissioning.assignTask')}
            </Button>
            <Button
              size="small"
              danger
              disabled={!selectedAgv}
              onClick={() => {
                if (!selectedAgv) {
                  return
                }
                faultManager.injectNow(
                  selectedAgv,
                  'FAULT',
                  t('commissioning.faultInjected', { id: selectedAgv }),
                )
                const device = deviceRegistry.get(selectedAgv) as { injectFault?: () => void } | undefined
                device?.injectFault?.()
              }}
            >
              {t('commissioning.injectFault')}
            </Button>
            <Button
              size="small"
              onClick={async () => {
                const conveyor = document.devices.find((device) => device.type === 'conveyor')
                if (!conveyor) {
                  return
                }
                await deviceRegistry.sendCommand({
                  deviceId: conveyor.id,
                  commandType: 'START',
                })
              }}
            >
              {t('commissioning.startConveyor')}
            </Button>
            <Button
              size="small"
              onClick={async () => {
                const conveyor = document.devices.find((device) => device.type === 'conveyor')
                if (!conveyor) {
                  return
                }
                await deviceRegistry.sendCommand({
                  deviceId: conveyor.id,
                  commandType: 'STOP',
                })
              }}
            >
              {t('commissioning.stopConveyor')}
            </Button>
          </div>
          <div className="panel-title" style={{ marginTop: 8 }}>
            {t('commissioning.activeFaults')}
          </div>
          {faults.length === 0 && <div className="panel-hint">{t('commissioning.faultsNone')}</div>}
          {faults.map((fault) => (
            <div key={fault.id} className="sim-error">
              {fault.deviceId}: {fault.message}
            </div>
          ))}
        </section>

        <section>
          <div className="panel-title">{t('commissioning.commandMonitor')}</div>
          <Table
            size="small"
            pagination={false}
            rowKey="commandId"
            dataSource={commands}
            locale={{ emptyText: t('empty.data') }}
            columns={[
              { title: t('commissioning.commandTable.cmd'), dataIndex: 'commandType', width: 120 },
              { title: t('commissioning.commandTable.device'), dataIndex: 'deviceId', width: 100 },
              {
                title: t('commissioning.commandTable.status'),
                dataIndex: 'status',
                width: 90,
                render: (value: string) => commandStatusLabel(value, t),
              },
              {
                title: t('commissioning.commandTable.latency'),
                dataIndex: 'latencyMs',
                width: 80,
                render: (v: number) => formatLatencyMs(v),
              },
            ]}
          />
        </section>

        <section>
          <div className="panel-title">{t('commissioning.signalWatch')}</div>
          <Table
            size="small"
            pagination={false}
            rowKey="signal"
            dataSource={signals}
            locale={{ emptyText: t('empty.signal') }}
            columns={[
              { title: t('commissioning.signalTable.signal'), dataIndex: 'signal' },
              {
                title: t('commissioning.signalTable.value'),
                dataIndex: 'value',
                render: (value: unknown) => String(value),
              },
              { title: t('commissioning.signalTable.source'), dataIndex: 'source' },
            ]}
          />
          <div className="panel-hint" style={{ marginTop: 6 }}>
            {t('commissioning.twinSummary', {
              devices: Object.keys(twin.devices).length,
              events: snapshot.eventLog.length,
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
