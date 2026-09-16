import type { ConnectionTestResult } from '../../industrial/types.ts'

export type { ConnectionTestResult }

/** Lightweight structural type for table rows (UI only). */
export interface ManagedConnectionLike {
  id: string
  status: string
}
