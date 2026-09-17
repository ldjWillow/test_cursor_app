import ReactECharts from 'echarts-for-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { round } from '../../utils/math.ts'

export default function ExperimentCharts() {
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
