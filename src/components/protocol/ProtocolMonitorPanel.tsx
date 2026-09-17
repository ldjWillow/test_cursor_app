import { useMemo, useState } from 'react'
import { Button, Input, Switch, Table, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '../../store/connectionStore.ts'

export default function ProtocolMonitorPanel() {
  const { t } = useTranslation()
  const protocolLog = useConnectionStore((state) => state.protocolLog)
  const protocolPaused = useConnectionStore((state) => state.protocolPaused)
  const setProtocolPaused = useConnectionStore((state) => state.setProtocolPaused)
  const clearProtocolLog = useConnectionStore((state) => state.clearProtocolLog)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    if (!keyword) {
      return protocolLog
    }
    return protocolLog.filter((entry) => {
      const haystack = [entry.protocol, entry.direction, entry.address, entry.topic, entry.raw, entry.parsed, entry.deviceId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [filter, protocolLog])

  return (
    <div className="module-panel protocol-panel">
      <div className="sim-panel-header">
        <div className="panel-title">{t('nav.protocol')}</div>
        <div className="task-config">
          <Input
            size="small"
            allowClear
            style={{ width: 180 }}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('protocol.filter', { defaultValue: '过滤协议日志' })}
          />
          <span className="panel-hint">
            {t('protocol.pause', { defaultValue: '暂停采集' })}
          </span>
          <Switch size="small" checked={protocolPaused} onChange={setProtocolPaused} />
          <Button size="small" onClick={clearProtocolLog}>
            {t('protocol.clear', { defaultValue: '清空' })}
          </Button>
        </div>
      </div>
      <Table
        size="small"
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        rowKey="id"
        dataSource={rows}
        locale={{ emptyText: t('empty.events') }}
        columns={[
          {
            title: t('protocol.time', { defaultValue: '时间' }),
            dataIndex: 'time',
            width: 120,
            render: (time: number) => new Date(time).toLocaleTimeString(),
          },
          { title: t('protocol.protocol', { defaultValue: '协议' }), dataIndex: 'protocol', width: 100 },
          {
            title: t('protocol.direction', { defaultValue: '方向' }),
            dataIndex: 'direction',
            width: 70,
            render: (value: string) => <Tag>{value}</Tag>,
          },
          {
            title: t('protocol.address', { defaultValue: '地址' }),
            dataIndex: 'address',
            ellipsis: true,
            render: (value: string | undefined, row: { topic?: string }) => value || row.topic || '-',
          },
          { title: t('protocol.raw', { defaultValue: '原始' }), dataIndex: 'raw', ellipsis: true },
          { title: t('protocol.parsed', { defaultValue: '解析' }), dataIndex: 'parsed', ellipsis: true },
          {
            title: t('protocol.result', { defaultValue: '结果' }),
            dataIndex: 'result',
            width: 80,
            render: (value: string) => <Tag color={value === 'ok' ? 'success' : 'error'}>{value}</Tag>,
          },
        ]}
      />
    </div>
  )
}
