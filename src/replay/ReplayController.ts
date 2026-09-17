import type { SimulationLogEntry, SimulationSnapshot } from '../types/index.ts'
import { SimulationStatus } from '../types/index.ts'
import { replayEngine } from './ReplayEngine.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { buildDigitalTwinState } from '../twin/fromSnapshot.ts'
import { useProjectStore } from '../store/projectStore.ts'
import { emptyStatistics } from '../store/emptyStatistics.ts'

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'finished'

/**
 * Drives ReplayEngine.tick via rAF and publishes twin/snapshot updates.
 */
export class ReplayController {
  private raf = 0
  private lastWall = 0
  private status: ReplayStatus = 'idle'
  private baseSnapshot: SimulationSnapshot | null = null
  private applied: SimulationLogEntry[] = []

  getStatus(): ReplayStatus {
    return this.status
  }

  getCurrentTime(): number {
    return replayEngine.getCurrentTime()
  }

  getDuration(): number {
    const entries = replayEngine.getEntries()
    return entries[entries.length - 1]?.simulationTime ?? 0
  }

  hasEntries(): boolean {
    return replayEngine.getEntries().length > 0
  }

  loadFromSnapshot(snapshot: SimulationSnapshot): boolean {
    this.stopLoop()
    this.applied = []
    this.baseSnapshot = structuredClone(snapshot)
    replayEngine.load(snapshot.eventLog)
    this.status = 'idle'
    this.publishFrame([])
    return snapshot.eventLog.length > 0
  }

  play(speed?: number): void {
    if (!this.hasEntries()) {
      return
    }
    if (speed !== undefined) {
      replayEngine.setSpeed(speed)
    }
    if (this.status === 'finished') {
      this.seek(0)
    }
    replayEngine.play(replayEngine.getSpeed())
    this.status = 'playing'
    this.lastWall = performance.now()
    this.loop()
  }

  pause(): void {
    replayEngine.pause()
    this.status = this.hasEntries() ? 'paused' : 'idle'
    this.stopLoop()
  }

  stop(): void {
    this.pause()
    this.seek(0)
    this.status = 'idle'
  }

  step(): void {
    if (!this.hasEntries()) {
      return
    }
    const entries = replayEngine.getEntries()
    const next = entries.find((entry) => entry.simulationTime > replayEngine.getCurrentTime())
    if (!next) {
      this.status = 'finished'
      return
    }
    this.seek(next.simulationTime)
    const emitted = entries.filter(
      (entry) => entry.simulationTime <= next.simulationTime && !this.applied.some((item) => item.id === entry.id),
    )
    this.applied.push(...emitted)
    this.publishFrame(emitted)
    this.status = 'paused'
  }

  seek(time: number): void {
    replayEngine.seek(time)
    const entries = replayEngine.getEntries().filter((entry) => entry.simulationTime <= time)
    this.applied = entries
    this.publishFrame([])
    if (time >= this.getDuration() && this.getDuration() > 0) {
      this.status = 'finished'
      replayEngine.pause()
    } else if (this.status === 'finished') {
      this.status = 'paused'
    }
  }

  setSpeed(speed: number): void {
    replayEngine.setSpeed(speed)
    if (this.status === 'playing') {
      this.loop()
    }
  }

  dispose(): void {
    this.pause()
    this.applied = []
    this.baseSnapshot = null
  }

  private loop(): void {
    this.stopLoop()
    if (this.status !== 'playing') {
      return
    }
    const tick = (wall: number) => {
      if (this.status !== 'playing') {
        return
      }
      const dt = Math.min(0.1, (wall - this.lastWall) / 1000)
      this.lastWall = wall
      const emitted = replayEngine.tick(dt)
      if (emitted.length > 0) {
        this.applied.push(...emitted)
        this.publishFrame(emitted)
      } else {
        this.publishFrame([])
      }
      if (!replayEngine.isPlaying()) {
        this.status = 'finished'
        this.stopLoop()
        return
      }
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private publishFrame(latest: SimulationLogEntry[]): void {
    const time = replayEngine.getCurrentTime()
    const base = this.baseSnapshot
    const eventLog = this.applied
    const snapshot: SimulationSnapshot = {
      time,
      status: this.status === 'playing' ? SimulationStatus.Running : SimulationStatus.Paused,
      eventQueue: [],
      waitingTasks: base?.waitingTasks ?? 0,
      runningTasks: base?.runningTasks ?? 0,
      completedTasks: base?.completedTasks ?? 0,
      failedTasks: base?.failedTasks ?? 0,
      devices: base?.devices ?? [],
      statistics: base?.statistics ?? emptyStatistics(),
      logs: latest.map((entry) => entry.message),
      eventLog,
    }
    useSimulationStore.getState().setSnapshot(snapshot)
    const twinStore = useDigitalTwinStore.getState()
    const project = useProjectStore.getState().document
    twinStore.setOperatingMode('replay')
    twinStore.setTwin(
      buildDigitalTwinState({
        snapshot,
        project,
        operatingMode: 'replay',
        selectedDeviceId: twinStore.highlightedDeviceId ?? twinStore.twin.selectedDeviceId,
        revision: twinStore.twin.revision + 1,
      }),
    )
    if (latest[0]?.entityId) {
      twinStore.selectDevice(latest[0].entityId)
      useProjectStore.getState().setSelection(latest[0].entityId, 'device')
    }
  }
}

export const replayController = new ReplayController()
