import type { ProjectDocument, SimulationSpeed, SimulationSnapshot } from '../types/index.ts'
import { SimulationStatus } from '../types/index.ts'
import { createEngine, SimulationEngine } from './SimulationEngine.ts'
import { useSimulationStore } from '../store/simulationStore.ts'

/** UI snapshot publish rate (Hz). Sim kernel advances independently. */
const SYNC_HZ = 10
const SYNC_MS = 1000 / SYNC_HZ
/** Cap a single catch-up window so a backgrounded tab does not freeze the UI. */
const MAX_WALL_CATCHUP_S = 0.25

/**
 * SimulationRuntime decouples discrete-event advance from React rendering.
 *
 * Speed semantics: over wall-clock Δt the engine targets Δt * speed simulation
 * seconds and fully drains events up to that target (batched). UI publishes are
 * throttled to ~10Hz so high multipliers stay monotonically faster.
 *
 * Step semantics: process exactly one discrete event (next in the priority queue).
 * Pause: stops the pump; no further time advance or event processing until Start.
 * Reset: rebuilds the engine from the latest project revision.
 */
export class SimulationRuntime {
  private engine: SimulationEngine | null = null
  private projectRevision = -1
  private simulationRevision = 0
  private raf = 0
  private lastWall = 0
  private lastSync = 0
  private running = false
  private currentSpeed: SimulationSpeed = 10

  getEngine(): SimulationEngine | null {
    return this.engine
  }

  getSimulationRevision(): number {
    return this.simulationRevision
  }

  load(project: ProjectDocument, revision: number, force = false): SimulationEngine {
    if (!this.engine || force || this.projectRevision !== revision) {
      this.engine = createEngine(project)
      this.projectRevision = revision
      this.simulationRevision += 1
      useSimulationStore.getState().setSimulationRevision(this.simulationRevision)
      useSimulationStore.getState().clearStaleResults(false)
    }
    this.publish()
    return this.engine
  }

  start(project: ProjectDocument, revision: number, speed: SimulationSpeed): void {
    const engine = this.load(project, revision)
    engine.start()
    this.running = engine.status === SimulationStatus.Running
    this.currentSpeed = speed
    this.lastWall = performance.now()
    this.lastSync = 0
    this.publish()
    this.loop()
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

  /**
   * Step: process exactly one discrete event (the next queued event).
   * Same-timestamp groups are processed one at a time across successive Steps.
   */
  step(project: ProjectDocument, revision: number): void {
    if (this.running) {
      this.pause()
    }
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
    this.currentSpeed = speed
    if (this.running) {
      this.lastWall = performance.now()
      this.loop()
    }
  }

  /**
   * Advance simulation as if `wallSeconds` of wall clock elapsed at `speed`.
   * Used by tests to verify speed monotonicity without RAF.
   */
  advanceWallClock(wallSeconds: number, speed: SimulationSpeed = this.currentSpeed): number {
    if (!this.engine || !this.running) {
      return 0
    }
    const before = this.engine.getCurrentTime()
    const target = before + Math.max(0, wallSeconds) * speed
    this.engine.runUntil(target)
    if (this.engine.queue.isEmpty) {
      this.running = false
    }
    return this.engine.getCurrentTime() - before
  }

  /** Test helper: mark running without RAF so advanceWallClock works. */
  armForTest(project: ProjectDocument, revision: number): SimulationEngine {
    const engine = this.load(project, revision, true)
    engine.start()
    this.running = engine.status === SimulationStatus.Running
    this.lastWall = 0
    return engine
  }

  private loop(): void {
    this.stopLoop()
    if (!this.running || !this.engine) {
      return
    }
    const tick = (wall: number) => {
      if (!this.running || !this.engine) {
        return
      }
      const dt = Math.min(MAX_WALL_CATCHUP_S, Math.max(0, (wall - this.lastWall) / 1000))
      this.lastWall = wall
      // Fully catch up to wall*speed — no per-event React updates.
      const target = this.engine.getCurrentTime() + dt * this.currentSpeed
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
