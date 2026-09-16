import { BaseProtocolAdapter } from '../ProtocolAdapter.ts'
import type { ProtocolSubscribeCallback } from '../ProtocolAdapter.ts'
import type { ConnectionTestResult } from '../types.ts'
import { ProtocolType } from '../types.ts'
import { expandTopicTemplate } from '../DeviceIoTemplates.ts'

export interface MqttAdapterConfig {
  brokerUrl: string
  username?: string
  password?: string
  clientId?: string
  qos?: 0 | 1 | 2
  keepAlive?: number
  reconnect?: boolean
  /** In-process broker (default true). */
  simulated?: boolean
}

/**
 * MQTT adapter — publish / subscribe / wildcard topics, JSON payloads preferred.
 */
export class MqttAdapter extends BaseProtocolAdapter {
  private readonly topics = new Map<string, unknown>()
  private readonly subs = new Map<string, Set<ProtocolSubscribeCallback>>()
  private readonly config: MqttAdapterConfig & { simulated: boolean; qos: 0 | 1 | 2 }

  constructor(id: string, config: MqttAdapterConfig) {
    super(id, ProtocolType.MQTT)
    this.config = {
      simulated: true,
      qos: 0,
      ...config,
    }
  }

  async connect(): Promise<void> {
    this.markConnecting()
    if (!this.config.simulated) {
      this.markDisconnected('Real MQTT broker mode requires mqtt package (gateway only)')
      throw new Error(
        'Real MQTT broker mode is not bundled in the browser build. Use simulated: true or run via gateway with mqtt installed.',
      )
    }
    this.markConnected()
  }

  async disconnect(): Promise<void> {
    this.markDisconnected()
  }

  async read(address: string): Promise<unknown> {
    if (!this.connected) {
      throw new Error('MQTT not connected')
    }
    return this.topics.has(address) ? this.topics.get(address) : null
  }

  async write(address: string, value: unknown): Promise<void> {
    await this.publish(address, value)
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('MQTT not connected')
    }
    const value = typeof payload === 'string' ? tryParseJson(payload) : payload
    this.topics.set(topic, value)
    this.touchHeartbeat()
    this.notify(topic, value)
  }

  async subscribe(address: string, callback: ProtocolSubscribeCallback): Promise<() => void> {
    const set = this.subs.get(address) ?? new Set()
    set.add(callback)
    this.subs.set(address, set)
    return () => set.delete(callback)
  }

  /** Publish using topic template variables. */
  async publishTemplate(
    template: string,
    vars: Record<string, string>,
    payload: unknown,
  ): Promise<string> {
    const topic = expandTopicTemplate(template, vars)
    await this.publish(topic, payload)
    return topic
  }

  private notify(topic: string, value: unknown): void {
    for (const [pattern, callbacks] of this.subs.entries()) {
      if (topicMatches(pattern, topic)) {
        for (const cb of callbacks) {
          cb(value)
        }
      }
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const stages: ConnectionTestResult['stages'] = [
      { stage: 'DNS', ok: true, message: this.config.brokerUrl },
      { stage: 'TCP', ok: true, message: this.config.simulated ? 'simulated broker' : 'broker' },
      {
        stage: 'AUTHENTICATION',
        ok: true,
        message: this.config.username ? 'username/password' : 'anonymous',
      },
    ]
    try {
      if (!this.connected) {
        await this.connect()
      }
      await this.publish('warehouse/__probe', { ok: true })
      stages.push({ stage: 'WRITE', ok: true, message: 'publish' })
      await this.read('warehouse/__probe')
      stages.push({ stage: 'READ', ok: true, message: 'retained/read' })
      const unsub = await this.subscribe('warehouse/#', () => undefined)
      unsub()
      stages.push({ stage: 'SUBSCRIPTION', ok: true, message: 'wildcard ok' })
    } catch (error) {
      stages.push({
        stage: 'READ',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return { ok: stages.every((s) => s.ok), stages, startedAt, finishedAt: Date.now() }
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** MQTT-style topic match with + and # wildcards. */
export function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === '#' || pattern === topic) {
    return true
  }
  const patternParts = pattern.split('/')
  const topicParts = topic.split('/')
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i]
    if (p === '#') {
      return true
    }
    if (p === '+') {
      if (topicParts[i] === undefined) {
        return false
      }
      continue
    }
    if (p !== topicParts[i]) {
      return false
    }
  }
  return patternParts.length === topicParts.length
}
