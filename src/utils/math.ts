export function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${String(value)}`)
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.hypot(dx, dy)
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
