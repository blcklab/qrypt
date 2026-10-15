import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'Runtime dependencies must remain zero')

const esm = await import('../dist/index.js')
const require = createRequire(import.meta.url)
const cjs = require('../dist/index.cjs')
const pngEsm = await import('../dist/png.js')
const pngCjs = require('../dist/png.cjs')
for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.qrypt, 'function')
  assert.equal(typeof entry.toSVG, 'function')
  const svg = entry.toSVG(entry.qrypt('hello'))
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
}
for (const [encoder, png] of [[esm, pngEsm], [cjs, pngCjs]]) {
  assert.equal(typeof png.toPNG, 'function')
  const bytes = png.toPNG(encoder.qrypt('hello'))
  assert.deepEqual([...bytes.subarray(0,8)], [137, 80, 78, 71, 13, 10, 26, 10])
}
assert.equal(esm.toPNG, undefined, 'Core entry must not export PNG implementation')
assert.equal(cjs.toPNG, undefined, 'CommonJS core entry must not export PNG')
console.log('ESM and CommonJS core + optional PNG distribution smoke tests passed.')
