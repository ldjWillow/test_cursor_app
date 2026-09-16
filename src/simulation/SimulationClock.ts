export class SimulationClock {
  private time = 0

  get current(): number {
    return this.time
  }

  advanceTo(nextTime: number): void {
    if (nextTime < this.time) {
      throw new Error(`Clock cannot move backwards from ${this.time} to ${nextTime}`)
    }
    this.time = nextTime
  }

  reset(): void {
    this.time = 0
  }
}
