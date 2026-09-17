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

export interface GatewayOptions {
  port?: number
}

/**
 * Lightweight HTTP + WebSocket gateway for Virtual Commissioning.
 * External WCS/ACS talk here; they never mutate the twin store directly.
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
    res.json({ ok: true, service: 'warehousesim-gateway', version: '0.3' })
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
    const response = await deviceRegistry.sendCommand({
      deviceId: req.params.id,
      commandType: String(req.body?.commandType ?? ''),
      parameters: req.body?.parameters,
      commandId: req.body?.commandId,
    })
    const status = deviceRegistry.get(req.params.id)?.getStatus()
    if (status) {
      signalMapper.updateFromDeviceSignals(status.deviceId, status.signals, Date.now())
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
    const assign = await deviceRegistry.sendCommand({
      deviceId: agvId,
      commandType: 'ASSIGN_TASK',
      parameters: { taskId, sourceId, targetId },
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
      signals: signalMapper.watchTable(),
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
    broadcast('fault.injected', event)
    res.status(201).json(event)
  })

  app.get('/api/signals', (_req, res) => {
    res.json(signalMapper.watchTable())
  })

  app.get('/api/commands', (_req, res) => {
    res.json(deviceRegistry.commandLog.slice(-100))
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
    socket.send(JSON.stringify({ type: 'connected', payload: { service: 'warehousesim' }, timestamp: Date.now() }))
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
