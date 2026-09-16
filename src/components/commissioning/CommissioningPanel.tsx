import { Button, Select, Table, Tag } from 'antd'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { faultManager } from '../../virtual/FaultManager.ts'
import { signalMapper } from '../../signal/SignalMapper.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { useMemo, useState } from 'react'
import { nextId } from '../../utils/id.ts'

export default function CommissioningPanel() {
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
      <div className="panel-title">Virtual Commissioning</div>
      <div className="task-config" style={{ marginBottom: 8 }}>
        <Select
          size="small"
          value={operatingMode}
          style={{ width: 140 }}
          options={[
            { value: 'simulation', label: 'Simulation' },
            { value: 'emulation', label: 'Emulation' },
            { value: 'replay', label: 'Replay' },
          ]}
          onChange={setOperatingMode}
        />
        <Tag color={operatingMode === 'emulation' ? 'blue' : 'default'}>
          {operatingMode.toUpperCase()}
        </Tag>
        <Tag>{twin.status.toUpperCase()}</Tag>
        <span className="panel-hint">Devices online: {deviceRows.length}</span>
      </div>

      <div className="vc-grid">
        <section>
          <div className="panel-title">Device Status</div>
          <Table
            size="small"
            pagination={false}
            rowKey="deviceId"
            dataSource={deviceRows}
            columns={[
              { title: 'Device', dataIndex: 'deviceId' },
              { title: 'Type', dataIndex: 'type', width: 90 },
              {
                title: 'State',
                dataIndex: 'state',
                render: (value: string, row) => (
                  <Tag color={row.fault ? 'red' : value === 'RUNNING' || value === 'MOVING' ? 'green' : 'default'}>
                    {value}
                  </Tag>
                ),
              },
            ]}
          />
        </section>

        <section>
          <div className="panel-title">WCS Actions</div>
          <div className="task-config">
            <Select
              size="small"
              placeholder="AGV"
              style={{ width: 140 }}
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
              WCS Assign Task
            </Button>
            <Button
              size="small"
              danger
              disabled={!selectedAgv}
              onClick={() => {
                if (!selectedAgv) {
                  return
                }
                faultManager.injectNow(selectedAgv, 'FAULT', `${selectedAgv} FAULT injected`)
                const device = deviceRegistry.get(selectedAgv) as { injectFault?: () => void } | undefined
                device?.injectFault?.()
              }}
            >
              Inject Fault
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
              START Conveyor
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
              STOP Conveyor
            </Button>
          </div>
          <div className="panel-title" style={{ marginTop: 8 }}>
            Active Faults
          </div>
          {faults.length === 0 && <div className="panel-hint">None</div>}
          {faults.map((fault) => (
            <div key={fault.id} className="sim-error">
              {fault.deviceId}: {fault.message}
            </div>
          ))}
        </section>

        <section>
          <div className="panel-title">Command Monitor</div>
          <Table
            size="small"
            pagination={false}
            rowKey="commandId"
            dataSource={commands}
            columns={[
              { title: 'Cmd', dataIndex: 'commandType', width: 110 },
              { title: 'Device', dataIndex: 'deviceId', width: 100 },
              { title: 'Status', dataIndex: 'status', width: 90 },
              { title: 'Latency', dataIndex: 'latencyMs', width: 70, render: (v: number) => `${v}ms` },
            ]}
          />
        </section>

        <section>
          <div className="panel-title">Signal Watch</div>
          <Table
            size="small"
            pagination={false}
            rowKey="signal"
            dataSource={signals}
            columns={[
              { title: 'Signal', dataIndex: 'signal' },
              {
                title: 'Value',
                dataIndex: 'value',
                render: (value: unknown) => String(value),
              },
              { title: 'Source', dataIndex: 'source' },
            ]}
          />
          <div className="panel-hint" style={{ marginTop: 6 }}>
            Twin devices: {Object.keys(twin.devices).length} · Event log: {snapshot.eventLog.length}
          </div>
        </section>
      </div>
    </div>
  )
}
