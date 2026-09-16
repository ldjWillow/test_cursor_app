export interface SignalMapping {
  id: string
  source: string
  target: string
  description?: string
}

export interface MappedSignal {
  signal: string
  value: unknown
  updatedTime: number
  source: string
}

export class SignalMapper {
  private mappings: SignalMapping[] = []
  private values = new Map<string, MappedSignal>()

  setMappings(mappings: SignalMapping[]): void {
    this.mappings = mappings
  }

  getMappings(): SignalMapping[] {
    return this.mappings
  }

  updateFromDeviceSignals(deviceId: string, signals: Record<string, unknown>, now: number): void {
    for (const [key, value] of Object.entries(signals)) {
      const source = `${deviceId}.${key}`
      const mapping = this.mappings.find((item) => item.source === source)
      const signalName = mapping?.target ?? source
      this.values.set(signalName, {
        signal: signalName,
        value,
        updatedTime: now,
        source,
      })
    }
  }

  watchTable(): MappedSignal[] {
    return [...this.values.values()].sort((a, b) => a.signal.localeCompare(b.signal))
  }

  get(signal: string): MappedSignal | undefined {
    return this.values.get(signal)
  }

  reset(): void {
    this.values.clear()
  }
}

export const defaultSignalMappings: SignalMapping[] = [
  { id: 'm1', source: 'conveyor-1.running', target: 'Q_CONV01_RUNNING' },
  { id: 'm2', source: 'sensor-1.active', target: 'I_SENSOR01' },
]

export const signalMapper = new SignalMapper()
