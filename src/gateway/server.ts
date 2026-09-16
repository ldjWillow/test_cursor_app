import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { faultManager } from '../virtual/FaultManager.ts'
import { signalMapper } from '../signal/SignalMapper.ts'
import { InMemoryProtocolAdapter } from './ProtocolAdapter.ts'
import type { DigitalTwinState } from '../twin/types.ts'
import { emptyDigitalTwinState } from '../twin/types.ts'
import { connectionManager } from '../industrial/ConnectionManager.ts'
import { signalRegistry } from '../industrial/SignalRegistry.ts'
import { protocolMonitor } from '../industrial/ProtocolMonitor.ts'
import { signalTrace } from '../industrial/SignalTrace.ts'
import { commandBus } from '../industrial/CommandBus.ts'
import { controlAuthority } from '../industrial/ControlAuthority.ts'
import { industrialRuntime } from '../industrial/IndustrialRuntime.ts'
import { networkFaultInjector } from '../industrial/NetworkFaultInjector.ts'
import { auditLog } from '../industrial/AuditLog.ts'

export interface GatewayOptions {
  port?: number
}

/**
 * HTTP + WebSocket gateway for Virtual Commissioning & Industrial Connectivity (V0.4).
 * External WCS/ACS/PLC talk here; they never mutate the twin store directly.
 */
export function createGatewayApp() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  let twin: DigitalTwinState = emptyDigitalTwinState('emulation')
  let simulationStatus = 'idle'
  const protocol = new InMemoryProtocolAdapter()
  void protocol.connect()

  const clients = new Set<WebSocket>()

  function broadcast(type: string, payload: unknown): void {
    const message = JSON.stringify({ type, payload, timestamp: Date.now() })
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message)
      }
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'warehousesim-gateway', version: '0.4' })
  })

  app.get('/api/devices', (_req, res) => {
    res.json(deviceRegistry.list())
  })

  app.get('/api/devices/:id/status', (req, res) => {
    const device = deviceRegistry.get(req.params.id)
    if (!device) {
      res.status(404).json({ error: 'Device not found' })
      return
    }
    res.json(device.getStatus())
  })

  app.post('/api/devices/:id/commands', async (req, res) => {
    const source = String(req.body?.source ?? 'EXTERNAL') as 'EXTERNAL' | 'INTERNAL' | 'MANUAL'
    const response = await commandBus.dispatch({
      deviceId: req.params.id,
      commandType: String(req.body?.commandType ?? ''),
      parameters: req.body?.parameters,
      commandId: req.body?.commandId,
      source,
    })
    const status = deviceRegistry.get(req.params.id)?.getStatus()
    if (status) {
      signalMapper.updateFromDeviceSignals(status.deviceId, status.signals, Date.now())
      signalRegistry.syncDeviceSignals(status.deviceId, status.signals, 'HTTP')
    }
    broadcast('device.command', response)
    broadcast('device.status', status)
    res.status(response.status === 'rejected' ? 409 : 200).json(response)
  })

  app.get('/api/tasks', (_req, res) => {
    res.json(Object.values(twin.tasks))
  })

  app.get('/api/tasks/:id', (req, res) => {
    const task = twin.tasks[req.params.id]
    if (!task) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.json(task)
  })

  app.post('/api/tasks', async (req, res) => {
    const taskId = String(req.body?.id ?? `ext-task-${Date.now()}`)
    const agvId = String(req.body?.agvId ?? '')
    const sourceId = String(req.body?.sourceId ?? '')
    const targetId = String(req.body?.targetId ?? '')
    if (!agvId) {
      res.status(400).json({ error: 'agvId required in emulation demo' })
      return
    }
    controlAuthority.set(agvId, 'EXTERNAL', 'SAFE_STOP')
    const assign = await commandBus.dispatch({
      deviceId: agvId,
      commandType: 'ASSIGN_TASK',
      parameters: { taskId, sourceId, targetId },
      source: 'EXTERNAL',
    })
    twin = {
      ...twin,
      tasks: {
        ...twin.tasks,
        [taskId]: {
          id: taskId,
          sourceId,
          targetId,
          status: assign.status === 'accepted' ? 'ASSIGNED' : 'FAILED',
          createTime: Date.now() / 1000,
          agvId,
          priority: Number(req.body?.priority ?? 1),
        },
      },
      revision: twin.revision + 1,
    }
    broadcast('task.created', twin.tasks[taskId])
    broadcast('device.command', assign)
    res.status(assign.status === 'accepted' ? 201 : 409).json({ task: twin.tasks[taskId], assign })
  })

  app.get('/api/simulation/status', (_req, res) => {
    res.json({
      status: simulationStatus,
      twin,
      commands: deviceRegistry.commandLog.slice(-50),
      faults: faultManager.listActive(),
      signals: signalRegistry.list().slice(0, 200),
      connections: connectionManager.list().map((c) => ({
        id: c.config.id,
        name: c.config.name,
        type: c.config.type,
        status: c.status,
      })),
      protocolLog: protocolMonitor.list(undefined, 50),
    })
  })

  app.post('/api/simulation/start', (_req, res) => {
    simulationStatus = 'running'
    broadcast('simulation.status', { status: simulationStatus })
    res.json({ status: simulationStatus })
  })

  app.post('/api/simulation/reset', (_req, res) => {
    simulationStatus = 'idle'
    faultManager.reset()
    signalMapper.reset()
    industrialRuntime.reset()
    twin = emptyDigitalTwinState('emulation')
    broadcast('simulation.status', { status: simulationStatus })
    res.json({ status: simulationStatus })
  })

  app.post('/api/faults', (req, res) => {
    const deviceId = String(req.body?.deviceId ?? '')
    const faultType = String(req.body?.faultType ?? 'FAULT')
    const event = faultManager.injectNow(deviceId, faultType, req.body?.message)
    const device = deviceRegistry.get(deviceId) as { injectFault?: () => void } | undefined
    device?.injectFault?.()
    if (req.body?.connectionId) {
      networkFaultInjector.configure(String(req.body.connectionId), {
        delayMs: Number(req.body.delayMs ?? 0),
        jitterMs: Number(req.body.jitterMs ?? 0),
        packetLossPct: Number(req.body.packetLossPct ?? 0),
        disconnect: Boolean(req.body.disconnect),
        slowResponseMs: Number(req.body.slowResponseMs ?? 0),
      })
    }
    auditLog.record('FAULT_INJECTION', 'api', deviceId || req.body?.connectionId, faultType)
    broadcast('fault.injected', event)
    res.status(201).json(event)
  })

  app.get('/api/signals', (_req, res) => {
    res.json(signalRegistry.list())
  })

  app.get('/api/signals/trace', (_req, res) => {
    res.json(signalTrace.list(undefined, 500))
  })

  app.get('/api/connections', (_req, res) => {
    res.json(
      connectionManager.list().map((c) => ({
        config: c.config,
        status: c.status,
        adapter: c.adapter.getStatus(),
      })),
    )
  })

  app.post('/api/connections', (req, res) => {
    try {
      const managed = connectionManager.create(req.body)
      res.status(201).json({ config: managed.config, status: managed.status })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post('/api/connections/:id/connect', async (req, res) => {
    try {
      await connectionManager.start(req.params.id)
      res.json(connectionManager.get(req.params.id)?.status)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post('/api/connections/:id/disconnect', async (req, res) => {
    await connectionManager.stop(req.params.id)
    res.json({ status: 'DISCONNECTED' })
  })

  app.post('/api/connections/:id/test', async (req, res) => {
    const result = await connectionManager.test(req.params.id)
    res.status(result.ok ? 200 : 503).json(result)
  })

  app.get('/api/protocol/log', (req, res) => {
    res.json(
      protocolMonitor.list({
        protocol: req.query.protocol as never,
        direction: req.query.direction as never,
        result: req.query.result as never,
        search: req.query.search as string | undefined,
      }),
    )
  })

  app.get('/api/commands', (_req, res) => {
    res.json(deviceRegistry.commandLog.slice(-100))
  })

  app.get('/api/audit', (_req, res) => {
    res.json(auditLog.list(200))
  })

  /** Internal hook used by the UI runtime to push twin snapshots into the gateway. */
  app.post('/api/internal/twin', (req, res) => {
    twin = req.body as DigitalTwinState
    broadcast('twin.update', {
      simulationTime: twin.simulationTime,
      status: twin.status,
      deviceCount: Object.keys(twin.devices).length,
      selectedDeviceId: twin.selectedDeviceId,
    })
    res.json({ ok: true })
  })

  const setTwin = (next: DigitalTwinState): void => {
    twin = next
  }

  return { app, clients, broadcast, protocol, setTwin, getTwin: () => twin }
}

export function startGateway(options: GatewayOptions = {}): { port: number; close: () => Promise<void> } {
  const port = options.port ?? Number(process.env.PORT ?? 8787)
  const { app, clients } = createGatewayApp()
  const server = createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (socket) => {
    clients.add(socket)
    socket.send(
      JSON.stringify({
        type: 'connected',
        payload: { service: 'warehousesim', version: '0.4' },
        timestamp: Date.now(),
      }),
    )
    socket.on('close', () => clients.delete(socket))
  })

  server.listen(port)

  return {
    port,
    close: async () => {
      for (const client of clients) {
        client.close()
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const started = startGateway()
  // eslint-disable-next-line no-console
  console.log(`WarehouseSim gateway listening on http://localhost:${started.port}`)
} else if (process.env.WAREHOUSESIM_GATEWAY === '1') {
  const started = startGateway()
  // eslint-disable-next-line no-console
  console.log(`WarehouseSim gateway listening on http://localhost:${started.port}`)
}
