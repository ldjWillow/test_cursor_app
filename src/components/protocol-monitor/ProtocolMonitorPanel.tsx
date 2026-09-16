import { Button, Input, Select, Space, Table, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { protocolMonitor } from '../../industrial/ProtocolMonitor.ts'
import { ProtocolType } from '../../industrial/types.ts'
import { runFullIntegrationDemo } from '../../industrial/demos/fullIntegrationDemo.ts'
import { runPlcConveyorDemo } from '../../industrial/demos/plcDemos.ts'
import { runModbusConveyorDemo, runMqttAgvDemo } from '../../industrial/demos/modbusMqttDemos.ts'
import { auditLog } from '../../industrial/AuditLog.ts'

export default function ProtocolMonitorPanel() {
  const [protocol, setProtocol] = useState<string>()
  const [direction, setDirection] = useState<string>()
  const [result, setResult] = useState<string>()
  const [search, setSearch] = useState('')
  const [tick, setTick] = useState(0)
  const [demoLog, setDemoLog] = useState<string[]>([])

  const rows = useMemo(() => {
    void tick
    return protocolMonitor.list({
      protocol: protocol as (typeof ProtocolType)[keyof typeof ProtocolType] | undefined,
      direction: direction as 'TX' | 'RX' | undefined,
      result: result as 'OK' | 'ERROR' | 'TIMEOUT' | 'DROPPED' | undefined,
      search: search || undefined,
    })
  }, [protocol, direction, result, search, tick])

  const audits = useMemo(() => {
    void tick
    return auditLog.list(50)
  }, [tick])

  return (
    <div className="industrial-panel">
      <div className="panel-title">Protocol Monitor</div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Select
          allowClear
          size="small"
          placeholder="Protocol"
          style={{ width: 140 }}
          value={protocol}
          onChange={setProtocol}
          options={Object.values(ProtocolType).map((value) => ({ value, label: value }))}
        />
        <Select
          allowClear
          size="small"
          placeholder="Direction"
          style={{ width: 100 }}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'TX', label: 'TX' },
            { value: 'RX', label: 'RX' },
          ]}
        />
        <Select
          allowClear
          size="small"
          placeholder="Result"
          style={{ width: 120 }}
          value={result}
          onChange={setResult}
          options={['OK', 'ERROR', 'TIMEOUT', 'DROPPED'].map((value) => ({ value, label: value }))}
        />
        <Input
          size="small"
          placeholder="Address / Topic"
          style={{ width: 180 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="small" onClick={() => setTick((v) => v + 1)}>
          Refresh
        </Button>
        <Button
          size="small"
          onClick={() => {
            protocolMonitor.clear()
            setTick((v) => v + 1)
          }}
        >
          Clear
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={async () => {
            const { steps, ok } = await runFullIntegrationDemo()
            setDemoLog(steps.map((s) => `${s.time}ms ${s.event}${s.detail ? ` — ${s.detail}` : ''}`))
            setTick((v) => v + 1)
            if (!ok) {
              setDemoLog((prev) => [...prev, 'Demo finished with warnings'])
            }
          }}
        >
          Run Full PLC/WCS/ACS Demo
        </Button>
        <Button
          size="small"
          onClick={async () => {
            const steps = await runPlcConveyorDemo()
            setDemoLog(steps.map((s) => `${s.event}`))
            setTick((v) => v + 1)
          }}
        >
          PLC Conveyor
        </Button>
        <Button
          size="small"
          onClick={async () => {
            const steps = await runModbusConveyorDemo()
            setDemoLog(steps.map((s) => `${s.event}`))
            setTick((v) => v + 1)
          }}
        >
          Modbus Demo
        </Button>
        <Button
          size="small"
          onClick={async () => {
            const steps = await runMqttAgvDemo()
            setDemoLog(steps.map((s) => `${s.event}`))
            setTick((v) => v + 1)
          }}
        >
          MQTT AGV
        </Button>
      </Space>

      <Table
        size="small"
        rowKey="id"
        pagination={{ pageSize: 40 }}
        virtual
        scroll={{ y: 300 }}
        dataSource={rows}
        columns={[
          {
            title: 'Time',
            dataIndex: 'time',
            width: 150,
            render: (t: number) => new Date(t).toISOString().slice(11, 23),
          },
          { title: 'Protocol', dataIndex: 'protocol', width: 110 },
          { title: 'Dir', dataIndex: 'direction', width: 60 },
          { title: 'Address / Topic', dataIndex: 'address' },
          {
            title: 'Value',
            dataIndex: 'value',
            width: 180,
            render: (v: unknown) => {
              const text = typeof v === 'string' ? v : JSON.stringify(v)
              return text.length > 80 ? `${text.slice(0, 80)}…` : text
            },
          },
          { title: 'Latency', dataIndex: 'latencyMs', width: 80 },
          {
            title: 'Result',
            dataIndex: 'result',
            width: 90,
            render: (r: string) => (
              <Tag color={r === 'OK' ? 'green' : r === 'DROPPED' ? 'orange' : 'red'}>{r}</Tag>
            ),
          },
        ]}
      />

      {demoLog.length > 0 && (
        <div className="demo-log">
          <div className="panel-title">Demo Timeline</div>
          <pre>{demoLog.join('\n')}</pre>
        </div>
      )}

      <div className="panel-title" style={{ marginTop: 8 }}>
        Audit Log
      </div>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={audits}
        columns={[
          {
            title: 'Time',
            dataIndex: 'time',
            width: 150,
            render: (t: number) => new Date(t).toLocaleTimeString(),
          },
          { title: 'Action', dataIndex: 'action' },
          { title: 'Actor', dataIndex: 'actor', width: 100 },
          { title: 'Target', dataIndex: 'target', width: 140 },
          { title: 'Detail', dataIndex: 'detail' },
        ]}
      />
    </div>
  )
}
