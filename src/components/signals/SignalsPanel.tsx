import { useEffect, useMemo, useState } from 'react'
import { Input, Table, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { refreshCommissioning, useCommissioningStore } from '../../store/commissioningStore.ts'

export default function SignalsPanel() {
  const { t } = useTranslation()
  const signals = useCommissioningStore((state) => state.signals)
  const revision = useCommissioningStore((state) => state.revision)
  const [search, setSearch] = useState('')

  useEffect(() => {
    refreshCommissioning()
    const timer = window.setInterval(() => refreshCommissioning(), 500)
    return () => window.clearInterval(timer)
  }, [])

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) {
      return signals
    }
    return signals.filter((row) => {
      const haystack = `${row.signal} ${row.source} ${String(row.value)}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [search, signals, revision])

  return (
    <div className="module-panel signals-panel">
      <div className="sim-panel-header">
        <div className="panel-title">{t('nav.signals')}</div>
        <Input
          size="small"
          allowClear
          style={{ width: 200 }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('signals.search', { defaultValue: '搜索信号' })}
        />
      </div>
      <Table
        size="small"
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        rowKey="signal"
        dataSource={rows}
        locale={{ emptyText: t('empty.signal') }}
        rowClassName={(row) => (row.changed ? 'signal-row-changed' : '')}
        columns={[
          { title: t('commissioning.signalTable.signal'), dataIndex: 'signal' },
          {
            title: t('commissioning.signalTable.value'),
            dataIndex: 'value',
            render: (value: unknown, row) => (
              <span className={row.changed ? 'signal-value-changed' : undefined}>{String(value)}</span>
            ),
          },
          { title: t('commissioning.signalTable.source'), dataIndex: 'source', width: 140 },
          {
            title: t('signals.quality', { defaultValue: '质量' }),
            dataIndex: 'quality',
            width: 110,
            render: (quality: string) => (
              <Tag color={quality === 'GOOD' ? 'success' : 'error'}>{quality}</Tag>
            ),
          },
          {
            title: t('signals.timestamp', { defaultValue: '时间戳' }),
            dataIndex: 'timestamp',
            width: 120,
            render: (timestamp: number) => new Date(timestamp).toLocaleTimeString(),
          },
        ]}
      />
    </div>
  )
}
