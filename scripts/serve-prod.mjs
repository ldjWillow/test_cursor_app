#!/usr/bin/env node
/**
 * Production static server for `dist` with gzip compression and /gateway proxy.
 * Usage: node scripts/serve-prod.mjs
 * Env: PORT (default 4173), GATEWAY_URL (default http://127.0.0.1:8787), DIST_DIR
 */
import compression from 'compression'
import express from 'express'
import { createReadStream, existsSync, statSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = process.env.DIST_DIR ? join(root, process.env.DIST_DIR) : join(root, 'dist')
const port = Number(process.env.PORT ?? 4173)
const gatewayUrl = (process.env.GATEWAY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')

const app = express()
app.disable('x-powered-by')
app.use(compression())

function sendPrecompressed(req, res, filePath) {
  const accept = String(req.headers['accept-encoding'] || '')
  const brPath = `${filePath}.br`
  const gzPath = `${filePath}.gz`
  if (accept.includes('br') && existsSync(brPath)) {
    res.setHeader('Content-Encoding', 'br')
    res.setHeader('Vary', 'Accept-Encoding')
    createReadStream(brPath).pipe(res)
    return true
  }
  if (accept.includes('gzip') && existsSync(gzPath)) {
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Vary', 'Accept-Encoding')
    createReadStream(gzPath).pipe(res)
    return true
  }
  return false
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/assets/')) {
    return next()
  }
  const filePath = join(distDir, req.path)
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return next()
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('Content-Type', mime[extname(filePath)] || 'application/octet-stream')
  if (sendPrecompressed(req, res, filePath)) {
    return
  }
  createReadStream(filePath).pipe(res)
})

app.use(
  express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }),
)

function proxyHttp(req, res, targetPath) {
  const target = new URL(gatewayUrl)
  const isTls = target.protocol === 'https:'
  const lib = isTls ? https : http
  const headers = { ...req.headers, host: target.host }
  delete headers['content-length']
  const proxyReq = lib.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isTls ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', (error) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'gateway_unreachable', detail: String(error.message || error) })
    } else {
      res.end()
    }
  })
  req.pipe(proxyReq)
}

app.use('/gateway', (req, res) => {
  // Mount strips `/gateway`; forward remaining path to gateway root.
  const targetPath = req.url || '/'
  proxyHttp(req, res, targetPath)
})

app.use((req, res) => {
  const indexPath = join(distDir, 'index.html')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (sendPrecompressed(req, res, indexPath)) {
    return
  }
  res.sendFile(indexPath)
})

const server = http.createServer(app)

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/gateway')) {
    socket.destroy()
    return
  }
  const target = new URL(gatewayUrl)
  const path = req.url.replace(/^\/gateway/, '') || '/'
  const isTls = target.protocol === 'https:'
  const lib = isTls ? https : http
  const headers = { ...req.headers, host: target.host }
  const proxyReq = lib.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isTls ? 443 : 80),
    path,
    method: 'GET',
    headers,
  })
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const headerLines = Object.entries(proxyRes.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headerLines}\r\n\r\n`)
    if (proxyHead?.length) {
      socket.write(proxyHead)
    }
    if (head?.length) {
      proxySocket.write(head)
    }
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
  })
  proxyReq.on('error', () => {
    socket.destroy()
  })
  proxyReq.end()
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[serve-prod] dist=${distDir}`)
  console.log(`[serve-prod] http://127.0.0.1:${port}`)
  console.log(`[serve-prod] gateway proxy -> ${gatewayUrl}`)
})
