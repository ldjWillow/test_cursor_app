import { Button, InputNumber, Select, Table, Tabs, Tooltip } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { DeviceType } from '../../types/index.ts'
import { round } from '../../utils/math.ts'
import {
  formatPercent,
  formatSeconds,
  formatThroughput,
} from '../../utils/formatters.ts'
import { agvStatusLabel, eventTypeLabel, translateBottleneckReason } from '../../i18n/statusLabels.ts'

function Metric({ label, value, tip }: { label: string; value: string; tip?: string }) {
  const content = (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
  return tip ? <Tooltip title={tip}>{content}</Tooltip> : content
}

function ExperimentCharts() {
  const { t } = useTranslation()
  const summaries = useSimulationStore((state) => state.experimentSummaries)
  const deltas = useSimulationStore((state) => state.scenarioDeltas)
  const ordered = useMemo(
    () => [...summaries].sort((a, b) => a.agvCount - b.agvCount),
    [summaries],
  )

  if (ordered.length === 0) {
    return <div className="panel-hint">{t('simPanel.experiment.emptyCharts')}</div>
  }

  const categories = ordered.map((item) => String(item.agvCount))
  const throughput = ordered.map((item) => round(item.throughput.mean, 2))
  const waiting = ordered.map((item) => round(item.averageWaitingTime.mean, 2))
  const util = ordered.map((item) => round(item.agvUtilization.mean * 100, 2))

  const seriesNames = [
    t('chart.series.throughput'),
    t('chart.series.avgWait'),
    t('chart.series.agvUtil'),
  ]

  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: '#c5d0de' },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string; seriesName: string; data: number }>) => {
        const count = params[0]?.axisValue ?? ''
        const lines = [t('chart.tooltip.scenario', { count })]
        for (const item of params) {
          if (item.seriesName === seriesNames[0]) {
            lines.push(t('chart.tooltip.throughput', { value: item.data }))
          } else if (item.seriesName === seriesNames[1]) {
            lines.push(t('chart.tooltip.avgWait', { value: item.data }))
          } else {
            lines.push(t('chart.tooltip.util', { value: item.data }))
          }
        }
        return lines.join('<br/>')
      },
    },
    legend: { data: seriesNames, textStyle: { color: '#9aa8bd' } },
    grid: { left: 56, right: 24, top: 36, bottom: 36 },
    xAxis: {
      type: 'category',
      name: t('chart.axis.agvCount'),
      data: categories,
      axisLabel: { color: '#9aa8bd' },
      nameTextStyle: { color: '#9aa8bd' },
    },
    yAxis: { type: 'value', axisLabel: { color: '#9aa8bd' }, splitLine: { lineStyle: { color: '#2a3545' } } },
    series: [
      { name: seriesNames[0], type: 'line', data: throughput },
      { name: seriesNames[1], type: 'line', data: waiting },
      { name: seriesNames[2], type: 'line', data: util },
    ],
  }

  return (
    <div className="experiment-charts">
      <ReactECharts option={option} style={{ height: 220 }} />
      <div className="delta-list">
        {deltas.map((delta) => (
          <div key={`${delta.fromScenarioId}-${delta.toScenarioId}`} className="delta-item">
            <strong>{t('chart.delta.agvChange', { from: delta.fromAgvCount, to: delta.toAgvCount })}</strong>
            <span className={delta.throughputDeltaPct >= 0 ? 'delta-up' : 'delta-down'}>
              {t('chart.delta.throughput')} {delta.throughputDeltaPct >= 0 ? '+' : ''}
              {round(delta.throughputDeltaPct, 1)}%
            </span>
            <span className={delta.averageWaitingDeltaPct <= 0 ? 'delta-up' : 'delta-down'}>
              {t('chart.delta.avgWait')} {delta.averageWaitingDeltaPct >= 0 ? '+' : ''}
              {round(delta.averageWaitingDeltaPct, 1)}%
            </span>
            <span>
              {t('chart.delta.agvUtil')} {delta.agvUtilizationDeltaPct >= 0 ? '+' : ''}
              {round(delta.agvUtilizationDeltaPct, 1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventLogPanel() {
  const { t } = useTranslation()
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
          placeholder={t('simPanel.log.filterEntity')}
          style={{ width: 180 }}
          value={selectedLogEntity}
          options={entities.map((id) => ({ value: id, label: id }))}
          onChange={(value) => setSelectedLogEntity(value)}
        />
        <span className="panel-hint">{t('simPanel.log.count', { count: filtered.length })}</span>
      </div>
      <div className="event-list log-scroll">
        {filtered.length === 0 && <div className="panel-hint">{t('simPanel.log.empty')}</div>}
        {filtered.slice(-40).map((entry) => (
          <div key={entry.id}>
            t={entry.simulationTime.toFixed(2)} [{eventTypeLabel(entry.eventType, t)}] {entry.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelinePanel() {
  const { t } = useTranslation()
  const snapshot = useSimulationStore((state) => state.snapshot)
  const selectedId = useProjectStore((state) => state.selectedId)
  const agv = snapshot.devices.find(
    (device) => device.id === selectedId && device.type === DeviceType.Agv,
  )
  if (!agv) {
    return <div className="panel-hint">{t('simPanel.timeline.emptySelection')}</div>
  }
  const segments = agv.timeline ?? []
  return (
    <div>
      <div className="panel-title">{agv.name}</div>
      <div className="event-list log-scroll">
        {segments.length === 0 && <div className="panel-hint">{t('simPanel.timeline.empty')}</div>}
        {segments.map((segment, index) => (
          <div key={`${segment.status}-${segment.startTime}-${index}`}>
            {segment.startTime.toFixed(1)}-{segment.endTime.toFixed(1)} {agvStatusLabel(segment.status, t)}
          </div>
        ))}
      </div>
      {snapshot.statistics.agvKpis
        .filter((kpi) => kpi.id === agv.id)
        .map((kpi) => (
          <div key={kpi.id} className="agv-kpi">
            <div>
              {t('simPanel.timeline.travel')}: {round(kpi.travelDistance, 1)} m
            </div>
            <div>
              {t('simPanel.timeline.loaded')}: {round(kpi.loadedTravelDistance, 1)} m
            </div>
            <div>
              {t('simPanel.timeline.emptyDist')}: {round(kpi.emptyTravelDistance, 1)} m
            </div>
            <div>
              {t('simPanel.timeline.emptyRate')}: {formatPercent(kpi.emptyTravelRatio)}
            </div>
            <div>
              {t('simPanel.timeline.routeWait')}: {formatSeconds(kpi.routeWaitingTime)}
            </div>
            <div>
              {t('simPanel.timeline.util')}: {formatPercent(kpi.utilization)}
            </div>
          </div>
        ))}
    </div>
  )
}

export default function SimulationPanel() {
  const { t } = useTranslation()
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
      <div className="sim-panel-header">
        <div className="panel-title">{t('simPanel.title')}</div>
      </div>
      <div className="sim-metrics">
        <Metric label={t('kpi.simulationTime')} value={formatSeconds(snapshot.time, 2)} />
        <Metric label={t('kpi.waitingTasks')} value={String(snapshot.waitingTasks)} />
        <Metric label={t('kpi.runningTasks')} value={String(snapshot.runningTasks)} />
        <Metric label={t('kpi.completedTasks')} value={String(snapshot.completedTasks)} />
        <Metric
          label={t('kpi.throughput')}
          value={formatThroughput(stats.throughput)}
          tip={t('tooltip.throughput')}
        />
        <Metric label={t('kpi.avgWait')} value={formatSeconds(stats.averageWaitingTime, 2)} />
        <Metric
          label={t('kpi.routeWait')}
          value={formatSeconds(stats.routeWaitingTime, 2)}
          tip={t('tooltip.routeWait')}
        />
        <Metric
          label={t('kpi.emptyTravel')}
          value={formatPercent(stats.emptyTravelRatio)}
          tip={t('tooltip.emptyTravel')}
        />
        <Metric
          label={t('kpi.agvUtil')}
          value={formatPercent(stats.agvUtilization)}
          tip={t('tooltip.utilization')}
        />
        <Metric label={t('kpi.stackerUtil')} value={formatPercent(stats.stackerUtilization)} />
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'ops',
            label: t('simPanel.tabs.operations'),
            children: (
              <div className="sim-columns">
                <section>
                  <div className="panel-title">{t('simPanel.eventQueue')}</div>
                  <div className="event-list">
                    {snapshot.eventQueue.length === 0 && (
                      <div className="panel-hint">{t('simPanel.eventQueueEmpty')}</div>
                    )}
                    {snapshot.eventQueue.slice(0, 8).map((event) => (
                      <div key={event.id}>
                        t={event.time.toFixed(2)} {eventTypeLabel(event.type, t)}
                        {event.targetId ? ` @ ${event.targetId}` : ''}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="panel-title">{t('simPanel.bottlenecks')}</div>
                  {stats.bottlenecks.length === 0 && (
                    <div className="panel-hint">{t('simPanel.bottlenecksNone')}</div>
                  )}
                  {stats.bottlenecks.map((item) => (
                    <div key={`${item.id}-${item.reason}`}>
                      {item.name}: {translateBottleneckReason(item.reason, t)}
                    </div>
                  ))}
                  <div className="panel-title" style={{ marginTop: 8 }}>
                    {t('simPanel.waitingBreakdown')}
                  </div>
                  <div className="event-list">
                    <div>
                      {t('simPanel.waiting.task')}: {formatSeconds(stats.waiting.taskWaitingTime)}
                    </div>
                    <div>
                      {t('simPanel.waiting.route')}: {formatSeconds(stats.waiting.routeWaitingTime)}
                    </div>
                    <div>
                      {t('simPanel.waiting.resource')}: {formatSeconds(stats.waiting.resourceWaitingTime)}
                    </div>
                    <div>
                      {t('simPanel.waiting.loading')}: {formatSeconds(stats.waiting.loadingWaitingTime)}
                    </div>
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
                  <div className="panel-title">{t('simPanel.transportTasks')}</div>
                  <div className="task-config">
                    <Select
                      size="small"
                      placeholder={t('simPanel.pickup')}
                      options={options}
                      value={sourceId}
                      onChange={setSourceId}
                      style={{ minWidth: 120 }}
                    />
                    <Select
                      size="small"
                      placeholder={t('simPanel.dropoff')}
                      options={options}
                      value={targetId}
                      onChange={setTargetId}
                      style={{ minWidth: 120 }}
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
                      {t('simPanel.applyTasks')}
                    </Button>
                    <span className="panel-hint">
                      {t('simPanel.tasksInModel', { count: document.tasks.length })}
                    </span>
                  </div>
                </section>

                <section className="comparison-section">
                  <div className="panel-title">{t('simPanel.agvComparison')}</div>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="agvCount"
                    dataSource={comparison}
                    locale={{ emptyText: t('empty.data') }}
                    columns={[
                      { title: t('simPanel.comparison.agvs'), dataIndex: 'agvCount', width: 72 },
                      {
                        title: t('simPanel.comparison.throughput'),
                        dataIndex: 'throughput',
                        render: (value: number) => formatThroughput(value),
                      },
                      {
                        title: t('simPanel.comparison.util'),
                        dataIndex: 'utilization',
                        render: (value: number) => formatPercent(value),
                      },
                      {
                        title: t('simPanel.comparison.avgWait'),
                        dataIndex: 'averageWaitingTime',
                        render: (value: number) => formatSeconds(value, 2),
                      },
                      {
                        title: t('simPanel.comparison.routeWait'),
                        dataIndex: 'routeWaitingTime',
                        render: (value?: number) => formatSeconds(value ?? 0),
                      },
                      {
                        title: t('simPanel.comparison.empty'),
                        dataIndex: 'emptyTravelRatio',
                        render: (value?: number) => formatPercent(value ?? 0),
                      },
                      {
                        title: t('simPanel.comparison.cycle'),
                        dataIndex: 'averageCycleTime',
                        render: (value: number) => formatSeconds(value, 2),
                      },
                    ]}
                  />
                </section>
              </div>
            ),
          },
          {
            key: 'experiment',
            label: t('simPanel.tabs.experiment'),
            children: (
              <div className="experiment-layout">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="scenarioId"
                  dataSource={experimentSummaries}
                  locale={{ emptyText: t('empty.experiment') }}
                  columns={[
                    { title: t('simPanel.experiment.scenario'), dataIndex: 'scenarioName' },
                    { title: t('simPanel.experiment.agv'), dataIndex: 'agvCount', width: 80 },
                    {
                      title: t('simPanel.experiment.throughput'),
                      render: (_, row) =>
                        `${round(row.throughput.mean, 1)} ± ${round(row.throughput.std, 1)}`,
                    },
                    {
                      title: t('simPanel.experiment.avgWait'),
                      render: (_, row) => formatSeconds(row.averageWaitingTime.mean),
                    },
                    {
                      title: t('simPanel.experiment.cycle'),
                      render: (_, row) => formatSeconds(row.averageCycleTime.mean),
                    },
                    {
                      title: t('simPanel.experiment.agvUtil'),
                      render: (_, row) => formatPercent(row.agvUtilization.mean),
                    },
                    {
                      title: t('simPanel.experiment.completed'),
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
            label: t('simPanel.tabs.eventLog'),
            children: <EventLogPanel />,
          },
          {
            key: 'timeline',
            label: t('simPanel.tabs.agvTimeline'),
            children: <TimelinePanel />,
          },
        ]}
      />
    </footer>
  )
}
