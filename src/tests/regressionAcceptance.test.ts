import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { SimulationStatus, DeviceType } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { agvScenario, asrsScenario, conveyorScenario, emptyProject } from '../domain/base/scenarios.ts'
import { isModelEditable, assertModelEditable, modelLockReason } from '../utils/modelLock.ts'
import { simulationRuntime } from '../simulation/SimulationRuntime.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import {
  cancelExperimentWorker,
  isExperimentWorkerBusy,
  workerCompareAgvs,
  workerRunToEnd,
} from '../workers/experimentClient.ts'
import zhCN from '../locales/zh-CN.ts'

describe('regression: edit lock', () => {
  beforeEach(() => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    useDigitalTwinStore.getState().setOperatingMode('simulation')
    useProjectStore.getState().setDocument(emptyProject('edit-lock'))
    useSimulationStore.getState().setError(undefined)
  })

  it('blocks drag-in (addDevice), move, delete, connect, and param edits while running/paused/replay', () => {
    const store = useProjectStore.getState()
    store.setDocument(conveyorScenario())
    const source = useProjectStore.getState().document.devices.find((d) => d.type === DeviceType.Source)!
    const sink = useProjectStore.getState().document.devices.find((d) => d.type === DeviceType.Sink)!

    for (const status of [SimulationStatus.Running, SimulationStatus.Paused]) {
      useSimulationStore.getState().setStatus(status)
      const beforeRev = useProjectStore.getState().revision
      const beforeCount = useProjectStore.getState().document.devices.length
      const beforeEdges = useProjectStore.getState().document.edges.length

      useProjectStore.getState().addDevice('agv', { x: 99, y: 99 })
      useProjectStore.getState().commitNodePositions([
        { id: source.id, position: { x: 1, y: 1 }, data: {}, type: 'device' } as never,
      ])
      useProjectStore.getState().connect({ source: source.id, target: sink.id, sourceHandle: null, targetHandle: null })
      useProjectStore.getState().updateDeviceParams(source.id, {
        ...(source.params as object),
        generationInterval: 999,
      } as never)
      useProjectStore.getState().setSelection(source.id, 'device')
      useProjectStore.getState().removeSelected()

      expect(isModelEditable()).toBe(false)
      expect(assertModelEditable()).toBe(false)
      expect(useSimulationStore.getState().lastError).toContain('MODEL_LOCKED')
      expect(useProjectStore.getState().revision).toBe(beforeRev)
      expect(useProjectStore.getState().document.devices.length).toBe(beforeCount)
      expect(useProjectStore.getState().document.edges.length).toBe(beforeEdges)
      expect(zhCN.messages.modelLocked).toContain('请先重置或停止仿真')
    }

    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    useDigitalTwinStore.getState().setOperatingMode('replay')
    expect(isModelEditable()).toBe(false)
    expect(modelLockReason()).toBe('replay')
    const rev = useProjectStore.getState().revision
    useProjectStore.getState().addDevice('station', { x: 0, y: 0 })
    expect(useProjectStore.getState().revision).toBe(rev)
  })

  it('restores editing after reset to idle', () => {
    useSimulationStore.getState().setStatus(SimulationStatus.Running)
    expect(isModelEditable()).toBe(false)
    const doc = useProjectStore.getState().document
    simulationRuntime.reset(doc, useProjectStore.getState().revision)
    expect(useSimulationStore.getState().status).toBe(SimulationStatus.Idle)
    useDigitalTwinStore.getState().setOperatingMode('simulation')
    expect(isModelEditable()).toBe(true)
    const before = useProjectStore.getState().revision
    useProjectStore.getState().addDevice('station', { x: 3, y: 4 })
    expect(useProjectStore.getState().revision).toBeGreaterThan(before)
  })
})

describe('regression: simulation controls & KPI sync', () => {
  beforeEach(() => {
    useDigitalTwinStore.getState().setOperatingMode('simulation')
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
  })

  it('start/pause/continue/reset/step keep status and event log/KPI coherent', () => {
    const project = agvScenario(3, 20)
    useProjectStore.getState().setDocument(project)
    const revision = useProjectStore.getState().revision

    simulationRuntime.start(project, revision, 10)
    expect(useSimulationStore.getState().status).toBe(SimulationStatus.Running)

    simulationRuntime.pause()
    expect(useSimulationStore.getState().status).toBe(SimulationStatus.Paused)
    const pausedTime = useSimulationStore.getState().snapshot.time

    simulationRuntime.start(project, revision, 10)
    expect(useSimulationStore.getState().status).toBe(SimulationStatus.Running)

    simulationRuntime.pause()
    simulationRuntime.step(project, revision)
    expect([SimulationStatus.Paused, SimulationStatus.Completed, SimulationStatus.Idle]).toContain(
      useSimulationStore.getState().status,
    )
    expect(useSimulationStore.getState().snapshot.time).toBeGreaterThanOrEqual(pausedTime)

    const snap = useSimulationStore.getState().snapshot
    expect(snap.statistics).toBeTruthy()
    expect(Array.isArray(snap.eventLog)).toBe(true)
    expect(snap.devices.some((d) => d.type === DeviceType.Agv)).toBe(true)

    simulationRuntime.reset(project, revision)
    expect(useSimulationStore.getState().status).toBe(SimulationStatus.Idle)
    expect(useSimulationStore.getState().snapshot.time).toBe(0)
  })

  it('AGV / conveyor / stacker scenarios emit typed devices and event log entries', () => {
    for (const project of [agvScenario(2, 8), conveyorScenario(), asrsScenario()]) {
      const engine = createEngine(project)
      engine.runUntilEmpty()
      const state = engine.getState()
      expect(state.eventLog.length).toBeGreaterThan(0)
      expect(state.statistics.throughput).toBeGreaterThanOrEqual(0)
      const types = new Set(state.devices.map((d) => d.type))
      if (project.devices.some((d) => d.type === DeviceType.Agv)) {
        expect(types.has(DeviceType.Agv)).toBe(true)
        expect(state.completedTasks).toBeGreaterThan(0)
      }
      if (project.devices.some((d) => d.type === DeviceType.Conveyor)) {
        expect(types.has(DeviceType.Conveyor)).toBe(true)
      }
      if (project.devices.some((d) => d.type === DeviceType.Stacker)) {
        expect(types.has(DeviceType.Stacker)).toBe(true)
      }
    }
  })

  it('1×/5×/10×/50× produce identical final KPI for the same seed', () => {
    const project = agvScenario(3, 25)
    const finals = ([1, 5, 10, 50] as const).map((speed) => {
      const engine = createEngine(project)
      engine.start()
      let wall = 0
      while (!engine.queue.isEmpty && wall < 8000) {
        wall += 0.05
        engine.runUntil(engine.getCurrentTime() + 0.05 * speed)
      }
      const s = engine.getState()
      return {
        completed: s.completedTasks,
        throughput: Number(s.statistics.throughput.toFixed(6)),
        wait: Number(s.statistics.averageWaitingTime.toFixed(6)),
        time: Number(s.time.toFixed(6)),
      }
    })
    for (const row of finals) {
      expect(row).toEqual(finals[0])
    }
  })
})

describe('regression: event log clear/filter/cap', () => {
  it('clearEventLog empties snapshot logs without dropping other KPI fields', () => {
    const project = conveyorScenario()
    const engine = createEngine(project)
    engine.runUntilEmpty()
    useSimulationStore.getState().setSnapshot(engine.getState())
    expect(useSimulationStore.getState().snapshot.eventLog.length).toBeGreaterThan(0)
    const throughput = useSimulationStore.getState().snapshot.statistics.throughput
    useSimulationStore.getState().clearEventLog()
    expect(useSimulationStore.getState().snapshot.eventLog).toEqual([])
    expect(useSimulationStore.getState().snapshot.logs).toEqual([])
    expect(useSimulationStore.getState().snapshot.statistics.throughput).toBe(throughput)
  })
})

describe('regression: experiment worker timeout/busy/cancel', () => {
  afterEach(() => {
    cancelExperimentWorker()
    vi.restoreAllMocks()
  })

  it('rejects concurrent worker tasks with WORKER_BUSY', async () => {
    class FakeWorker {
      listeners = new Set<(event: MessageEvent) => void>()
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        this.listeners.add(listener)
      }
      removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
        this.listeners.delete(listener)
      }
      postMessage(_data: unknown) {
        /* keep pending */
      }
      terminate() {
        this.listeners.clear()
      }
    }
    vi.stubGlobal(
      'Worker',
      vi.fn(function Worker() {
        return new FakeWorker()
      }),
    )

    const project = agvScenario(2, 5)
    const first = workerRunToEnd(project)
    await expect(workerCompareAgvs([2], 5)).rejects.toThrow('WORKER_BUSY')
    expect(isExperimentWorkerBusy()).toBe(true)
    cancelExperimentWorker()
    await expect(first).rejects.toThrow('WORKER_CANCELLED')
    expect(isExperimentWorkerBusy()).toBe(false)
  })

  it('surfaces WORKER_TIMEOUT when the worker never responds', async () => {
    vi.useFakeTimers()
    class FakeWorker {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal(
      'Worker',
      vi.fn(function Worker() {
        return new FakeWorker()
      }),
    )
    const pending = workerRunToEnd(agvScenario(2, 5))
    const expectation = expect(pending).rejects.toThrow('WORKER_TIMEOUT')
    await vi.advanceTimersByTimeAsync(120_000)
    await expectation
    vi.useRealTimers()
  })
})

describe('regression: viewport copy constraints (layout tokens)', () => {
  const VIEWPORTS = [
    { w: 1920, h: 1080 },
    { w: 1366, h: 768 },
    { w: 1280, h: 720 },
  ]

  it('critical Chinese labels stay within safe display length for toolbar density', () => {
    const controlLabels = [
      zhCN.toolbar.start,
      zhCN.toolbar.pause,
      zhCN.toolbar.reset,
      zhCN.toolbar.step,
      zhCN.toolbar.continue,
      zhCN.simPanel.log.clear,
      zhCN.simPanel.log.exportCsv,
      zhCN.simPanel.log.exportJson,
    ]
    const tipLabels = [
      zhCN.messages.modelLocked,
      zhCN.connections.errors.mixedContent,
      zhCN.connections.errors.privateNetwork,
      zhCN.connections.errors.cors,
      zhCN.connections.errors.timeout,
      zhCN.connections.errors.unsupported,
    ]
    for (const tip of tipLabels) {
      expect(tip.length).toBeGreaterThan(4)
      expect(/[\u4e00-\u9fff]/.test(tip)).toBe(true)
    }
    for (const vp of VIEWPORTS) {
      // Rough density budget: at 12px font, ~7px/char; keep control labels short enough
      // that ~10 toolbar actions fit half the viewport width.
      const budgetChars = Math.floor((vp.w * 0.55) / (7 * 10))
      for (const label of controlLabels) {
        expect(label.length).toBeLessThanOrEqual(Math.max(8, budgetChars + 4))
      }
    }
  })
})
