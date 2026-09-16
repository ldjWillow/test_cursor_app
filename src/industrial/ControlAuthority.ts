import type { CommLostBehavior, ControlMode } from './types.ts'
import { ControlMode as CM } from './types.ts'
import { auditLog } from './AuditLog.ts'

export interface DeviceControlPolicy {
  deviceId: string
  mode: ControlMode
  onCommLost: CommLostBehavior
}

export interface AuthorityDecision {
  allowed: boolean
  reason?: string
  event?: 'CONTROL_AUTHORITY_CONFLICT'
}

/**
 * Prevent dual control: EXTERNAL devices reject INTERNAL commands and vice versa.
 */
export class ControlAuthority {
  private readonly policies = new Map<string, DeviceControlPolicy>()

  set(deviceId: string, mode: ControlMode, onCommLost: CommLostBehavior = 'SAFE_STOP'): void {
    this.policies.set(deviceId, { deviceId, mode, onCommLost })
  }

  get(deviceId: string): DeviceControlPolicy {
    return (
      this.policies.get(deviceId) ?? {
        deviceId,
        mode: CM.INTERNAL,
        onCommLost: 'SAFE_STOP',
      }
    )
  }

  list(): DeviceControlPolicy[] {
    return [...this.policies.values()]
  }

  /**
   * @param source INTERNAL | EXTERNAL | MANUAL
   */
  authorize(deviceId: string, source: ControlMode): AuthorityDecision {
    const policy = this.get(deviceId)
    if (policy.mode === CM.MANUAL) {
      if (source === CM.MANUAL) {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: `Device ${deviceId} is MANUAL; rejected ${source}`,
        event: 'CONTROL_AUTHORITY_CONFLICT',
      }
    }
    if (policy.mode === source) {
      return { allowed: true }
    }
    // INTERNAL devices accept INTERNAL; EXTERNAL accept EXTERNAL
    if (policy.mode === CM.INTERNAL && source === CM.INTERNAL) {
      return { allowed: true }
    }
    if (policy.mode === CM.EXTERNAL && source === CM.EXTERNAL) {
      return { allowed: true }
    }
    auditLog.record('CONTROL_AUTHORITY_CONFLICT', source, deviceId, `policy=${policy.mode}`)
    return {
      allowed: false,
      reason: `CONTROL_AUTHORITY_CONFLICT: device=${deviceId} mode=${policy.mode} source=${source}`,
      event: 'CONTROL_AUTHORITY_CONFLICT',
    }
  }

  clear(): void {
    this.policies.clear()
  }
}

export const controlAuthority = new ControlAuthority()
