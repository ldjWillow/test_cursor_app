import { describe, expect, it, beforeEach } from 'vitest'
import { conveyorScenario } from '../domain/base/scenarios.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { SimulationStatus } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { emptyProject } from '../domain/base/scenarios.ts'
import { replayController } from '../replay/ReplayController.ts'
import { emptyStatistics } from '../store/emptyStatistics.ts'
import { CAMERA_PRESETS } from '../view3d/WarehouseScene3D.tsx'

describe('P1 acceptance', () => {
  beforeEach(() => {
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    useProjectStore.getState().setDocument(emptyProject('p1'))
    replayController.dispose()
  })

  it('keeps speed invariance for sliced DES advances', () => {
    const project = conveyorScenario()
    const full = createEngine(project)
    full.runUntilEmpty()

    const sliced = createEngine(project)
    while (!sliced.queue.isEmpty) {
      sliced.runUntil(sliced.getCurrentTime() + 7)
    }

    expect(sliced.getState().statistics).toEqual(full.getState().statistics)
  })

  it('locks model edits while simulation is running', () => {
    useSimulationStore.getState().setStatus(SimulationStatus.Running)
    const revision = useProjectStore.getState().revision
    useProjectStore.getState().addDevice('conveyor', { x: 5, y: 5 })
    expect(useProjectStore.getState().revision).toBe(revision)
  })

  it('replay load empty returns false', () => {
    const ok = replayController.loadFromSnapshot({
      time: 0,
      status: SimulationStatus.Idle,
      eventQueue: [],
      waitingTasks: 0,
      runningTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      devices: [],
      statistics: emptyStatistics(),
      logs: [],
      eventLog: [],
    })
    expect(ok).toBe(false)
  })

  it('exports deterministic camera presets', () => {
    expect(CAMERA_PRESETS.top.position).toEqual([25, 40, 20])
    expect(CAMERA_PRESETS.front.target).toEqual([25, 0, 20])
    expect(CAMERA_PRESETS.fitAll.position).toEqual([30, 28, 35])
  })
})
