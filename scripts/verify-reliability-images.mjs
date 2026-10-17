/** Check independent Python-generated raw grayscale QR images with the M20 decoder. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodePixels } from '../.m20-check/decode.js'

if (!process.argv[2]) throw new Error('Expected a JSON fixture manifest.')
const fixtures = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let passed = 0
for (const item of fixtures) {
  const bytes = readFileSync(item.file)
  const before = Buffer.from(bytes)
  const decoded = decodePixels({width:item.width,height:item.height,data:bytes,format:'gray'})
  assert.equal(decoded?.text, item.text, `${item.label} payload`)
  assert.equal(decoded.version,item.version,`${item.label} version`)
  assert.deepEqual(bytes,before,`${item.label} read-only input`)
  passed++
}
console.log(`M20 independent stress images: ${passed}/${fixtures.length} passed.`)
