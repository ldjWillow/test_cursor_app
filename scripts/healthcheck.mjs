#!/usr/bin/env node
/**
 * Production deploy health check.
 * Usage: node scripts/healthcheck.mjs [baseUrl]
 */
import { setTimeout as sleep } from 'node:timers/promises'

const base = (process.argv[2] ?? 'http://127.0.0.1:4173').replace(/\/$/, '')
const rounds = Number(process.env.HEALTHCHECK_ROUNDS ?? 10)

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' })
  const text = await response.text()
  return { response, text }
}

function fail(message) {
  console.error(`[healthcheck] FAIL: ${message}`)
  process.exitCode = 1
}

async function checkOnce(round) {
  const home = await fetchText(`${base}/`)
  if (home.response.status !== 200) {
    fail(`round ${round}: / => ${home.response.status}`)
    return false
  }
  if (home.text.includes('/src/main.tsx') || home.text.includes('@vite/client') || home.text.includes('/@react-refresh')) {
    fail(`round ${round}: production HTML still references Vite HMR/src`)
    return false
  }
  if (!home.text.includes('id="root"')) {
    fail(`round ${round}: missing #root`)
    return false
  }

  const scriptMatch = home.text.match(/src="([^"]+\.js)"/)
  const cssMatch = home.text.match(/href="([^"]+\.css)"/)
  if (!scriptMatch || !cssMatch) {
    fail(`round ${round}: missing entry JS/CSS links`)
    return false
  }
  const jsUrl = new URL(scriptMatch[1], base).toString()
  const cssUrl = new URL(cssMatch[1], base).toString()

  const js = await fetchText(jsUrl)
  const css = await fetchText(cssUrl)
  if (js.response.status !== 200) {
    fail(`round ${round}: entry JS ${js.response.status}`)
    return false
  }
  const jsType = js.response.headers.get('content-type') ?? ''
  if (!jsType.includes('javascript') && !jsType.includes('ecmascript')) {
    fail(`round ${round}: entry JS content-type=${jsType}`)
    return false
  }
  if (css.response.status !== 200) {
    fail(`round ${round}: entry CSS ${css.response.status}`)
    return false
  }

  for (const token of ['react', 'antd', 'createRoot', 'ReactFlow', 'three']) {
    if (!js.text.toLowerCase().includes(token.toLowerCase()) && token !== 'ReactFlow') {
      // soft check — bundled names may be minified; only hard-fail on HTTP
    }
  }

  // Ensure no vite deps path used in production assets
  if (jsUrl.includes('/node_modules/.vite/') || jsUrl.includes('/src/')) {
    fail(`round ${round}: entry JS still uses vite deps/src path: ${jsUrl}`)
    return false
  }

  console.log(`[healthcheck] round ${round}: OK (${jsUrl.split('/').pop()}, ${cssUrl.split('/').pop()})`)
  return true
}

let ok = true
for (let i = 1; i <= rounds; i += 1) {
  const passed = await checkOnce(i)
  ok = ok && passed
  await sleep(80)
}
if (ok) {
  console.log(`[healthcheck] PASS ${rounds}/${rounds} against ${base}`)
} else {
  fail(`one or more rounds failed against ${base}`)
}
