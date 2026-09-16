import { Button, Select, Space, Table, Tag, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { connectionManager } from '../../industrial/ConnectionManager.ts'
import { industrialRuntime } from '../../industrial/IndustrialRuntime.ts'
import { networkFaultInjector } from '../../industrial/NetworkFaultInjector.ts'
import { ProtocolType, ConnectionStatus, EnvironmentName } from '../../industrial/types.ts'
import type { ConnectionTestResult, ManagedConnectionLike } from './connectionTypes.ts'

type Row = {
  id: string
  name: string
  type: string
  status: string
  environment: string
  autoConnect: boolean
  permission: string
}

function toRows(): Row[] {
  return connectionManager.list().map((c) => ({
    id: c.config.id,
    name: c.config.name,
    type: c.config.type,
    status: c.status,
    environment: c.config.environment,
    autoConnect: c.config.autoConnect,
    permission: c.config.permission,
  }))
}

export default function ConnectionsPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<string>()
  const [testResult, setTestResult] = useState<ConnectionTestResult>()
  const [busy, setBusy] = useState(false)
  const [addType, setAddType] = useState<string>(ProtocolType.OPC_UA)

  const refresh = () => setRows(toRows())

  useEffect(() => {
    refresh()
    return connectionManager.onStatus(() => refresh())
  }, [])

  const statusColor = useMemo(
    () =>
      ({
        [ConnectionStatus.CONNECTED]: 'green',
        [ConnectionStatus.CONNECTING]: 'blue',
        [ConnectionStatus.RECONNECTING]: 'orange',
        [ConnectionStatus.DEGRADED]: 'gold',
        [ConnectionStatus.ERROR]: 'red',
        [ConnectionStatus.DISCONNECTED]: 'default',
      }) as Record<string, string>,
    [],
  )

  return (
    <div className="industrial-panel">
      <div className="panel-title">Connections</div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Select
          size="small"
          style={{ width: 140 }}
          value={addType}
          onChange={setAddType}
          options={Object.values(ProtocolType).map((value) => ({ value, label: value }))}
        />
        <Button
          size="small"
          type="primary"
          onClick={async () => {
            connectionManager.create({
              name: `${addType} Connection`,
              type: addType as typeof ProtocolType.OPC_UA,
              environment: EnvironmentName.Development,
              autoConnect: false,
              settings: { simulated: true },
            })
            refresh()
            message.success('Connection created (Auto Connect = false)')
          }}
        >
          Add Connection
        </Button>
        <Button
          size="small"
          onClick={async () => {
            setBusy(true)
            try {
              await industrialRuntime.ensureDemoConnections()
              refresh()
              message.success('Demo PLC/WCS/ACS connections ready')
            } finally {
              setBusy(false)
            }
          }}
          loading={busy}
        >
          Setup Demo Connections
        </Button>
        <Button
          size="small"
          danger
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            networkFaultInjector.configure(selected, { disconnect: true })
            message.warning('Fault: disconnect injected (Simulation Only)')
          }}
        >
          Inject Disconnect
        </Button>
        <Button
          size="small"
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            networkFaultInjector.clear(selected)
            message.info('Network fault cleared')
          }}
        >
          Clear Fault
        </Button>
      </Space>

      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={rows}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected] : [],
          onChange: (keys) => setSelected(String(keys[0] ?? '')),
        }}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Type', dataIndex: 'type', width: 120 },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 130,
            render: (value: string) => <Tag color={statusColor[value] ?? 'default'}>{value}</Tag>,
          },
          { title: 'Env', dataIndex: 'environment', width: 110 },
          {
            title: 'Auto',
            dataIndex: 'autoConnect',
            width: 70,
            render: (v: boolean) => (v ? 'ON' : 'OFF'),
          },
          { title: 'Perm', dataIndex: 'permission', width: 110 },
          {
            title: 'Actions',
            width: 260,
            render: (_: unknown, row: Row) => (
              <Space size={4}>
                <Button
                  size="small"
                  onClick={async () => {
                    await connectionManager.start(row.id)
                    refresh()
                  }}
                >
                  Connect
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    await connectionManager.stop(row.id)
                    refresh()
                  }}
                >
                  Disconnect
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    const result = await connectionManager.test(row.id)
                    setTestResult(result)
                    setSelected(row.id)
                    refresh()
                  }}
                >
                  Test
                </Button>
              </Space>
            ),
          },
        ]}
      />

      {testResult && (
        <div style={{ marginTop: 8 }}>
          <div className="panel-title">Connection Test {testResult.ok ? 'OK' : 'FAILED'}</div>
          <Table
            size="small"
            pagination={false}
            rowKey="stage"
            dataSource={testResult.stages}
            columns={[
              { title: 'Stage', dataIndex: 'stage', width: 140 },
              {
                title: 'Result',
                dataIndex: 'ok',
                width: 80,
                render: (ok: boolean) => <Tag color={ok ? 'green' : 'red'}>{ok ? 'OK' : 'FAIL'}</Tag>,
              },
              { title: 'Message', dataIndex: 'message' },
              { title: 'Latency', dataIndex: 'latencyMs', width: 90 },
            ]}
          />
        </div>
      )}
    </div>
  )
}

// local type alias to avoid circular imports in UI
export type { ManagedConnectionLike }
