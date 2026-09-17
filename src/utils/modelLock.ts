import { SimulationStatus } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'

/** Model edits only when idle and not in replay mode. */
export function isModelEditable(status?: SimulationStatus): boolean {
  const current = status ?? useSimulationStore.getState().status
  const mode = useDigitalTwinStore.getState().operatingMode
  if (mode === 'replay') {
    return false
  }
  return current === SimulationStatus.Idle
}

export function modelLockReason(): 'running' | 'paused' | 'replay' | null {
  const mode = useDigitalTwinStore.getState().operatingMode
  if (mode === 'replay') {
    return 'replay'
  }
  const status = useSimulationStore.getState().status
  if (status === SimulationStatus.Running) {
    return 'running'
  }
  if (status === SimulationStatus.Paused) {
    return 'paused'
  }
  if (status !== SimulationStatus.Idle) {
    return 'running'
  }
  return null
}

export function assertModelEditable(_action = 'edit'): boolean {
  if (!isModelEditable()) {
    useSimulationStore.getState().setError('MODEL_LOCKED')
    return false
  }
  return true
}
