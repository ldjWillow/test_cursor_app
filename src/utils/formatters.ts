import { round } from './math.ts'

/** Unified numeric display for industrial UI. */
export function formatSeconds(value: number, digits = 1): string {
  return `${round(value, digits)} s`
}

export function formatMeters(value: number, digits = 1): string {
  return `${round(value, digits)} m`
}

export function formatSpeed(value: number, digits = 1): string {
  return `${round(value, digits)} m/s`
}

export function formatPercent(value: number, digits = 1): string {
  const pct = value <= 1 && value >= 0 ? value * 100 : value
  return `${round(pct, digits)}%`
}

export function formatThroughput(value: number, digits = 1, unit = '任务/小时'): string {
  return `${round(value, digits)} ${unit}`
}

export function formatSimClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatLatencyMs(value: number): string {
  return `${round(value, 0)} ms`
}
