import { describe, expect, it, afterEach } from 'vitest'
import {
  buildConnectionUrl,
  connectionErrorMessage,
  ConnectionEndpointError,
  normalizeGatewayPath,
} from '../utils/connectionEndpoint.ts'
import { useConnectionStore } from '../store/connectionStore.ts'

describe('connectionEndpoint', () => {
  const originalLocation = globalThis.location

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  function mockLocation(href: string) {
    const url = new URL(href)
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        href: url.href,
        origin: url.origin,
        protocol: url.protocol,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
      },
    })
  }

  it('defaults same-origin gateway to /gateway with https/wss on secure pages', () => {
    mockLocation('https://example.com/app/')
    const http = buildConnectionUrl({
      protocol: 'HTTP',
      transport: 'same-origin',
      host: '',
      port: 0,
      path: '/gateway',
    })
    expect(http.url).toBe('https://example.com/gateway/api/health')
    const ws = buildConnectionUrl({
      protocol: 'WebSocket',
      transport: 'same-origin',
      host: '',
      port: 0,
      path: '/gateway',
    })
    expect(ws.url).toBe('wss://example.com/gateway/ws')
  })

  it('rejects cleartext custom endpoints on HTTPS pages (mixed content)', () => {
    mockLocation('https://public.example/')
    expect(() =>
      buildConnectionUrl({
        protocol: 'HTTP',
        transport: 'custom',
        host: 'example.com',
        port: 8787,
      }),
    ).not.toThrow()
    const http = buildConnectionUrl({
      protocol: 'HTTP',
      transport: 'custom',
      host: 'example.com',
      port: 8787,
    })
    expect(http.url.startsWith('https://')).toBe(true)
    const ws = buildConnectionUrl({
      protocol: 'WebSocket',
      transport: 'custom',
      host: 'example.com',
      port: 8787,
    })
    expect(ws.url.startsWith('wss://')).toBe(true)
  })

  it('flags private network hosts from public HTTPS pages', () => {
    mockLocation('https://public.example/')
    expect(() =>
      buildConnectionUrl({
        protocol: 'HTTP',
        transport: 'custom',
        host: '127.0.0.1',
        port: 8787,
      }),
    ).toThrow(ConnectionEndpointError)
    try {
      buildConnectionUrl({
        protocol: 'WebSocket',
        transport: 'custom',
        host: '192.168.1.10',
        port: 8787,
      })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectionEndpointError)
      expect((error as ConnectionEndpointError).code).toBe('PRIVATE_NETWORK')
      expect(connectionErrorMessage('PRIVATE_NETWORK')).toContain('私有网络')
    }
  })

  it('allows cleartext only on http localhost pages', () => {
    mockLocation('http://127.0.0.1:5173/')
    const http = buildConnectionUrl({
      protocol: 'HTTP',
      transport: 'custom',
      host: '127.0.0.1',
      port: 8787,
    })
    expect(http.url).toBe('http://127.0.0.1:8787/api/health')
  })

  it('rejects unsupported browser-direct protocols', () => {
    mockLocation('https://example.com/')
    expect(() =>
      buildConnectionUrl({
        protocol: 'MQTT',
        transport: 'same-origin',
        host: '',
        port: 0,
      }),
    ).toThrow(/网关桥接|不支持/)
    expect(connectionErrorMessage('UNSUPPORTED_PROTOCOL')).toContain('不支持')
    expect(connectionErrorMessage('CORS_BLOCKED')).toContain('CORS')
    expect(connectionErrorMessage('TIMEOUT')).toContain('超时')
    expect(connectionErrorMessage('MIXED_CONTENT')).toContain('混合内容')
  })

  it('normalizes gateway paths', () => {
    expect(normalizeGatewayPath(undefined)).toBe('/gateway')
    expect(normalizeGatewayPath('gateway')).toBe('/gateway')
    expect(normalizeGatewayPath('/api/gw/')).toBe('/api/gw')
  })

  it('store defaults use same-origin /gateway instead of 127.0.0.1:8787', () => {
    const defaults = useConnectionStore.getState().connections
    expect(defaults.every((item) => item.transport === 'same-origin')).toBe(true)
    expect(defaults.every((item) => (item.path || '/gateway') === '/gateway')).toBe(true)
    expect(defaults.every((item) => item.host === '' || item.port === 0)).toBe(true)
    expect(JSON.stringify(defaults)).not.toContain('127.0.0.1')
  })
})
