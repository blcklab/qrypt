import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { qrypt, toSVG } from '../.m14-check/index.js'
import { toPNG } from '../.m14-check/png.js'
import { toStyledSVG, toStyledPixels, toStyledPNG } from '../.m14-check/styled.js'

const qr = qrypt('QRYPT M14 STYLING', { errorCorrectionLevel: 'H' })
const signature = [137,80,78,71,13,10,26,10]
function readRGBA(bytes) {
  assert.deepEqual([...bytes.slice(0, 8)], signature)
  let offset = 8
  let width = 0, height = 0, color = -1, raw
  while (offset < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const length = view.getUint32(0)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') { width = new DataView(data.buffer, data.byteOffset).getUint32(0); height = new DataView(data.buffer, data.byteOffset).getUint32(4); color = data[9] }
    if (type === 'IDAT') raw = inflateSync(data)
    offset += 12 + length
  }
  assert.equal(color, 6)
  assert.equal(raw.length, height * (1 + width * 4))
  return { width, height, raw }
}

test('square / rounded / dot shapes are separate and deterministic', () => {
  const baseline = toStyledSVG(qr)
  assert.match(baseline, /<svg/)
  assert.equal(toStyledSVG(qr), baseline)
  assert.notEqual(toStyledSVG(qr, { moduleShape: 'dot' }), baseline)
  assert.match(toStyledSVG(qr, { moduleShape: 'dot' }), /<circle/)
  assert.match(toStyledSVG(qr, { moduleShape: 'rounded' }), /rx="0.22"/)
  assert.match(toStyledSVG(qr, { finderStyle: 'rounded' }), /rx="0.85"/)
})
test('classic finder/timing/alignment patterns survive dot styling at module centers', () => {
  const qr7 = qrypt('HELLO', { version: 7 })
  const image = toStyledPixels(qr7, { moduleShape: 'dot', scale: 4 })
  const matrix = qr7.matrix()
  for (let y = 0; y < qr7.size; y++) for (let x = 0; x < qr7.size; x++) {
    const ix = (4 + x) * 4 + 2, iy = (4 + y) * 4 + 2
    const offset = (iy * image.width + ix) * 4
    assert.equal(image.data[offset], matrix[y][x] ? 0 : 255)
  }
})
test('quiet zone is four light modules and image dimensions are correct', () => {
  const image = toStyledPixels(qr, { scale: 3 })
  assert.equal(image.width, (qr.size + 8) * 3)
  assert.deepEqual([...image.data.subarray(0, 4)], [255,255,255,255])
  assert.deepEqual([...image.data.subarray((4*3*image.width + 4*3)*4, (4*3*image.width+4*3)*4+4)], [0,0,0,255])
})
test('gradient colors render on both SVG and RGBA with valid geometry', () => {
  const options = { moduleShape:'rounded', gradient: {from:'#111111',to:'#123B65',direction:'horizontal'}, scale:4 }
  const svg = toStyledSVG(qr, options)
  assert.match(svg, /linearGradient/)
  assert.match(svg, /stop-color="#111111"/)
  assert.match(svg, /stop-color="#123b65"/)
  const other = toStyledSVG(qr, { ...options, gradient: {...options.gradient, direction:'vertical'} })
  assert.notEqual(svg, other)
  const image = toStyledPixels(qr, options)
  assert.equal(image.width, (qr.size + 8)*4)
  assert.ok(image.data.some((v, index) => index%4===0 && v!==0 && v!==255))
})
test('PNG decodes to exactly the raw pixels, with solid alpha', () => {
  const opts = { moduleShape:'rounded', finderStyle:'rounded', scale:5, gradient:{from:'#000000',to:'#15395c'} }
  const expected = toStyledPixels(qr, opts)
  const parsed = readRGBA(toStyledPNG(qr, opts))
  assert.equal(parsed.width, expected.width)
  assert.equal(parsed.height, expected.height)
  for (let y=0; y<expected.height; y++) {
    assert.equal(parsed.raw[y*(1+parsed.width*4)], 0)
    assert.deepEqual([...parsed.raw.subarray(y*(1+parsed.width*4)+1,(y+1)*(1+parsed.width*4))], [...expected.data.subarray(y*parsed.width*4,(y+1)*parsed.width*4)])
  }
})
test('legacy SVG and opaque indexed PNG unchanged and no mutation of matrix', () => {
  const before = toSVG(qr), png = toPNG(qr)
  const matrix = qr.matrix()
  toStyledSVG(qr,{moduleShape:'dot'});toStyledPNG(qr,{moduleShape:'rounded'})
  assert.equal(toSVG(qr), before)
  assert.deepEqual(toPNG(qr), png)
  assert.deepEqual(qr.matrix(), matrix)
})
test('unsafe styling, invalid dimensions and low contrast rejected', () => {
  const bad = [
    {moduleShape:'<script>'}, {finderStyle:'triangle'}, {darkColor:'red'},
    {gradient: {from:'#000000',to:'url(javascript:alert(1))'}},
    {gradient:{from:'#111111',to:'#222222',direction:'diagonal'}},
    {gradient:{from:'#000000',to:'#000000',id:'evil'}},
    {darkColor:'#ffffff'}, {darkColor:'#808080'},
    {lightColor:'#000000'}, {moduleShape:'dot', unknown:1},
    {gradient:{from:'#000000',to:'#111111'},darkColor:'#000000'},
    {margin: 2**52}, {scale:0}, {scale:2**52},
  ]
  for (const options of bad) {
    assert.throws(() => toStyledSVG(qr, options), undefined, JSON.stringify(options))
    assert.throws(() => toStyledPixels(qr, options), undefined, JSON.stringify(options))
  }
  assert.throws(() => toStyledPNG(qr, {scale:8192}), /dimension|budget/i)
})
