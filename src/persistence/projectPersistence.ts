import type { ProjectDocument } from '../types/index.ts'
import { ensureSchemaVersion, migrateProject } from './migrate.ts'

const STORAGE_KEY = 'warehousesim.project.v2'
const LEGACY_STORAGE_KEY = 'warehousesim.project.v1'

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
  const normalized = ensureSchemaVersion(document)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}

export function loadProject(): ProjectDocument | undefined {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isProjectDocument(parsed)) {
      return undefined
    }
    return migrateProject(parsed)
  } catch {
    return undefined
  }
}

export function exportProject(document: ProjectDocument): void {
  const normalized = ensureSchemaVersion(document)
  const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${normalized.project.name.replace(/\s+/g, '-').toLowerCase()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportProjectJson(document: ProjectDocument): string {
  return JSON.stringify(ensureSchemaVersion(document), null, 2)
}

export function importProjectJson(text: string): ProjectDocument {
  const parsed: unknown = JSON.parse(text)
  if (!isProjectDocument(parsed)) {
    throw new Error('Invalid WarehouseSim project JSON')
  }
  return migrateProject(parsed)
}

export async function importProject(file: File): Promise<ProjectDocument> {
  return importProjectJson(await file.text())
}
