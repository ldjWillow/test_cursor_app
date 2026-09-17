export type ConnectionErrorCode =
  | 'MIXED_CONTENT'
  | 'PRIVATE_NETWORK'
  | 'UNSUPPORTED_PROTOCOL'
  | 'INVALID_ENDPOINT'
  | 'CORS_BLOCKED'
  | 'TIMEOUT'
  | 'GENERIC'

export type EndpointProtocol = 'HTTP' | 'WebSocket' | 'MQTT' | 'OPC UA' | 'Modbus TCP'
export type EndpointTransport = 'same-origin' | 'custom'

export interface EndpointConnInput {
  protocol: EndpointProtocol
  transport: EndpointTransport
  host: string
  port: number
  path?: string
}

export class ConnectionEndpointError extends Error {
  code: ConnectionErrorCode
  detail?: string

  constructor(code: ConnectionErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'ConnectionEndpointError'
    this.code = code
    this.detail = detail
  }
}

const BRIDGE_PROTOCOLS = new Set<EndpointProtocol>(['MQTT', 'OPC UA', 'Modbus TCP'])
const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|\[::1\]|::1)$/i

export function isBrowserSecureContext(): boolean {
  if (typeof location === 'undefined') {
    return false
  }
  return location.protocol === 'https:'
}

function isLocalhostPage(): boolean {
  if (typeof location === 'undefined') {
    return true
  }
  const host = location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}

function isPrivateHost(host: string): boolean {
  return PRIVATE_HOST_RE.test(host.trim())
}

/** Cleartext http/ws only allowed on http://localhost pages. */
function allowsCleartext(): boolean {
  if (typeof location === 'undefined') {
    return true
  }
  return location.protocol === 'http:' && isLocalhostPage()
}

export function normalizeGatewayPath(path?: string): string {
  if (!path || !path.trim()) {
    return '/gateway'
  }
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed || '/' : `/${trimmed}`
}

function assertSupportedProtocol(protocol: EndpointProtocol, transport: EndpointTransport): void {
  if (!BRIDGE_PROTOCOLS.has(protocol)) {
    return
  }
  throw new ConnectionEndpointError(
    'UNSUPPORTED_PROTOCOL',
    transport === 'same-origin'
      ? '该协议需经网关桥接，浏览器无法直连'
      : '浏览器不支持直接连接该协议，请使用网关桥接',
    protocol,
  )
}

/**
 * Build a browser-safe connection URL for HTTP / WebSocket endpoints.
 * Throws ConnectionEndpointError with a stable `code` on policy / validation failure.
 */
export function buildConnectionUrl(conn: EndpointConnInput): { url: string; display: string } {
  assertSupportedProtocol(conn.protocol, conn.transport)

  if (conn.transport === 'same-origin') {
    if (typeof location === 'undefined') {
      throw new ConnectionEndpointError('INVALID_ENDPOINT', '无法解析同源地址（非浏览器环境）')
    }
    const basePath = normalizeGatewayPath(conn.path)
    if (conn.protocol === 'HTTP') {
      const url = `${location.origin}${basePath}/api/health`
      return { url, display: url }
    }
    if (conn.protocol === 'WebSocket') {
      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${wsProto}://${location.host}${basePath}/ws`
      return { url, display: url }
    }
    throw new ConnectionEndpointError('UNSUPPORTED_PROTOCOL', '同源传输仅支持 HTTP / WebSocket', conn.protocol)
  }

  const host = (conn.host ?? '').trim()
  const port = Number(conn.port)
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new ConnectionEndpointError('INVALID_ENDPOINT', '主机或端口无效', `${host}:${conn.port}`)
  }

  if (isBrowserSecureContext() && isPrivateHost(host) && !isLocalhostPage()) {
    throw new ConnectionEndpointError(
      'PRIVATE_NETWORK',
      '公网 HTTPS 页面访问私有网络地址可能被浏览器拦截',
      host,
    )
  }

  const secureRequired = isBrowserSecureContext()

  if (conn.protocol === 'HTTP') {
    if (secureRequired) {
      const url = `https://${host}:${port}/api/health`
      return { url, display: url }
    }
    if (!allowsCleartext()) {
      throw new ConnectionEndpointError('MIXED_CONTENT', '当前页面不允许明文 HTTP 连接')
    }
    const url = `http://${host}:${port}/api/health`
    return { url, display: url }
  }

  if (conn.protocol === 'WebSocket') {
    if (secureRequired) {
      const url = `wss://${host}:${port}/ws`
      return { url, display: url }
    }
    if (!allowsCleartext()) {
      throw new ConnectionEndpointError('MIXED_CONTENT', 'HTTPS 页面禁止连接明文 WebSocket（ws://）')
    }
    const url = `ws://${host}:${port}/ws`
    return { url, display: url }
  }

  throw new ConnectionEndpointError('UNSUPPORTED_PROTOCOL', '不支持的协议', conn.protocol)
}

const ERROR_ZH: Record<ConnectionErrorCode, string> = {
  MIXED_CONTENT: '混合内容被阻止：HTTPS 页面不能连接明文 HTTP/WS 端点',
  PRIVATE_NETWORK: '私有网络访问受限：公网页面连接内网地址可能被浏览器拦截',
  UNSUPPORTED_PROTOCOL: '当前浏览器不支持该协议直连，请通过网关桥接',
  INVALID_ENDPOINT: '连接地址无效，请检查主机、端口或路径',
  CORS_BLOCKED: '跨域请求被阻止（CORS），请使用同源网关代理',
  TIMEOUT: '连接超时，请确认网关已启动且地址正确',
  GENERIC: '连接失败，请稍后重试',
}

/** Map error codes to Chinese UI strings (UI may also t() the code via locale keys). */
export function connectionErrorMessage(code: ConnectionErrorCode | string, detail?: string): string {
  const base = ERROR_ZH[code as ConnectionErrorCode] ?? ERROR_ZH.GENERIC
  if (detail && detail.trim()) {
    return `${base}（${detail}）`
  }
  return base
}

/** Safe display string for tables; falls back to transport description on error. */
export function connectionEndpointDisplay(conn: EndpointConnInput): string {
  try {
    return buildConnectionUrl(conn).display
  } catch (error) {
    if (conn.transport === 'same-origin') {
      return `${normalizeGatewayPath(conn.path)}（同源）`
    }
    if (error instanceof ConnectionEndpointError) {
      return connectionErrorMessage(error.code, error.detail)
    }
    return `${conn.host || '-'}:${conn.port || '-'}`
  }
}
