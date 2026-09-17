#!/usr/bin/env node
/**
 * Precompress dist assets to .gz / .br for serve-prod static delivery.
 */
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip, createBrotliCompress, constants as zlibConstants } from 'node:zlib'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = process.env.DIST_DIR ? join(root, process.env.DIST_DIR) : join(root, 'dist')
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.txt', '.woff', '.woff2', '.map'])
const MIN_BYTES = 1024

function walk(dir, out = []) {
  if (!existsSync(dir)) {
    return out
  }
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, out)
    } else if (st.isFile()) {
      out.push(full)
    }
  }
  return out
}

async function compressFile(filePath) {
  const ext = extname(filePath)
  if (!COMPRESSIBLE.has(ext) || filePath.endsWith('.gz') || filePath.endsWith('.br')) {
    return
  }
  const size = statSync(filePath).size
  if (size < MIN_BYTES) {
    return
  }
  await pipeline(createReadStream(filePath), createGzip({ level: 9 }), createWriteStream(`${filePath}.gz`))
  await pipeline(
    createReadStream(filePath),
    createBrotliCompress({
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
    createWriteStream(`${filePath}.br`),
  )
}

const files = walk(distDir)
let count = 0
for (const file of files) {
  await compressFile(file)
  count += 1
}
console.log(`[precompress] scanned=${files.length} dir=${distDir}`)
