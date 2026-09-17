import type { ProjectDocument, SimulationSpeed, SimulationSnapshot } from '../types/index.ts'
import { SimulationStatus } from '../types/index.ts'
import { createEngine, SimulationEngine } from './SimulationEngine.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { buildDigitalTwinState } from '../twin/fromSnapshot.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { faultManager } from '../virtual/FaultManager.ts'
import { signalMapper } from '../signal/SignalMapper.ts'
import { VirtualAgv } from '../virtual/devices.ts'
import { AgvStatus } from '../types/index.ts'

const SYNC_MS = 100

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
      deviceRegistry.loadFromProject(project)
      faultManager.reset()
    }
    this.publish()
    return this.engine
  }

  start(project: ProjectDocument, revision: number, speed: SimulationSpeed): void {
    const mode = useDigitalTwinStore.getState().operatingMode
    if (mode === 'replay') {
      return
    }
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
    useSimulationStore.getState().setStatus(SimulationStatus.Idle)
  }

  step(project: ProjectDocument, revision: number): void {
    this.running = false
    this.stopLoop()
    const engine = this.load(project, revision)
    engine.step()
    if (engine.status === SimulationStatus.Running) {
      engine.pause()
    }
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
      this.applyFaults(target)
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

  private applyFaults(simulationTime: number): void {
    const triggered = faultManager.tick(simulationTime)
    for (const event of triggered) {
      const device = deviceRegistry.get(event.deviceId) as { injectFault?: () => void } | undefined
      device?.injectFault?.()
      const agv = this.engine?.world.agvs.get(event.deviceId)
      if (agv) {
        agv.status = AgvStatus.Fault
        this.engine?.world.record(
          simulationTime,
          agv.id,
          'agv',
          'FAULT',
          event.message,
        )
      }
    }
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
    const snapshot = this.engine.getState()
    useSimulationStore.getState().setSnapshot(snapshot)
    const twinStore = useDigitalTwinStore.getState()
    const twin = buildDigitalTwinState({
      snapshot,
      project: this.engine.project,
      world: this.engine.world,
      operatingMode: twinStore.operatingMode,
      selectedDeviceId: twinStore.highlightedDeviceId ?? twinStore.twin.selectedDeviceId,
      revision: twinStore.twin.revision + 1,
    })
    twinStore.setTwin(twin)

    // Sync virtual device mirror + signals for commissioning monitors.
    for (const device of deviceRegistry.list()) {
      signalMapper.updateFromDeviceSignals(device.deviceId, device.signals, Date.now())
    }
    for (const agv of this.engine.world.agvs.values()) {
      const virtual = deviceRegistry.get(agv.id)
      if (virtual instanceof VirtualAgv) {
        if (agv.status === AgvStatus.Fault) {
          virtual.injectFault()
        }
      }
    }
  }
}

export const simulationRuntime = new SimulationRuntime()
