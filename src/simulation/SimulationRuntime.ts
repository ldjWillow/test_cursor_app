import type { ProjectDocument, SimulationSpeed, SimulationSnapshot } from '../types/index.ts'
import { SimulationStatus } from '../types/index.ts'
import { createEngine, SimulationEngine } from './SimulationEngine.ts'
import { useSimulationStore } from '../store/simulationStore.ts'

const SYNC_MS = 80

export class SimulationRuntime {
  private engine: SimulationEngine | null = null
  private projectRevision = -1
  private raf = 0
  private lastWall = 0
  private lastSync = 0
  private running = false

  getEngine(): SimulationEngine | null {
    return this.engine
  }

  load(project: ProjectDocument, revision: number, force = false): SimulationEngine {
    if (!this.engine || force || this.projectRevision !== revision) {
      this.engine = createEngine(project)
      this.projectRevision = revision
    }
    this.publish()
    return this.engine
  }

  start(project: ProjectDocument, revision: number, speed: SimulationSpeed): void {
    const engine = this.load(project, revision)
    engine.start()
    this.running = engine.status === SimulationStatus.Running
    this.lastWall = performance.now()
    this.lastSync = 0
    this.publish()
    this.loop(speed)
  }

  pause(): void {
    this.running = false
    this.engine?.pause()
    this.stopLoop()
    this.publish()
  }

  reset(project: ProjectDocument, revision: number): void {
    this.running = false
    this.stopLoop()
    this.load(project, revision, true)
  }

  step(project: ProjectDocument, revision: number): void {
    const engine = this.load(project, revision)
    engine.step()
    this.publish()
  }

  runToEnd(project: ProjectDocument, revision: number): SimulationSnapshot {
    this.running = false
    this.stopLoop()
    const engine = this.load(project, revision, true)
    engine.runUntilEmpty()
    this.publish()
    return engine.getState()
  }

  setSpeed(speed: SimulationSpeed): void {
    if (this.running) {
      this.loop(speed)
    }
  }

  private loop(speed: SimulationSpeed): void {
    this.stopLoop()
    if (!this.running || !this.engine) {
      return
    }
    const tick = (wall: number) => {
      if (!this.running || !this.engine) {
        return
      }
      const dt = Math.min(0.1, (wall - this.lastWall) / 1000)
      this.lastWall = wall
      const target = this.engine.getCurrentTime() + dt * speed
      this.engine.runUntil(target)
      if (this.engine.queue.isEmpty) {
        this.running = false
        this.publish()
        return
      }
      if (wall - this.lastSync >= SYNC_MS) {
        this.lastSync = wall
        this.publish()
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

  private publish(): void {
    if (!this.engine) {
      return
    }
    useSimulationStore.getState().setSnapshot(this.engine.getState())
  }
}

export const simulationRuntime = new SimulationRuntime()
