import { describe, expect, it, beforeEach } from 'vitest'
import { SimulationStatus } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { isModelEditable, assertModelEditable, modelLockReason } from '../utils/modelLock.ts'
import { emptyProject } from '../domain/base/scenarios.ts'
import zhCN from '../locales/zh-CN.ts'

describe('modelLock', () => {
  beforeEach(() => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    useDigitalTwinStore.getState().setOperatingMode('simulation')
    useProjectStore.getState().setDocument(emptyProject('lock-test'))
    useSimulationStore.getState().setError(undefined)
  })

  it('allows edits only while simulation is idle', () => {
    expect(isModelEditable(SimulationStatus.Idle)).toBe(true)
    expect(isModelEditable(SimulationStatus.Running)).toBe(false)
    expect(isModelEditable(SimulationStatus.Paused)).toBe(false)
    expect(isModelEditable(SimulationStatus.Completed)).toBe(false)
  })

  it('blocks addDevice when simulation is running and keeps revision unchanged', () => {
    useSimulationStore.getState().setStatus(SimulationStatus.Running)
    const before = useProjectStore.getState().revision
    const deviceCount = useProjectStore.getState().document.devices.length

    useProjectStore.getState().addDevice('agv', { x: 10, y: 20 })

    expect(useProjectStore.getState().revision).toBe(before)
    expect(useProjectStore.getState().document.devices.length).toBe(deviceCount)
    expect(assertModelEditable('addDevice')).toBe(false)
    expect(useSimulationStore.getState().lastError).toContain('MODEL_LOCKED')
    expect(zhCN.messages.modelLocked).toBe('请先重置或停止仿真后再编辑模型。')
  })

  it('locks edits during replay mode even when idle', () => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    useDigitalTwinStore.getState().setOperatingMode('replay')
    expect(isModelEditable()).toBe(false)
    expect(modelLockReason()).toBe('replay')
  })

  it('allows addDevice when idle', () => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    const before = useProjectStore.getState().revision
    useProjectStore.getState().addDevice('station', { x: 1, y: 2 })
    expect(useProjectStore.getState().revision).toBeGreaterThan(before)
  })
})
