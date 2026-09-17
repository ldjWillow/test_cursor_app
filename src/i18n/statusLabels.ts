import type { TFunction } from 'i18next'
import { SimulationStatus } from '../types/index.ts'

/** Unified status label map — never translate statuses ad-hoc in components. */
export function simulationStatusLabel(status: SimulationStatus | string, t: TFunction): string {
  switch (status) {
    case SimulationStatus.Idle:
    case 'idle':
      return t('status.simulation.idle')
    case SimulationStatus.Running:
    case 'running':
      return t('status.simulation.running')
    case SimulationStatus.Paused:
    case 'paused':
      return t('status.simulation.paused')
    case SimulationStatus.Completed:
    case 'completed':
      return t('status.simulation.completed')
    default:
      return t('status.simulation.error')
  }
}

export function agvStatusLabel(status: string, t: TFunction): string {
  const key = `status.agv.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

export function deviceStatusLabel(status: string, t: TFunction): string {
  const key = `status.device.${status}`
  const translated = t(key)
  if (translated !== key) {
    return translated
  }
  return agvStatusLabel(status, t)
}

export function operatingModeLabel(mode: string, t: TFunction): string {
  const key = `status.operatingMode.${mode}`
  const translated = t(key)
  return translated === key ? mode : translated
}

export function viewModeLabel(mode: string, t: TFunction): string {
  const key = `status.viewMode.${mode}`
  const translated = t(key)
  return translated === key ? mode : translated
}

export function commandStatusLabel(status: string, t: TFunction): string {
  const key = `status.command.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

export function deviceTypeLabel(type: string, t: TFunction): string {
  const map: Record<string, string> = {
    source: 'deviceLibrary.source',
    sink: 'deviceLibrary.sink',
    station: 'deviceLibrary.station',
    conveyor: 'deviceLibrary.conveyor',
    agv: 'deviceLibrary.agv',
    rack: 'deviceLibrary.rack',
    stacker: 'deviceLibrary.stacker',
    charger: 'deviceLibrary.charger',
    'path-node': 'deviceLibrary.pathNode',
  }
  const key = map[type]
  return key ? t(key) : type
}

export function eventTypeLabel(eventType: string, t: TFunction): string {
  const key = `eventType.${eventType}`
  const translated = t(key)
  return translated === key ? eventType : translated
}

export function translateValidationMessage(
  issue: { code: string; message: string; entityId?: string },
  t: TFunction,
): string {
  const key = `validation.${issue.code}`
  const translated = t(key, { name: issue.entityId ?? '', id: issue.entityId ?? '', from: '', to: '' })
  // If message embeds names, prefer structured translation when key exists.
  if (translated !== key) {
    // For parameterized English messages, fall back to parsing common patterns.
    if (issue.code === 'ISOLATED_NODE') {
      const name = issue.message.replace(/^Isolated path node:\s*/, '')
      return t(key, { name })
    }
    if (issue.code === 'INVALID_SPEED' || issue.code === 'INVALID_CAPACITY' || issue.code === 'INVALID_SPEED_STACKER') {
      const name = issue.message.split(' ')[0] ?? issue.entityId ?? ''
      return t(key, { name })
    }
    if (issue.code === 'UNREACHABLE_PATH') {
      const match = issue.message.match(/from (.+) to (.+)/i)
      return t(key, { from: match?.[1] ?? '', to: match?.[2] ?? '' })
    }
    if (issue.code === 'EDGE_FROM_MISSING' || issue.code === 'EDGE_TO_MISSING') {
      return t(key, { id: issue.entityId ?? '' })
    }
    return translated
  }
  return issue.message
}

export function translateBottleneckReason(reason: string, t: TFunction): string {
  const util = reason.match(/^Utilization:\s*([\d.]+)%/)
  if (util) {
    return t('bottleneck.utilization', { value: util[1] })
  }
  const queue = reason.match(/^Average Queue:\s*([\d.]+)/)
  if (queue) {
    return t('bottleneck.averageQueue', { value: queue[1] })
  }
  const route = reason.match(/^Route Waiting:\s*([\d.]+)s/)
  if (route) {
    return t('bottleneck.routeWaiting', { value: route[1] })
  }
  return reason
}
