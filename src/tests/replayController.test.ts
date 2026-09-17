import { describe, expect, it, beforeEach } from 'vitest'
import type { SimulationLogEntry, SimulationSnapshot } from '../types/index.ts'
import { SimulationStatus } from '../types/index.ts'
import { ReplayEngine } from '../replay/ReplayEngine.ts'
import { ReplayController } from '../replay/ReplayController.ts'
import { emptyStatistics } from '../store/emptyStatistics.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { emptyProject } from '../domain/base/scenarios.ts'

function entry(id: string, time: number, message = id): SimulationLogEntry {
  return {
    id,
    simulationTime: time,
    entityId: 'agv-1',
    entityType: 'agv',
    eventType: 'TASK_CREATED',
    message,
  }
}

function snapshotWithLog(eventLog: SimulationLogEntry[]): SimulationSnapshot {
  return {
    time: eventLog.at(-1)?.simulationTime ?? 0,
    status: SimulationStatus.Completed,
    eventQueue: [],
    waitingTasks: 0,
    runningTasks: 0,
    completedTasks: eventLog.length,
    failedTasks: 0,
    devices: [],
    statistics: emptyStatistics(),
    logs: [],
    eventLog,
  }
}

describe('ReplayEngine tick', () => {
  it('emits entries in time order without rAF', () => {
    const engine = new ReplayEngine()
    engine.load([entry('a', 1), entry('b', 2), entry('c', 5)])
    engine.play(1)
    expect(engine.tick(1.5)).toEqual([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' }),
    ])
    expect(engine.getCurrentTime()).toBeCloseTo(2.5)
    expect(engine.tick(3)).toEqual([expect.objectContaining({ id: 'c' })])
    expect(engine.isPlaying()).toBe(false)
  })

  it('seek repositions index for subsequent ticks', () => {
    const engine = new ReplayEngine()
    engine.load([entry('a', 1), entry('b', 3), entry('c', 4)])
    engine.seek(3)
    engine.play(1)
    expect(engine.tick(0.1)).toEqual([expect.objectContaining({ id: 'b' })])
  })
})

describe('ReplayController seek/step/publish', () => {
  let controller: ReplayController

  beforeEach(() => {
    useProjectStore.getState().setDocument(emptyProject('replay-test'))
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
    controller = new ReplayController()
  })

  it('loadFromSnapshot returns false for empty event log', () => {
    expect(controller.loadFromSnapshot(snapshotWithLog([]))).toBe(false)
    expect(controller.hasEntries()).toBe(false)
  })

  it('seek and step publish without requestAnimationFrame', () => {
    const log = [entry('e1', 1), entry('e2', 2), entry('e3', 4)]
    expect(controller.loadFromSnapshot(snapshotWithLog(log))).toBe(true)
    controller.seek(2)
    expect(controller.getCurrentTime()).toBe(2)
    expect(useSimulationStore.getState().snapshot.eventLog.map((item) => item.id)).toEqual(['e1', 'e2'])

    controller.step()
    expect(controller.getCurrentTime()).toBe(4)
    expect(controller.getStatus()).toBe('paused')
    expect(useSimulationStore.getState().snapshot.eventLog.map((item) => item.id)).toEqual(['e1', 'e2', 'e3'])
  })
})
