import type { SimulationLogEntry } from '../types/index.ts'

export interface ReplayFrame {
  time: number
  entries: SimulationLogEntry[]
}

export class ReplayEngine {
  private entries: SimulationLogEntry[] = []
  private index = 0
  private playing = false
  private speed = 1
  private currentTime = 0

  load(entries: SimulationLogEntry[]): void {
    this.entries = [...entries].sort((a, b) => a.simulationTime - b.simulationTime)
    this.index = 0
    this.currentTime = this.entries[0]?.simulationTime ?? 0
    this.playing = false
  }

  play(speed = 1): void {
    this.playing = true
    this.speed = speed
  }

  pause(): void {
    this.playing = false
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }

  seek(time: number): void {
    this.currentTime = time
    this.index = this.entries.findIndex((entry) => entry.simulationTime >= time)
    if (this.index < 0) {
      this.index = this.entries.length
    }
  }

  /** Advance wall-clock dt seconds of replay. */
  tick(dtSeconds: number): SimulationLogEntry[] {
    if (!this.playing || this.entries.length === 0) {
      return []
    }
    const target = this.currentTime + dtSeconds * this.speed
    const emitted: SimulationLogEntry[] = []
    while (this.index < this.entries.length) {
      const entry = this.entries[this.index]
      if (!entry || entry.simulationTime > target) {
        break
      }
      emitted.push(entry)
      this.index += 1
    }
    this.currentTime = target
    if (this.index >= this.entries.length) {
      this.playing = false
    }
    return emitted
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  isPlaying(): boolean {
    return this.playing
  }

  getSpeed(): number {
    return this.speed
  }

  getEntries(): SimulationLogEntry[] {
    return this.entries
  }
}

export const replayEngine = new ReplayEngine()
