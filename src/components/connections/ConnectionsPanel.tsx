import { useMemo, useState } from 'react'
import { Button, Input, InputNumber, Select, Space, Table, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  useConnectionStore,
  type ConnectionProtocol,
  type ConnectionStatus,
} from '../../store/connectionStore.ts'

const PROTOCOLS: ConnectionProtocol[] = ['HTTP', 'WebSocket', 'MQTT', 'OPC UA', 'Modbus TCP']

function statusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'processing'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

export default function ConnectionsPanel() {
  const { t } = useTranslation()
  const connections = useConnectionStore((state) => state.connections)
  const addConnection = useConnectionStore((state) => state.addConnection)
  const connect = useConnectionStore((state) => state.connect)
  const disconnect = useConnectionStore((state) => state.disconnect)
  const removeConnection = useConnectionStore((state) => state.removeConnection)

  const [name, setName] = useState('新连接')
  const [protocol, setProtocol] = useState<ConnectionProtocol>('HTTP')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState(8787)
  const [autoReconnect, setAutoReconnect] = useState(true)

  const rows = useMemo(() => connections, [connections])

  return (
    <div className="module-panel connections-panel">
      <div className="panel-title">{t('nav.connections')}</div>
      <div className="task-config" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <Input
          size="small"
          style={{ width: 140 }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('connections.name', { defaultValue: '名称' })}
        />
        <Select
          size="small"
          style={{ width: 120 }}
          value={protocol}
          options={PROTOCOLS.map((item) => ({ value: item, label: item }))}
          onChange={setProtocol}
        />
        <Input
          size="small"
          style={{ width: 140 }}
          value={host}
          onChange={(event) => setHost(event.target.value)}
          placeholder="host"
        />
        <InputNumber size="small" style={{ width: 90 }} value={port} onChange={(value) => setPort(value ?? 0)} />
        <Select
          size="small"
          style={{ width: 120 }}
          value={autoReconnect ? 'yes' : 'no'}
          options={[
            { value: 'yes', label: t('connections.autoReconnect', { defaultValue: '自动重连' }) },
            { value: 'no', label: t('connections.manual', { defaultValue: '手动' }) },
          ]}
          onChange={(value) => setAutoReconnect(value === 'yes')}
        />
        <Button
          size="small"
          type="primary"
          onClick={() => {
            addConnection({ name, protocol, host, port, autoReconnect })
            setName('新连接')
          }}
        >
          {t('connections.add', { defaultValue: '添加连接' })}
        </Button>
      </div>
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={rows}
        locale={{ emptyText: t('empty.connection') }}
        columns={[
          { title: t('connections.name', { defaultValue: '名称' }), dataIndex: 'name' },
          { title: t('connections.protocol', { defaultValue: '协议' }), dataIndex: 'protocol', width: 110 },
          {
            title: t('connections.endpoint', { defaultValue: '地址' }),
            width: 160,
            render: (_, row) => `${row.host}:${row.port}`,
          },
          {
            title: t('connections.status', { defaultValue: '状态' }),
            dataIndex: 'status',
            width: 110,
            render: (status: ConnectionStatus) => <Tag color={statusColor(status)}>{status}</Tag>,
          },
          {
            title: t('connections.error', { defaultValue: '错误' }),
            dataIndex: 'lastError',
            ellipsis: true,
            render: (value?: string) => value || '-',
          },
          {
            title: t('connections.actions', { defaultValue: '操作' }),
            width: 220,
            render: (_, row) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  disabled={row.status === 'connected' || row.status === 'connecting'}
                  onClick={() => void connect(row.id)}
                >
                  {t('connections.connect', { defaultValue: '连接' })}
                </Button>
                <Button size="small" disabled={row.status === 'disconnected'} onClick={() => disconnect(row.id)}>
                  {t('connections.disconnect', { defaultValue: '断开' })}
                </Button>
                <Button size="small" danger onClick={() => removeConnection(row.id)}>
                  {t('toolbar.delete')}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
