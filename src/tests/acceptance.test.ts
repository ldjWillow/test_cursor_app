import { describe, expect, it } from 'vitest'
import { agvScenario, conveyorScenario } from '../domain/base/scenarios.ts'
import { compareAgvCounts, runProjectToCompletion } from '../simulation/experiments.ts'
import { createEngine } from '../simulation/SimulationEngine.ts'
import { SimulationRuntime } from '../simulation/SimulationRuntime.ts'
import { SimulationStatus } from '../types/index.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { scenarioHash } from '../utils/scenarioHash.ts'
import { materialBalance } from '../statistics/materialBalance.ts'
import { exportProjectJson, importProjectJson } from '../persistence/projectPersistence.ts'

describe('acceptance regressions', () => {
  it('is deterministic across 10 runs with the same scenario hash and seed', () => {
    const project = agvScenario(3, 20)
    const hash = scenarioHash(project)
    const first = runProjectToCompletion(project)
    for (let i = 0; i < 9; i += 1) {
      const next = runProjectToCompletion(structuredClone(project))
      expect(scenarioHash(project)).toBe(hash)
      expect(next.statistics).toEqual(first.statistics)
      expect(next.time).toBe(first.time)
      expect(next.completedTasks).toBe(first.completedTasks)
    }
  })

  it('completes the same task count for 3/4/5/6 AGVs on the current model', () => {
    const base = agvScenario(3, 20)
    const rows = compareAgvCounts(base, [3, 4, 5, 6])
    expect(rows.every((row) => row.completedTasks === 20)).toBe(true)
    expect(rows.every((row) => row.taskCount === 20)).toBe(true)
    expect(new Set(rows.map((row) => row.scenarioHash)).size).toBe(1)
  })

  it('does not worsen time/wait or reduce throughput when AGV count increases', () => {
    const base = agvScenario(3, 40)
    const rows = compareAgvCounts(base, [3, 4, 5, 6])
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]!
      const curr = rows[i]!
      expect(curr.simulationTime).toBeLessThanOrEqual(prev.simulationTime + 1e-9)
      expect(curr.averageWaitingTime).toBeLessThanOrEqual(prev.averageWaitingTime + 1e-9)
      expect(curr.throughput).toBeGreaterThanOrEqual(prev.throughput - 1e-9)
    }
  })

  it('advances more simulation time at higher speeds for a fixed wall clock budget', () => {
    const advances: number[] = []
    for (const speed of [1, 5, 10, 50] as const) {
      const runtime = new SimulationRuntime()
      runtime.armForTest(conveyorScenario(), 1)
      const advanced = runtime.advanceWallClock(0.2, speed)
      advances.push(advanced)
      runtime.pause()
    }
    expect(advances[0]).toBeLessThan(advances[1]!)
    expect(advances[1]).toBeLessThan(advances[2]!)
    expect(advances[2]).toBeLessThan(advances[3]!)
  })

  it('does not advance time or drain events after pause', () => {
    const runtime = new SimulationRuntime()
    const engine = runtime.armForTest(conveyorScenario(), 1)
    runtime.advanceWallClock(0.05, 10)
    const timeAfterStart = engine.getCurrentTime()
    const queueSize = engine.queue.size
    runtime.pause()
    expect(engine.status).toBe(SimulationStatus.Paused)
    const advanced = runtime.advanceWallClock(1, 50)
    expect(advanced).toBe(0)
    expect(engine.getCurrentTime()).toBe(timeAfterStart)
    expect(engine.queue.size).toBe(queueSize)
  })

  it('step processes exactly one discrete event', () => {
    const runtime = new SimulationRuntime()
    const engine = runtime.armForTest(conveyorScenario(), 1)
    runtime.pause()
    const before = engine.getProcessedEventCount()
    const nextTime = engine.queue.peek()?.time
    runtime.step(conveyorScenario(), 1)
    expect(engine.getProcessedEventCount()).toBe(before + 1)
    expect(engine.getCurrentTime()).toBe(nextTime)
  })

  it('invalidates results after task/param/node/edge edits', () => {
    useSimulationStore.setState({
      comparison: [{ agvCount: 3, throughput: 1, utilization: 1, averageWaitingTime: 1, averageCycleTime: 1, completedTasks: 100, simulationTime: 10 }],
      resultsStale: false,
      snapshot: {
        ...useSimulationStore.getState().snapshot,
        time: 12,
        completedTasks: 5,
      },
    })
    useProjectStore.getState().setDocument(agvScenario(3, 20))
    expect(useSimulationStore.getState().resultsStale).toBe(true)
    expect(useSimulationStore.getState().comparison).toEqual([])
    expect(useSimulationStore.getState().modelStaleMessage).toMatch(/模型已修改/)
  })

  it('keeps conveyor material conservation', () => {
    const engine = createEngine(conveyorScenario())
    // Mid-run sample
    engine.runUntil(5)
    expect(materialBalance(engine.world).ok).toBe(true)
    engine.runUntilEmpty()
    const balance = materialBalance(engine.world)
    expect(balance.ok).toBe(true)
    expect(balance.generated).toBe(balance.completed)
  })

  it('removes dangling edges after device delete', () => {
    useProjectStore.getState().setDocument(agvScenario(3, 10))
    useProjectStore.getState().setSelection('path-n1', 'device')
    useProjectStore.getState().removeSelected()
    const doc = useProjectStore.getState().document
    expect(doc.devices.some((device) => device.id === 'path-n1')).toBe(false)
    expect(doc.edges.some((edge) => edge.from === 'path-n1' || edge.to === 'path-n1')).toBe(false)
  })

  it('gives opposite offsets to bidirectional edges and supports independent deletion', () => {
    useProjectStore.getState().setDocument(agvScenario(2, 5))
    const edges = useProjectStore.getState().edges
    const fwd = edges.find((edge) => edge.id.includes('a-n1-fwd') || edge.id.endsWith('-fwd') && edge.source === 'station-a')
    const rev = edges.find((edge) => edge.target === 'station-a' && edge.source === 'path-n1')
    expect(fwd).toBeTruthy()
    expect(rev).toBeTruthy()
    expect(fwd?.data?.offset).not.toBe(rev?.data?.offset)
    useProjectStore.getState().setSelection(fwd!.id, 'edge')
    useProjectStore.getState().removeSelected()
    const remaining = useProjectStore.getState().document.edges
    expect(remaining.some((edge) => edge.id === fwd!.id)).toBe(false)
    expect(remaining.some((edge) => edge.from === 'path-n1' && edge.to === 'station-a')).toBe(true)
  })

  it('keeps save/load JSON round-trip compatible', () => {
    const project = agvScenario(3, 15)
    const json = exportProjectJson(project)
    const loaded = importProjectJson(json)
    expect(loaded.simulationConfig.taskCount).toBe(15)
    expect(loaded.devices).toHaveLength(project.devices.length)
    expect(loaded.edges).toHaveLength(project.edges.length)
  })

  it('splits AGV and material throughput KPIs', () => {
    const agvState = runProjectToCompletion(agvScenario(2, 10))
    expect(agvState.statistics.agvTaskThroughput).toBeGreaterThan(0)
    expect(agvState.statistics.materialThroughput).toBe(0)

    const matState = runProjectToCompletion(conveyorScenario())
    expect(matState.statistics.materialThroughput).toBeGreaterThan(0)
    expect(matState.statistics.agvTaskThroughput).toBe(0)
  })
})
