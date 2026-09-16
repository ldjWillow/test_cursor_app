let sequence = 0

export function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${sequence}`
}

export function resetIdSequence(): void {
  sequence = 0
}

export function createUuid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  sequence += 1
  return `${prefix}-${sequence}-${Math.floor(Math.random() * 1_000_000)}`
}
