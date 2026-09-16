export type ScanTickHandler = (scanTime: number, cycle: number) => void | Promise<void>

/**
 * Simple PLC scan simulation (not µs PLC runtime).
 * scanInterval: 10 / 20 / 50 / 100 ms
 */
export class PlcScanSimulator {
  private intervalMs = 50
  private timer: ReturnType<typeof setInterval> | undefined
  private cycle = 0
  private running = false
  private handlers: ScanTickHandler[] = []

  setIntervalMs(ms: 10 | 20 | 50 | 100): void {
    this.intervalMs = ms
    if (this.running) {
      this.stop()
      this.start()
    }
  }

  getIntervalMs(): number {
    return this.intervalMs
  }

  onTick(handler: ScanTickHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.timer = setInterval(() => {
      this.cycle += 1
      const scanTime = Date.now()
      for (const handler of this.handlers) {
        void handler(scanTime, this.cycle)
      }
    }, this.intervalMs)
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  getCycle(): number {
    return this.cycle
  }

  isRunning(): boolean {
    return this.running
  }

  /** Deterministic single tick for tests. */
  async tickOnce(): Promise<void> {
    this.cycle += 1
    const scanTime = Date.now()
    for (const handler of this.handlers) {
      await handler(scanTime, this.cycle)
    }
  }
}

export const plcScanSimulator = new PlcScanSimulator()
