import { Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSimulationStore } from '../../store/simulationStore.ts'
import {
  formatPercent,
  formatSeconds,
  formatThroughput,
} from '../../utils/formatters.ts'
import { simulationStatusLabel } from '../../i18n/statusLabels.ts'

function KpiCard({ label, value, tip }: { label: string; value: string; tip?: string }) {
  const content = (
    <div className="overview-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
  return tip ? <Tooltip title={tip}>{content}</Tooltip> : content
}

export default function OverviewPanel() {
  const { t } = useTranslation()
  const snapshot = useSimulationStore((state) => state.snapshot)
  const stats = snapshot.statistics

  return (
    <div className="module-panel overview-panel">
      <div className="panel-title">{t('nav.dashboard')}</div>
      <div className="overview-kpi-grid">
        <KpiCard label={t('kpi.simulationTime')} value={formatSeconds(snapshot.time)} />
        <KpiCard
          label={t('overview.status', { defaultValue: '仿真状态' })}
          value={simulationStatusLabel(snapshot.status, t)}
        />
        <KpiCard label={t('kpi.waitingTasks')} value={String(snapshot.waitingTasks)} />
        <KpiCard label={t('kpi.runningTasks')} value={String(snapshot.runningTasks)} />
        <KpiCard label={t('kpi.completedTasks')} value={String(snapshot.completedTasks)} />
        <KpiCard label={t('kpi.failedTasks')} value={String(snapshot.failedTasks)} />
        <KpiCard
          label={t('kpi.throughput')}
          value={formatThroughput(stats.throughput)}
          tip={t('tooltip.throughput')}
        />
        <KpiCard label={t('kpi.avgWait')} value={formatSeconds(stats.averageWaitingTime)} />
        <KpiCard label={t('kpi.avgCycle')} value={formatSeconds(stats.averageCycleTime)} />
        <KpiCard
          label={t('kpi.agvUtil')}
          value={formatPercent(stats.agvUtilization)}
          tip={t('tooltip.utilization')}
        />
        <KpiCard
          label={t('kpi.emptyTravel')}
          value={formatPercent(stats.emptyTravelRatio)}
          tip={t('tooltip.emptyTravel')}
        />
        <KpiCard
          label={t('kpi.routeWait')}
          value={formatSeconds(stats.routeWaitingTime)}
          tip={t('tooltip.routeWait')}
        />
      </div>
    </div>
  )
}
