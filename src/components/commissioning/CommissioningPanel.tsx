import { Button, Select, Table, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { faultManager } from '../../virtual/FaultManager.ts'
import { refreshCommissioning, useCommissioningStore } from '../../store/commissioningStore.ts'
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

type ActionKey = 'assign' | 'fault' | 'startConveyor' | 'stopConveyor'

export default function CommissioningPanel() {
  const { t } = useTranslation()
  const operatingMode = useDigitalTwinStore((state) => state.operatingMode)
  const setOperatingMode = useDigitalTwinStore((state) => state.setOperatingMode)
  const twin = useDigitalTwinStore((state) => state.twin)
  const document = useProjectStore((state) => state.document)
  const [selectedAgv, setSelectedAgv] = useState<string>()
  const [actionBusy, setActionBusy] = useState<ActionKey | null>(null)
  const snapshot = useSimulationStore((state) => state.snapshot)

  const devices = useCommissioningStore((state) => state.devices)
  const commands = useCommissioningStore((state) => state.commands)
  const faults = useCommissioningStore((state) => state.faults)
  const signals = useCommissioningStore((state) => state.signals)
  const pendingCommandIds = useCommissioningStore((state) => state.pendingCommandIds)
  const markCommandPending = useCommissioningStore((state) => state.markCommandPending)
  const clearPending = useCommissioningStore((state) => state.clearPending)
  const revision = useCommissioningStore((state) => state.revision)

  const agvOptions = useMemo(
    () =>
      document.devices
        .filter((device) => device.type === 'agv')
        .map((device) => ({ value: device.id, label: device.name })),
    [document.devices],
  )

  const runAction = async (key: ActionKey, action: () => Promise<void> | void) => {
    setActionBusy(key)
    try {
      await action()
    } finally {
      refreshCommissioning()
      setActionBusy(null)
    }
  }

  return (
    <div className="commissioning-panel" data-revision={revision}>
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
        <span className="panel-hint">{t('commissioning.devicesOnline', { count: devices.length })}</span>
      </div>

      <div className="vc-grid">
        <section>
          <div className="panel-title">{t('commissioning.deviceStatus')}</div>
          <Table
            size="small"
            pagination={false}
            rowKey="deviceId"
            dataSource={devices}
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
              loading={actionBusy === 'assign'}
              disabled={!selectedAgv || operatingMode === 'replay' || actionBusy !== null}
              onClick={() => {
                if (!selectedAgv) {
                  return
                }
                void runAction('assign', async () => {
                  const commandId = nextId('wcs-cmd')
                  markCommandPending(commandId)
                  try {
                    const sourceId = document.simulationConfig.taskSourceId ?? 'in-1'
                    const targetId = document.simulationConfig.taskTargetId ?? 'out-1'
                    await deviceRegistry.sendCommand({
                      commandId,
                      deviceId: selectedAgv,
                      commandType: 'ASSIGN_TASK',
                      parameters: {
                        taskId: nextId('wcs-task'),
                        sourceId,
                        targetId,
                      },
                    })
                  } finally {
                    clearPending(commandId)
                  }
                })
              }}
            >
              {t('commissioning.assignTask')}
            </Button>
            <Button
              size="small"
              danger
              loading={actionBusy === 'fault'}
              disabled={!selectedAgv || actionBusy !== null}
              onClick={() => {
                if (!selectedAgv) {
                  return
                }
                void runAction('fault', () => {
                  faultManager.injectNow(
                    selectedAgv,
                    'FAULT',
                    t('commissioning.faultInjected', { id: selectedAgv }),
                  )
                  const device = deviceRegistry.get(selectedAgv) as { injectFault?: () => void } | undefined
                  device?.injectFault?.()
                })
              }}
            >
              {t('commissioning.injectFault')}
            </Button>
            <Button
              size="small"
              loading={actionBusy === 'startConveyor'}
              disabled={actionBusy !== null}
              onClick={() => {
                void runAction('startConveyor', async () => {
                  const conveyor = document.devices.find((device) => device.type === 'conveyor')
                  if (!conveyor) {
                    return
                  }
                  const commandId = nextId('wcs-cmd')
                  markCommandPending(commandId)
                  try {
                    await deviceRegistry.sendCommand({
                      commandId,
                      deviceId: conveyor.id,
                      commandType: 'START',
                    })
                  } finally {
                    clearPending(commandId)
                  }
                })
              }}
            >
              {t('commissioning.startConveyor')}
            </Button>
            <Button
              size="small"
              loading={actionBusy === 'stopConveyor'}
              disabled={actionBusy !== null}
              onClick={() => {
                void runAction('stopConveyor', async () => {
                  const conveyor = document.devices.find((device) => device.type === 'conveyor')
                  if (!conveyor) {
                    return
                  }
                  const commandId = nextId('wcs-cmd')
                  markCommandPending(commandId)
                  try {
                    await deviceRegistry.sendCommand({
                      commandId,
                      deviceId: conveyor.id,
                      commandType: 'STOP',
                    })
                  } finally {
                    clearPending(commandId)
                  }
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
            dataSource={commands.slice(0, 30)}
            locale={{ emptyText: t('empty.data') }}
            rowClassName={(row) => (pendingCommandIds.includes(row.commandId) ? 'pending-command' : '')}
            columns={[
              { title: t('commissioning.commandTable.cmd'), dataIndex: 'commandType', width: 120 },
              { title: t('commissioning.commandTable.device'), dataIndex: 'deviceId', width: 100 },
              {
                title: t('commissioning.commandTable.status'),
                dataIndex: 'status',
                width: 90,
                render: (value: string, row) =>
                  pendingCommandIds.includes(row.commandId)
                    ? t('status.command.pending', { defaultValue: '处理中' })
                    : commandStatusLabel(value, t),
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
