import { SimulationStatus } from '../types/index.ts'
import { useSimulationStore } from '../store/simulationStore.ts'

/** Model edits are only allowed when simulation is idle (or after explicit stop). */
export function isModelEditable(status?: SimulationStatus): boolean {
  const current = status ?? useSimulationStore.getState().status
  return current === SimulationStatus.Idle
}

export function assertModelEditable(action = 'edit'): boolean {
  if (!isModelEditable()) {
    useSimulationStore.getState().setError(`MODEL_LOCKED:${action}`)
    return false
  }
  return true
}
