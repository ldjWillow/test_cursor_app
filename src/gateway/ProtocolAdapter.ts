export interface ProtocolMessage {
  topic: string
  payload: unknown
  timestamp: number
}

export type ProtocolHandler = (message: ProtocolMessage) => void

/**
 * Protocol adapters isolate transport from VirtualDevice logic.
 * V0.3 ships HTTP + WebSocket; MQTT / OPC UA / Modbus are reserved stubs.
 */
export interface ProtocolAdapter {
  readonly name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(topic: string, payload: unknown): Promise<void>
  subscribe(topic: string, handler: ProtocolHandler): void
}

export class InMemoryProtocolAdapter implements ProtocolAdapter {
  readonly name = 'memory'
  private readonly handlers = new Map<string, ProtocolHandler[]>()
  private connected = false

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async send(topic: string, payload: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('Protocol adapter not connected')
    }
    const message: ProtocolMessage = { topic, payload, timestamp: Date.now() }
    for (const handler of this.handlers.get(topic) ?? []) {
      handler(message)
    }
    for (const handler of this.handlers.get('*') ?? []) {
      handler(message)
    }
  }

  subscribe(topic: string, handler: ProtocolHandler): void {
    const list = this.handlers.get(topic) ?? []
    list.push(handler)
    this.handlers.set(topic, list)
  }
}

/** Reserved for future MQTT integration. */
export class MqttProtocolAdapterStub implements ProtocolAdapter {
  readonly name = 'mqtt'
  async connect(): Promise<void> {
    throw new Error('MQTT adapter reserved for a later release')
  }
  async disconnect(): Promise<void> {}
  async send(): Promise<void> {
    throw new Error('MQTT adapter reserved for a later release')
  }
  subscribe(): void {}
}

/** Reserved for future OPC UA integration. */
export class OpcUaProtocolAdapterStub implements ProtocolAdapter {
  readonly name = 'opcua'
  async connect(): Promise<void> {
    throw new Error('OPC UA adapter reserved for a later release')
  }
  async disconnect(): Promise<void> {}
  async send(): Promise<void> {
    throw new Error('OPC UA adapter reserved for a later release')
  }
  subscribe(): void {}
}

/** Reserved for future Modbus TCP integration. */
export class ModbusProtocolAdapterStub implements ProtocolAdapter {
  readonly name = 'modbus'
  async connect(): Promise<void> {
    throw new Error('Modbus adapter reserved for a later release')
  }
  async disconnect(): Promise<void> {}
  async send(): Promise<void> {
    throw new Error('Modbus adapter reserved for a later release')
  }
  subscribe(): void {}
}
