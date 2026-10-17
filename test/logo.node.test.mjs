import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { qrypt, toSVG } from '../.m15-check/index.js'
import { toPNG } from '../.m15-check/png.js'
import { toStyledSVG, toStyledPixels } from '../.m15-check/styled.js'
import { toLogoPixels, toLogoPNG, toLogoSVG } from '../.m15-check/logo.js'
import { createFunctionPatterns } from '../.m15-check/matrix/patterns.js'

const logo = { width: 3, height: 2, data: new Uint8ClampedArray([
  0,0,0,255, 0,0,0,0, 10,20,30,255,
  200,30,40,220, 0,0,0,255, 255,255,255,255,
]) }
const qr = qrypt('M15 BRANDED QRYPT', { errorCorrectionLevel: 'H' })

function unpackPNG(bytes) {
  const signature = [137,80,78,71,13,10,26,10]
  assert.deepEqual([...bytes.subarray(0, 8)], signature)
  let offset = 8, width, height, type, raw
  while (offset < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const length = view.getUint32(0)
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const chunk = bytes.subarray(offset + 8, offset + 8 + length)
    if (name === 'IHDR') {
      width = new DataView(chunk.buffer, chunk.byteOffset).getUint32(0)
      height = new DataView(chunk.buffer, chunk.byteOffset).getUint32(4)
      type = chunk[9]
    }
    if (name === 'IDAT') raw = inflateSync(chunk)
    offset += 12 + length
  }
  return {width,height,type,raw}
}

test('creates portable branded RGBA, embedded PNG SVG, and PNG output', () => {
  const opts = {scale:8, moduleShape:'rounded'}
  const pixels = toLogoPixels(qr, logo, opts)
  const svg = toLogoSVG(qr, logo, opts)
  assert.equal(pixels.width, (qr.size + 8) * 8)
  assert.match(svg, /<image /)
  assert.match(svg, /href="data:image\/png;base64,[A-Za-z0-9+/=]+"/)
  assert.doesNotMatch(svg, /<script|foreignObject|href="https?:\/\//)
  const packed = unpackPNG(toLogoPNG(qr, logo, opts))
  assert.equal(packed.type, 6)
  assert.equal(packed.width, pixels.width)
  assert.equal(packed.height, pixels.height)
  for (let row = 0; row < packed.height; row++) {
    const start = row * (packed.width * 4 + 1)
    assert.equal(packed.raw[start], 0)
    assert.deepEqual(packed.raw.subarray(start + 1, start + 1 + packed.width * 4),
      Buffer.from(pixels.data.subarray(row * packed.width * 4, (row + 1) * packed.width * 4)))
  }
})

test('does not mutate QR or legacy SVG, PNG or styled output', () => {
  const matrix = qr.matrix()
  const basicSVG = toSVG(qr)
  const basicPNG = toPNG(qr)
  const styledSVG = toStyledSVG(qr, { moduleShape:'dot' })
  toLogoPixels(qr, logo, {moduleShape:'dot'})
  toLogoSVG(qr, logo, {moduleShape:'dot'})
  assert.deepEqual(qr.matrix(), matrix)
  assert.equal(toSVG(qr), basicSVG)
  assert.deepEqual(toPNG(qr), basicPNG)
  assert.equal(toStyledSVG(qr, {moduleShape:'dot'}), styledSVG)
})

test('preserves every function-module pixel even with centered placement', () => {
  for (const version of [1,2,4,7,10,20,40]) {
    const q = qrypt('SAFE LOGO', { version, errorCorrectionLevel:'H' })
    const base = toStyledPixels(q, {scale:2})
    const image = toLogoPixels(q,logo,{scale:2})
    const reserved = createFunctionPatterns(version,'H').reserved
    for (let y=0; y<q.size; y++) for (let x=0; x<q.size; x++) {
      if (!reserved[y*q.size+x]) continue
      for (let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++){
        const yy=(y+4)*2+dy,xx=(x+4)*2+dx, offset=(yy*image.width+xx)*4
        assert.deepEqual(image.data.subarray(offset,offset+4),base.data.subarray(offset,offset+4),`Reserved changed at v${version} (${x},${y})`)
      }
    }
  }
})

test('preserves source aspect ratio and composites transparency over light background', () => {
  const q = qrypt('SAMPLE', { errorCorrectionLevel:'H', version:3 })
  const pixels = toLogoPixels(q, logo, { scale:6, logoSize:4, logoPadding:1 })
  const plain = toStyledPixels(q, {scale:6})
  assert.notDeepEqual(pixels.data, plain.data)
  assert.deepEqual([...pixels.data.subarray(0,4)], [255,255,255,255])
  for (let p=3;p<pixels.data.length;p+=4) assert.equal(pixels.data[p],255)
})

test('determinism across supported style and PNG paths', () => {
  const opts = {moduleShape:'dot',finderStyle:'rounded',gradient:{from:'#101010',to:'#174063'},scale:5}
  assert.equal(toLogoSVG(qr,logo,opts),toLogoSVG(qr,logo,opts))
  assert.deepEqual(toLogoPNG(qr,logo,opts),toLogoPNG(qr,logo,opts))
})

test('rejects low ECC, oversized logos, unsafe inputs and invalid styling options', () => {
  for (const level of ['L','M']) {
    assert.throws(() => toLogoSVG(qrypt('x',{errorCorrectionLevel:level}),logo),/Q or H/)
    assert.throws(() => toLogoPNG(qrypt('x',{errorCorrectionLevel:level}),logo),/Q or H/)
  }
  for(const bad of [
    {width:1,height:1,data:new Uint8Array(2)},
    {width:0,height:1,data:new Uint8Array(4)},
    {width:100000,height:1,data:new Uint8Array(4)},
    {width:1,height:1,data:[0,0,0,255]},
    {width:1,height:1,data:new Uint8Array(4),src:'https://evil.test'},
    null,
  ]) {
    if (bad?.src) continue // no URL is ever consumed; input has only raw RGBA members
    assert.throws(() => toLogoSVG(qr,bad),/Logo/)
  }
  for(const options of [{logoSize:100}, {logoSize:-1}, {logoSize:2}, {logoPadding:2},
    {logoSize:3,logoPadding:2}, {moduleShape:'<svg>'},{gradient:{from:'#ffffff',to:'#000000'}},
    {lightColor:'javascript:alert(1)'},{unknown:2},{margin:2**54}]) {
    assert.throws(()=>toLogoSVG(qr,logo,options),undefined,JSON.stringify(options))
    assert.throws(()=>toLogoPNG(qr,logo,options),undefined,JSON.stringify(options))
  }
})
