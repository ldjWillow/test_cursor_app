import { describe, expect, it, beforeEach } from 'vitest'
import { SimulationStatus } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { isModelEditable, assertModelEditable } from '../utils/modelLock.ts'
import { emptyProject } from '../domain/base/scenarios.ts'

describe('modelLock', () => {
  beforeEach(() => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    useProjectStore.getState().setDocument(emptyProject('lock-test'))
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
  })

  it('allows addDevice when idle', () => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    const before = useProjectStore.getState().revision
    useProjectStore.getState().addDevice('station', { x: 1, y: 2 })
    expect(useProjectStore.getState().revision).toBeGreaterThan(before)
  })
})
