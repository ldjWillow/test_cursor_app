import { Button, InputNumber, Select, Table, Tabs } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useMemo, useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { DeviceType } from '../../types/index.ts'
import { round } from '../../utils/math.ts'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ExperimentCharts() {
  const summaries = useSimulationStore((state) => state.experimentSummaries)
  const deltas = useSimulationStore((state) => state.scenarioDeltas)
  const ordered = useMemo(
    () => [...summaries].sort((a, b) => a.agvCount - b.agvCount),
    [summaries],
  )

  if (ordered.length === 0) {
    return <div className="panel-hint">Run Experiment to populate scenario comparison charts.</div>
  }

  const categories = ordered.map((item) => String(item.agvCount))
  const throughput = ordered.map((item) => round(item.throughput.mean, 2))
  const waiting = ordered.map((item) => round(item.averageWaitingTime.mean, 2))
  const util = ordered.map((item) => round(item.agvUtilization.mean * 100, 2))

  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: '#c5d0de' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['Throughput /h', 'Avg Wait s', 'AGV Util %'], textStyle: { color: '#9aa8bd' } },
    grid: { left: 48, right: 24, top: 36, bottom: 28 },
    xAxis: { type: 'category', name: 'AGV Count', data: categories, axisLabel: { color: '#9aa8bd' } },
    yAxis: { type: 'value', axisLabel: { color: '#9aa8bd' }, splitLine: { lineStyle: { color: '#2a3545' } } },
    series: [
      { name: 'Throughput /h', type: 'line', data: throughput },
      { name: 'Avg Wait s', type: 'line', data: waiting },
      { name: 'AGV Util %', type: 'line', data: util },
    ],
  }

  return (
    <div className="experiment-charts">
      <ReactECharts option={option} style={{ height: 220 }} />
      <div className="delta-list">
        {deltas.map((delta) => (
          <div key={`${delta.fromScenarioId}-${delta.toScenarioId}`} className="delta-item">
            <strong>
              {delta.fromAgvCount} → {delta.toAgvCount} AGV
            </strong>
            <span className={delta.throughputDeltaPct >= 0 ? 'delta-up' : 'delta-down'}>
              Throughput {delta.throughputDeltaPct >= 0 ? '+' : ''}
              {round(delta.throughputDeltaPct, 1)}%
            </span>
            <span className={delta.averageWaitingDeltaPct <= 0 ? 'delta-up' : 'delta-down'}>
              Avg Wait {delta.averageWaitingDeltaPct >= 0 ? '+' : ''}
              {round(delta.averageWaitingDeltaPct, 1)}%
            </span>
            <span>
              AGV Util {delta.agvUtilizationDeltaPct >= 0 ? '+' : ''}
              {round(delta.agvUtilizationDeltaPct, 1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventLogPanel() {
  const eventLog = useSimulationStore((state) => state.snapshot.eventLog)
  const selectedLogEntity = useSimulationStore((state) => state.selectedLogEntity)
  const setSelectedLogEntity = useSimulationStore((state) => state.setSelectedLogEntity)
  const entities = useMemo(() => {
    const ids = new Set(eventLog.map((entry) => entry.entityId))
    return [...ids]
  }, [eventLog])
  const filtered = selectedLogEntity
    ? eventLog.filter((entry) => entry.entityId === selectedLogEntity)
    : eventLog

  return (
    <div>
      <div className="task-config" style={{ marginBottom: 6 }}>
        <Select
          size="small"
          allowClear
          placeholder="Filter entity"
          style={{ width: 180 }}
          value={selectedLogEntity}
          options={entities.map((id) => ({ value: id, label: id }))}
          onChange={(value) => setSelectedLogEntity(value)}
        />
        <span className="panel-hint">{filtered.length} events</span>
      </div>
      <div className="event-list log-scroll">
        {filtered.length === 0 && <div className="panel-hint">No events yet</div>}
        {filtered.slice(-40).map((entry) => (
          <div key={entry.id}>
            t={entry.simulationTime.toFixed(2)} [{entry.eventType}] {entry.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelinePanel() {
  const snapshot = useSimulationStore((state) => state.snapshot)
  const selectedId = useProjectStore((state) => state.selectedId)
  const agv = snapshot.devices.find(
    (device) => device.id === selectedId && device.type === DeviceType.Agv,
  )
  if (!agv) {
    return <div className="panel-hint">Select an AGV to view its timeline.</div>
  }
  const segments = agv.timeline ?? []
  return (
    <div>
      <div className="panel-title">{agv.name}</div>
      <div className="event-list log-scroll">
        {segments.length === 0 && <div className="panel-hint">No timeline segments</div>}
        {segments.map((segment, index) => (
          <div key={`${segment.status}-${segment.startTime}-${index}`}>
            {segment.startTime.toFixed(1)}-{segment.endTime.toFixed(1)} {segment.status}
          </div>
        ))}
      </div>
      {snapshot.statistics.agvKpis
        .filter((kpi) => kpi.id === agv.id)
        .map((kpi) => (
          <div key={kpi.id} className="agv-kpi">
            <div>Travel: {round(kpi.travelDistance, 1)} m</div>
            <div>Loaded: {round(kpi.loadedTravelDistance, 1)} m</div>
            <div>Empty: {round(kpi.emptyTravelDistance, 1)} m</div>
            <div>Empty Rate: {round(kpi.emptyTravelRatio * 100, 1)}%</div>
            <div>Route Wait: {round(kpi.routeWaitingTime, 1)} s</div>
            <div>Util: {round(kpi.utilization * 100, 1)}%</div>
          </div>
        ))}
    </div>
  )
}

export default function SimulationPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot)
  const comparison = useSimulationStore((state) => state.comparison)
  const experimentSummaries = useSimulationStore((state) => state.experimentSummaries)
  const lastError = useSimulationStore((state) => state.lastError)
  const validationErrors = useSimulationStore((state) => state.validationErrors)
  const document = useProjectStore((state) => state.document)
  const replaceTasks = useProjectStore((state) => state.replaceTasks)
  const stations = document.devices.filter(
    (device) => device.type === DeviceType.Station || device.type === DeviceType.PathNode,
  )
  const [sourceId, setSourceId] = useState(document.simulationConfig.taskSourceId ?? stations[0]?.id)
  const [targetId, setTargetId] = useState(document.simulationConfig.taskTargetId ?? stations[1]?.id)
  const [taskCount, setTaskCount] = useState(document.simulationConfig.taskCount || 100)
  const stats = snapshot.statistics
  const options = useMemo(
    () => stations.map((station) => ({ value: station.id, label: station.name })),
    [stations],
  )

  return (
    <footer className="simulation-panel">
      <div className="sim-metrics">
        <Metric label="Simulation Time" value={`${round(snapshot.time, 2)} s`} />
        <Metric label="Waiting Tasks" value={String(snapshot.waitingTasks)} />
        <Metric label="Running Tasks" value={String(snapshot.runningTasks)} />
        <Metric label="Completed Tasks" value={String(snapshot.completedTasks)} />
        <Metric label="Throughput" value={`${round(stats.throughput, 2)} /h`} />
        <Metric label="Avg Wait" value={`${round(stats.averageWaitingTime, 2)} s`} />
        <Metric label="Route Wait" value={`${round(stats.routeWaitingTime, 2)} s`} />
        <Metric label="Empty Travel" value={`${round(stats.emptyTravelRatio * 100, 1)}%`} />
        <Metric label="AGV Util" value={`${round(stats.agvUtilization * 100, 1)}%`} />
        <Metric label="Stacker Util" value={`${round(stats.stackerUtilization * 100, 1)}%`} />
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'ops',
            label: 'Operations',
            children: (
              <div className="sim-columns">
                <section>
                  <div className="panel-title">Event Queue</div>
                  <div className="event-list">
                    {snapshot.eventQueue.length === 0 && <div className="panel-hint">Empty</div>}
                    {snapshot.eventQueue.slice(0, 8).map((event) => (
                      <div key={event.id}>
                        t={event.time.toFixed(2)} {event.type}
                        {event.targetId ? ` @ ${event.targetId}` : ''}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="panel-title">Bottlenecks</div>
                  {stats.bottlenecks.length === 0 && <div className="panel-hint">None</div>}
                  {stats.bottlenecks.map((item) => (
                    <div key={`${item.id}-${item.reason}`}>
                      {item.name}: {item.reason}
                    </div>
                  ))}
                  <div className="panel-title" style={{ marginTop: 8 }}>
                    Waiting breakdown
                  </div>
                  <div className="event-list">
                    <div>Task: {round(stats.waiting.taskWaitingTime, 1)} s</div>
                    <div>Route: {round(stats.waiting.routeWaitingTime, 1)} s</div>
                    <div>Resource: {round(stats.waiting.resourceWaitingTime, 1)} s</div>
                    <div>Loading: {round(stats.waiting.loadingWaitingTime, 1)} s</div>
                  </div>
                  {validationErrors.length > 0 && (
                    <div className="sim-error">
                      {validationErrors.map((error) => (
                        <div key={error}>{error}</div>
                      ))}
                    </div>
                  )}
                  {lastError && <div className="sim-error">{lastError}</div>}
                </section>

                <section>
                  <div className="panel-title">Transport Tasks</div>
                  <div className="task-config">
                    <Select
                      size="small"
                      placeholder="Pickup"
                      options={options}
                      value={sourceId}
                      onChange={setSourceId}
                      style={{ width: 120 }}
                    />
                    <Select
                      size="small"
                      placeholder="Dropoff"
                      options={options}
                      value={targetId}
                      onChange={setTargetId}
                      style={{ width: 120 }}
                    />
                    <InputNumber
                      size="small"
                      min={1}
                      max={5000}
                      value={taskCount}
                      onChange={(value) => setTaskCount(typeof value === 'number' ? value : 100)}
                    />
                    <Button
                      size="small"
                      disabled={!sourceId || !targetId}
                      onClick={() => {
                        if (sourceId && targetId) {
                          replaceTasks(sourceId, targetId, taskCount)
                        }
                      }}
                    >
                      Apply tasks
                    </Button>
                    <span className="panel-hint">{document.tasks.length} tasks in model</span>
                  </div>
                </section>

                <section className="comparison-section">
                  <div className="panel-title">AGV comparison</div>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="agvCount"
                    dataSource={comparison}
                    columns={[
                      { title: 'AGVs', dataIndex: 'agvCount', width: 60 },
                      {
                        title: 'Throughput /h',
                        dataIndex: 'throughput',
                        render: (value: number) => round(value, 1),
                      },
                      {
                        title: 'Util %',
                        dataIndex: 'utilization',
                        render: (value: number) => round(value * 100, 1),
                      },
                      {
                        title: 'Avg Wait s',
                        dataIndex: 'averageWaitingTime',
                        render: (value: number) => round(value, 2),
                      },
                      {
                        title: 'Route Wait',
                        dataIndex: 'routeWaitingTime',
                        render: (value?: number) => round(value ?? 0, 1),
                      },
                      {
                        title: 'Empty %',
                        dataIndex: 'emptyTravelRatio',
                        render: (value?: number) => round((value ?? 0) * 100, 1),
                      },
                      {
                        title: 'Cycle s',
                        dataIndex: 'averageCycleTime',
                        render: (value: number) => round(value, 2),
                      },
                    ]}
                  />
                </section>
              </div>
            ),
          },
          {
            key: 'experiment',
            label: 'Experiment Results',
            children: (
              <div className="experiment-layout">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="scenarioId"
                  dataSource={experimentSummaries}
                  columns={[
                    { title: 'Scenario', dataIndex: 'scenarioName' },
                    { title: 'AGV', dataIndex: 'agvCount', width: 70 },
                    {
                      title: 'Throughput',
                      render: (_, row) =>
                        `${round(row.throughput.mean, 1)} ± ${round(row.throughput.std, 1)}`,
                    },
                    {
                      title: 'Avg Wait',
                      render: (_, row) => round(row.averageWaitingTime.mean, 1),
                    },
                    {
                      title: 'Cycle',
                      render: (_, row) => round(row.averageCycleTime.mean, 1),
                    },
                    {
                      title: 'AGV Util',
                      render: (_, row) => `${round(row.agvUtilization.mean * 100, 1)}%`,
                    },
                    {
                      title: 'Completed',
                      render: (_, row) => round(row.completedTasks.mean, 0),
                    },
                  ]}
                />
                <ExperimentCharts />
              </div>
            ),
          },
          {
            key: 'log',
            label: 'Event Log',
            children: <EventLogPanel />,
          },
          {
            key: 'timeline',
            label: 'AGV Timeline',
            children: <TimelinePanel />,
          },
        ]}
      />
    </footer>
  )
}
