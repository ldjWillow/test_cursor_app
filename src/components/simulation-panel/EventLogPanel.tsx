import { useMemo, useState } from 'react'
import { Button, Input, InputNumber, Select, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { eventTypeLabel } from '../../i18n/statusLabels.ts'
import type { SimulationLogEntry } from '../../types/index.ts'

const PAGE_SIZE = 80
const DISPLAY_CAP = 2000

type LevelFilter = 'all' | 'task' | 'agv' | 'conveyor' | 'stacker' | 'system' | 'fault'

function classify(entry: SimulationLogEntry): LevelFilter {
  const type = entry.eventType.toUpperCase()
  if (type.includes('FAULT') || type.includes('ERROR')) {
    return 'fault'
  }
  if (type.includes('TASK')) {
    return 'task'
  }
  if (type.includes('AGV')) {
    return 'agv'
  }
  if (type.includes('CONVEYOR')) {
    return 'conveyor'
  }
  if (type.includes('STACKER')) {
    return 'stacker'
  }
  return 'system'
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function EventLogPanel() {
  const { t } = useTranslation()
  const eventLog = useSimulationStore((state) => state.snapshot.eventLog)
  const clearEventLog = useSimulationStore((state) => state.clearEventLog)
  const [entity, setEntity] = useState<string>()
  const [level, setLevel] = useState<LevelFilter>('all')
  const [eventType, setEventType] = useState<string>()
  const [keyword, setKeyword] = useState('')
  const [timeMin, setTimeMin] = useState<number | null>(null)
  const [timeMax, setTimeMax] = useState<number | null>(null)
  const [page, setPage] = useState(0)

  const entities = useMemo(() => [...new Set(eventLog.map((entry) => entry.entityId))], [eventLog])
  const eventTypes = useMemo(() => [...new Set(eventLog.map((entry) => entry.eventType))], [eventLog])

  const filtered = useMemo(() => {
    const keywordLower = keyword.trim().toLowerCase()
    return eventLog.filter((entry) => {
      if (entity && entry.entityId !== entity) {
        return false
      }
      if (eventType && entry.eventType !== eventType) {
        return false
      }
      if (level !== 'all' && classify(entry) !== level) {
        return false
      }
      if (timeMin !== null && entry.simulationTime < timeMin) {
        return false
      }
      if (timeMax !== null && entry.simulationTime > timeMax) {
        return false
      }
      if (keywordLower) {
        const hay = `${entry.message} ${entry.eventType} ${entry.entityId}`.toLowerCase()
        if (!hay.includes(keywordLower)) {
          return false
        }
      }
      return true
    })
  }, [eventLog, entity, eventType, level, keyword, timeMin, timeMax])

  const capped = filtered.length > DISPLAY_CAP ? filtered.slice(filtered.length - DISPLAY_CAP) : filtered
  const pageCount = Math.max(1, Math.ceil(capped.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = capped.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const exportJson = () => {
    downloadBlob(`event-log-${Date.now()}.json`, JSON.stringify(filtered, null, 2), 'application/json')
  }

  const exportCsv = () => {
    const header = 'time,entityId,entityType,eventType,message'
    const lines = filtered.map((entry) =>
      [entry.simulationTime, entry.entityId, entry.entityType, entry.eventType, JSON.stringify(entry.message)].join(','),
    )
    downloadBlob(`event-log-${Date.now()}.csv`, [header, ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  return (
    <div className="event-log-panel">
      <div className="task-config" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
        <Select
          size="small"
          allowClear
          placeholder={t('simPanel.log.filterEntity')}
          style={{ minWidth: 140 }}
          value={entity}
          options={entities.map((id) => ({ value: id, label: id }))}
          onChange={(value) => {
            setEntity(value)
            setPage(0)
          }}
        />
        <Select
          size="small"
          style={{ minWidth: 110 }}
          value={level}
          options={[
            { value: 'all', label: t('simPanel.log.all') },
            { value: 'task', label: t('simPanel.log.task') },
            { value: 'agv', label: t('simPanel.log.agv') },
            { value: 'conveyor', label: t('simPanel.log.conveyor') },
            { value: 'stacker', label: t('simPanel.log.stacker') },
            { value: 'system', label: t('simPanel.log.system') },
            { value: 'fault', label: t('simPanel.log.fault') },
          ]}
          onChange={(value) => {
            setLevel(value)
            setPage(0)
          }}
        />
        <Select
          size="small"
          allowClear
          placeholder={t('simPanel.log.columns.eventType')}
          style={{ minWidth: 140 }}
          value={eventType}
          options={eventTypes.map((item) => ({ value: item, label: eventTypeLabel(item, t) }))}
          onChange={(value) => {
            setEventType(value)
            setPage(0)
          }}
        />
        <Input
          size="small"
          style={{ width: 140 }}
          placeholder={t('simPanel.log.keyword', { defaultValue: '关键词' })}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setPage(0)
          }}
        />
        <InputNumber
          size="small"
          placeholder="t≥"
          value={timeMin ?? undefined}
          onChange={(value) => {
            setTimeMin(typeof value === 'number' ? value : null)
            setPage(0)
          }}
        />
        <InputNumber
          size="small"
          placeholder="t≤"
          value={timeMax ?? undefined}
          onChange={(value) => {
            setTimeMax(typeof value === 'number' ? value : null)
            setPage(0)
          }}
        />
        <span className="panel-hint">{t('simPanel.log.count', { count: filtered.length })}</span>
        <Space size={4}>
          <Button
            size="small"
            danger
            onClick={() => {
              if (window.confirm(t('simPanel.log.confirmClear', { defaultValue: '确定清空事件日志吗？' }))) {
                clearEventLog()
                setPage(0)
              }
            }}
          >
            {t('simPanel.log.clear')}
          </Button>
          <Button size="small" onClick={exportCsv}>
            {t('simPanel.log.exportCsv', { defaultValue: '导出 CSV' })}
          </Button>
          <Button size="small" onClick={exportJson}>
            {t('simPanel.log.exportJson', { defaultValue: '导出 JSON' })}
          </Button>
        </Space>
      </div>
      {filtered.length > DISPLAY_CAP && (
        <div className="panel-hint">
          {t('simPanel.log.capped', {
            defaultValue: '日志较多，仅显示最近 {{count}} 条。',
            count: DISPLAY_CAP,
          })}
        </div>
      )}
      <div className="event-list log-scroll log-virtual">
        {pageRows.length === 0 && <div className="panel-hint">{t('simPanel.log.empty')}</div>}
        {pageRows.map((entry) => (
          <div key={entry.id} className="event-log-row">
            <span className="event-log-time">t={entry.simulationTime.toFixed(2)}</span>
            <span className="event-log-type">[{eventTypeLabel(entry.eventType, t)}]</span>
            <span className="event-log-entity">{entry.entityId}</span>
            <span className="event-log-msg">{entry.message}</span>
          </div>
        ))}
      </div>
      <div className="task-config" style={{ marginTop: 6 }}>
        <Button size="small" disabled={safePage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
          {t('simPanel.log.prev', { defaultValue: '上一页' })}
        </Button>
        <span className="panel-hint">
          {safePage + 1}/{pageCount}
        </span>
        <Button
          size="small"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        >
          {t('simPanel.log.next', { defaultValue: '下一页' })}
        </Button>
      </div>
    </div>
  )
}
