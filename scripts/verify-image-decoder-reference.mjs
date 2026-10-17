/** Inspect independently generated raw grayscale QR images from Python. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodePixels } from '../.m17-check/decode.js'

const manifestPath = process.argv[2]
if (!manifestPath) throw new Error('Expected a JSON reference-fixture manifest path.')
const fixtures = JSON.parse(readFileSync(manifestPath, 'utf8'))
let passing = 0
for (const item of fixtures) {
  const data = readFileSync(item.file)
  const result = decodePixels({width:item.width,height:item.height,data,format:'gray'})
  assert.equal(result?.text,item.text,`Independent image decode failed: ${item.label}`)
  assert.equal(result?.version,item.version,`Wrong version: ${item.label}`)
  passing++
}
console.log(`Independent Python QR images decoded: ${passing}/${fixtures.length}.`)
