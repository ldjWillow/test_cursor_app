import type {
  ProjectDocument,
  SimulationSnapshot,
  AgvComparisonRow,
  ExperimentResult,
  ReplicationSummary,
} from '../types/index.ts'
import type { WorkerRequest, WorkerResponse } from './experimentWorker.ts'
import { nextId } from '../utils/id.ts'

type ExperimentPayload = {
  results: ExperimentResult[]
  summaries: ReplicationSummary[]
}

type WorkerPayload = Exclude<WorkerRequest, never> extends infer R
  ? R extends { id: string }
    ? Omit<R, 'id'>
    : never
  : never

let worker: Worker | null = null
let busy = false
let activeReject: ((error: Error) => void) | null = null
let activeCleanup: (() => void) | null = null
const TIMEOUT_MS = 120_000

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./experimentWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

function runTask<T>(
  request: WorkerPayload,
  onProgress?: (progress: number, message: string) => void,
): Promise<T> {
  if (busy) {
    return Promise.reject(new Error('WORKER_BUSY'))
  }
  busy = true
  const id = nextId('worker')
  const instance = getWorker()
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('WORKER_TIMEOUT'))
    }, TIMEOUT_MS)

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return
      }
      if (event.data.type === 'progress') {
        onProgress?.(event.data.progress, event.data.message)
        return
      }
      cleanup()
      if (event.data.type === 'error') {
        reject(new Error(event.data.message))
        return
      }
      resolve(event.data.result as T)
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      instance.removeEventListener('message', onMessage)
      if (activeCleanup === cleanup) {
        activeCleanup = null
        activeReject = null
      }
      busy = false
    }

    activeCleanup = cleanup
    activeReject = reject
    instance.addEventListener('message', onMessage)
    instance.postMessage({ ...request, id } as WorkerRequest)
  }).finally(() => {
    busy = false
  })
}

export function isExperimentWorkerBusy(): boolean {
  return busy
}

export function cancelExperimentWorker(): void {
  const reject = activeReject
  const cleanup = activeCleanup
  cleanup?.()
  if (worker) {
    worker.terminate()
    worker = null
  }
  busy = false
  activeReject = null
  activeCleanup = null
  reject?.(new Error('WORKER_CANCELLED'))
}

export function workerRunToEnd(
  project: ProjectDocument,
  onProgress?: (progress: number, message: string) => void,
): Promise<SimulationSnapshot> {
  return runTask({ type: 'runToEnd', project }, onProgress)
}

export function workerCompareAgvs(
  counts: number[],
  taskCount: number,
  onProgress?: (progress: number, message: string) => void,
): Promise<AgvComparisonRow[]> {
  return runTask({ type: 'compareAgvs', counts, taskCount }, onProgress)
}

export function workerRunExperiment(
  project: ProjectDocument,
  counts: number[],
  replications: number,
  seed: number,
  onProgress?: (progress: number, message: string) => void,
): Promise<ExperimentPayload> {
  return runTask({ type: 'runExperiment', project, counts, replications, seed }, onProgress)
}
