import { useMemo, useState } from 'react'
import { Button, Input, InputNumber, Select, Space, Table, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  useConnectionStore,
  type ConnectionProtocol,
  type ConnectionStatus,
  type ConnectionTransport,
} from '../../store/connectionStore.ts'
import { connectionEndpointDisplay } from '../../utils/connectionEndpoint.ts'

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
  const [transport, setTransport] = useState<ConnectionTransport>('same-origin')
  const [path, setPath] = useState('/gateway')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(0)
  const [autoReconnect, setAutoReconnect] = useState(true)

  const rows = useMemo(() => connections, [connections])

  const draftDisplay = connectionEndpointDisplay({
    protocol,
    transport,
    host,
    port,
    path,
  })

  return (
    <div className="module-panel connections-panel">
      <div className="panel-title">{t('nav.connections')}</div>
      <div className="task-config" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <Input
          size="small"
          style={{ width: 140 }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('connections.name')}
        />
        <Select
          size="small"
          style={{ width: 120 }}
          value={protocol}
          options={PROTOCOLS.map((item) => ({ value: item, label: item }))}
          onChange={setProtocol}
        />
        <Select
          size="small"
          style={{ width: 130 }}
          value={transport}
          options={[
            { value: 'same-origin', label: t('connections.transport.sameOrigin') },
            { value: 'custom', label: t('connections.transport.custom') },
          ]}
          onChange={(value: ConnectionTransport) => {
            setTransport(value)
            if (value === 'same-origin') {
              setHost('')
              setPort(0)
              if (!path) {
                setPath('/gateway')
              }
            } else if (!host) {
              setHost('127.0.0.1')
              setPort(8787)
            }
          }}
        />
        {transport === 'same-origin' ? (
          <Input
            size="small"
            style={{ width: 140 }}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={t('connections.path')}
          />
        ) : (
          <>
            <Input
              size="small"
              style={{ width: 140 }}
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="host"
            />
            <InputNumber
              size="small"
              style={{ width: 90 }}
              value={port}
              onChange={(value) => setPort(value ?? 0)}
            />
          </>
        )}
        <Select
          size="small"
          style={{ width: 120 }}
          value={autoReconnect ? 'yes' : 'no'}
          options={[
            { value: 'yes', label: t('connections.autoReconnect') },
            { value: 'no', label: t('connections.manual') },
          ]}
          onChange={(value) => setAutoReconnect(value === 'yes')}
        />
        <Button
          size="small"
          type="primary"
          onClick={() => {
            addConnection({
              name,
              protocol,
              transport,
              host: transport === 'same-origin' ? '' : host,
              port: transport === 'same-origin' ? 0 : port,
              path: transport === 'same-origin' ? path || '/gateway' : undefined,
              autoReconnect,
            })
            setName('新连接')
          }}
        >
          {t('connections.add')}
        </Button>
      </div>
      <div className="panel-hint" style={{ marginBottom: 8 }}>
        {t('connections.endpoint')}: {draftDisplay}
      </div>
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={rows}
        locale={{ emptyText: t('empty.connection') }}
        columns={[
          { title: t('connections.name'), dataIndex: 'name' },
          { title: t('connections.protocol'), dataIndex: 'protocol', width: 110 },
          {
            title: t('connections.endpoint'),
            width: 240,
            ellipsis: true,
            render: (_, row) => connectionEndpointDisplay(row),
          },
          {
            title: t('connections.status'),
            dataIndex: 'status',
            width: 110,
            render: (status: ConnectionStatus) => (
              <Tag color={statusColor(status)}>{t(`connections.statusLabels.${status}`)}</Tag>
            ),
          },
          {
            title: t('connections.error'),
            dataIndex: 'lastError',
            ellipsis: true,
            render: (value?: string) => value || '-',
          },
          {
            title: t('connections.actions'),
            width: 220,
            render: (_, row) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  disabled={row.status === 'connected' || row.status === 'connecting'}
                  onClick={() => void connect(row.id)}
                >
                  {t('connections.connect')}
                </Button>
                <Button size="small" disabled={row.status === 'disconnected'} onClick={() => disconnect(row.id)}>
                  {t('connections.disconnect')}
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
