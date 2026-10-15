import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'Runtime dependencies must remain zero')

const esm = await import('../dist/index.js')
const require = createRequire(import.meta.url)
const cjs = require('../dist/index.cjs')
for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.qrypt, 'function')
  assert.equal(typeof entry.toSVG, 'function')
  const svg = entry.toSVG(entry.qrypt('hello'))
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
}
console.log('ESM and CommonJS distribution smoke test passed.')
