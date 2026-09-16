import { Button, Input, Select, Space, Table, Tag, message } from 'antd'
import { useMemo, useState } from 'react'
import { signalRegistry } from '../../industrial/SignalRegistry.ts'
import { signalTrace } from '../../industrial/SignalTrace.ts'
import { signalMappingEngine } from '../../industrial/SignalMappingEngine.ts'
import { auditLog } from '../../industrial/AuditLog.ts'
import { industrialRuntime } from '../../industrial/IndustrialRuntime.ts'
import type { SignalDefinition } from '../../industrial/types.ts'
import ReactECharts from 'echarts-for-react'

type Tab = 'watch' | 'mapping' | 'trace' | 'graph'

export default function SignalsPanel() {
  const [tab, setTab] = useState<Tab>('watch')
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<string>()
  const [tick, setTick] = useState(0)
  const [graphIds, setGraphIds] = useState<string[]>([])

  const refresh = () => setTick((v) => v + 1)

  const signals = useMemo(() => {
    void tick
    return signalRegistry.list({
      search: search || undefined,
      direction: direction as SignalDefinition['direction'] | undefined,
    })
  }, [search, direction, tick])

  const mappings = useMemo(() => {
    void tick
    return signalMappingEngine.getMappings()
  }, [tick])

  const traces = useMemo(() => {
    void tick
    return signalTrace.list(undefined, 200)
  }, [tick])

  const graphOption = useMemo(() => {
    void tick
    const seriesMap = signalTrace.graphSeries(graphIds.slice(0, 10))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#9aa8bd' } },
      xAxis: { type: 'time', axisLabel: { color: '#9aa8bd' } },
      yAxis: { type: 'value', axisLabel: { color: '#9aa8bd' } },
      series: Object.entries(seriesMap).map(([id, points]) => ({
        name: id,
        type: 'line',
        showSymbol: false,
        data: points.map((p) => [p.t, typeof p.v === 'number' ? p.v : Number(p.v) || 0]),
      })),
    }
  }, [graphIds, tick])

  return (
    <div className="industrial-panel">
      <div className="panel-title">Signals / PLC Watch</div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Select
          size="small"
          value={tab}
          style={{ width: 140 }}
          onChange={setTab}
          options={[
            { value: 'watch', label: 'Watch Table' },
            { value: 'mapping', label: 'Mapping' },
            { value: 'trace', label: 'Trace' },
            { value: 'graph', label: 'Graph' },
          ]}
        />
        <Input
          size="small"
          placeholder="Search signal"
          style={{ width: 180 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          size="small"
          allowClear
          placeholder="Direction"
          style={{ width: 130 }}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'INPUT', label: 'INPUT' },
            { value: 'OUTPUT', label: 'OUTPUT' },
            { value: 'INTERNAL', label: 'INTERNAL' },
            { value: 'BIDIRECTIONAL', label: 'BIDIR' },
          ]}
        />
        <Button size="small" onClick={refresh}>
          Refresh
        </Button>
        <Button
          size="small"
          onClick={async () => {
            await industrialRuntime.syncDeviceFeedback()
            refresh()
          }}
        >
          Sync Devices
        </Button>
      </Space>

      {tab === 'watch' && (
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 50 }}
          virtual
          scroll={{ y: 360 }}
          dataSource={signals}
          columns={[
            {
              title: 'Pin',
              width: 50,
              render: (_: unknown, row: SignalDefinition) => (
                <Button
                  size="small"
                  type={row.pinned ? 'primary' : 'default'}
                  onClick={() => {
                    signalRegistry.setPinned(row.id, !row.pinned)
                    refresh()
                  }}
                >
                  {row.pinned ? '★' : '☆'}
                </Button>
              ),
            },
            { title: 'Signal', dataIndex: 'id' },
            { title: 'Type', dataIndex: 'type', width: 90 },
            { title: 'Dir', dataIndex: 'direction', width: 110 },
            {
              title: 'Value',
              dataIndex: 'value',
              width: 120,
              render: (v: unknown) => String(v),
            },
            {
              title: 'Quality',
              dataIndex: 'quality',
              width: 120,
              render: (q: string) => (
                <Tag color={q === 'GOOD' ? 'green' : q === 'DISCONNECTED' ? 'red' : 'orange'}>{q}</Tag>
              ),
            },
            {
              title: 'Time',
              dataIndex: 'timestamp',
              width: 160,
              render: (t: number) => new Date(t).toLocaleTimeString(),
            },
            { title: 'Source', dataIndex: 'source', width: 120 },
            {
              title: 'Force',
              width: 160,
              render: (_: unknown, row: SignalDefinition) => (
                <Space size={4}>
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      const next = typeof row.value === 'boolean' ? !row.value : true
                      signalRegistry.setValue(row.id, next, {
                        force: true,
                        source: 'Manual Force (Simulation Only)',
                      })
                      auditLog.record('MANUAL_FORCE', 'user', row.id, String(next))
                      message.warning('Force applied — Simulation Only')
                      refresh()
                    }}
                  >
                    Force
                  </Button>
                  {row.forced && (
                    <Button
                      size="small"
                      onClick={() => {
                        signalRegistry.clearForce(row.id)
                        refresh()
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {tab === 'mapping' && (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={mappings}
          columns={[
            { title: 'Signal', dataIndex: 'signalId' },
            { title: 'Connection', dataIndex: 'connectionId', width: 140 },
            { title: 'Address', dataIndex: 'address' },
            { title: 'Dir', dataIndex: 'direction', width: 110 },
            { title: 'Type', dataIndex: 'dataType', width: 90 },
            {
              title: 'Enabled',
              dataIndex: 'enabled',
              width: 90,
              render: (v: boolean, row) => (
                <Button
                  size="small"
                  onClick={() => {
                    signalMappingEngine.enable(row.id, !v)
                    auditLog.record('MAPPING_CHANGE', 'user', row.id, `enabled=${!v}`)
                    refresh()
                  }}
                >
                  {v ? 'ON' : 'OFF'}
                </Button>
              ),
            },
            {
              title: 'Scale',
              width: 80,
              render: (_: unknown, row) => row.scale ?? 1,
            },
          ]}
        />
      )}

      {tab === 'trace' && (
        <>
          <Button
            size="small"
            style={{ marginBottom: 8 }}
            onClick={() => {
              const csv = signalTrace.toCsv()
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'signal-trace.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export CSV
          </Button>
          <Table
            size="small"
            rowKey="id"
            pagination={{ pageSize: 40 }}
            dataSource={traces}
            columns={[
              {
                title: 'Time',
                dataIndex: 'time',
                width: 160,
                render: (t: number) => new Date(t).toISOString().slice(11, 23),
              },
              { title: 'Signal', dataIndex: 'signalName' },
              {
                title: 'Change',
                render: (_: unknown, row) => `${String(row.oldValue)} → ${String(row.newValue)}`,
              },
              { title: 'Source', dataIndex: 'source', width: 140 },
            ]}
          />
        </>
      )}

      {tab === 'graph' && (
        <>
          <Select
            mode="multiple"
            size="small"
            style={{ width: '100%', marginBottom: 8 }}
            placeholder="Select 1–10 signals"
            value={graphIds}
            onChange={(ids) => setGraphIds(ids.slice(0, 10))}
            options={signals.slice(0, 200).map((s) => ({ value: s.id, label: s.id }))}
          />
          <ReactECharts option={graphOption} style={{ height: 320 }} />
        </>
      )}
    </div>
  )
}
