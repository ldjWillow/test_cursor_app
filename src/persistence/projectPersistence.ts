import type { ProjectDocument } from '../types/index.ts'

const STORAGE_KEY = 'warehousesim.project.v1'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isProjectDocument(value: unknown): value is ProjectDocument {
  if (!isObject(value)) {
    return false
  }
  return (
    Array.isArray(value.devices) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    Array.isArray(value.tasks) &&
    isObject(value.project) &&
    isObject(value.simulationConfig)
  )
}

export function saveProject(document: ProjectDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
}

export function loadProject(): ProjectDocument | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isProjectDocument(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function exportProject(document: ProjectDocument): void {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${document.project.name.replace(/\s+/g, '-').toLowerCase()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importProject(file: File): Promise<ProjectDocument> {
  const text = await file.text()
  const parsed: unknown = JSON.parse(text)
  if (!isProjectDocument(parsed)) {
    throw new Error('Invalid WarehouseSim project JSON')
  }
  return parsed
}
