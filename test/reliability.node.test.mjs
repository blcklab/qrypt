/** M20 offline reliability cases. Testable without npm registry or a browser. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt } from '../.m20-check/index.js'
import { qryptBytes } from '../.m20-check/advanced.js'
import { decodeMatrix, decodePixels } from '../.m20-check/decode.js'
import { toPixels } from '../.m20-check/render.js'
import { toStyledPixels } from '../.m20-check/styled.js'

let seed = 0x20b1c0de
function random() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
  return seed >>> 0
}

function alter(image, mapping) {
  const data = new Uint8ClampedArray(image.data)
  for (let p = 0; p < image.width * image.height; p++) {
    const value = Math.max(0, Math.min(255, Math.round(mapping(data[p * 4], p))))
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = value
  }
  return {width: image.width, height: image.height, data}
}

function softened(image) {
  const data = new Uint8ClampedArray(image.data)
  const { width, height } = image
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
      sum += image.data[(yy * width + xx) * 4]
      count++
    }
    const offset = (y * width + x) * 4
    data[offset] = data[offset + 1] = data[offset + 2] = Math.round(sum / count)
  }
  return {width, height, data}
}

test('seeded randomized text and binary round trips preserve every code point and byte', () => {
  const atoms = ['A','7','hello',' ',':','é','日本語','🧪','\n','%','$','\u0301','🧑‍💻']
  for (let i = 0; i < 48; i++) {
    const count = 1 + random() % 20
    const text = Array.from({length:count}, () => atoms[random() % atoms.length]).join('')
    const level = ['L','M','Q','H'][i % 4]
    const qr = qrypt(text, {errorCorrectionLevel:level})
    const matrix = qr.matrix()
    assert.equal(decodeMatrix(matrix).text, text, `text case ${i}`)
    const original = matrix[0][0]
    matrix[0][0] = !original
    assert.equal(qr.matrix()[0][0], original, 'matrix snapshots must be independent')
    const length = random() % 220
    const bytes = Uint8Array.from({length}, () => random() % 256)
    const encoded = qryptBytes(bytes, {errorCorrectionLevel:level})
    assert.deepEqual(decodeMatrix(encoded.matrix()).bytes, bytes, `binary case ${i}`)
  }
})

test('image detection tolerates deterministic lighting variation, noise, and mild blur', () => {
  for (const [version,scale] of [[1,4],[2,5],[7,6],[15,4],[25,3]]) {
    const text = `M20-${version}`
    const qr = qrypt(text,{version,errorCorrectionLevel:'H'})
    const image = toPixels(qr,{scale})
    const variants = {
      dim: alter(image, v => v*.23+21),
      bright: alter(image, v => v*.18+202),
      lowContrast: alter(image, v => v*.11+116),
      noise: alter(image, (v,idx) => v+((idx*97)%37-18)),
      shadow: alter(image, (v,idx) => v-90*(idx % image.width/image.width)),
      mildBlur: softened(image),
    }
    for (const [label, pixels] of Object.entries(variants)) {
      assert.equal(decodePixels(pixels)?.text, text, `v${version} ${label}`)
    }
    assert.equal(decodePixels(image)?.text, text)
  }
})

test('styled symbols remain readable with independent pixel data and without mutation', () => {
  for (const version of [1,3,7]) {
    const qr = qrypt(`STYLE-${version}`,{version,errorCorrectionLevel:'H'})
    const pixels = toStyledPixels(qr,{scale:9,moduleShape:'rounded',finderStyle:'rounded',gradient:{from:'#142837',to:'#244c69',direction:'vertical'}})
    const before = pixels.data.slice()
    assert.equal(decodePixels(pixels)?.text,`STYLE-${version}`)
    assert.deepEqual(pixels.data,before)
  }
})

test('strict bounds reject invalid pixel lengths without processing data', () => {
  assert.throws(()=>decodePixels({width:2049,height:2049,data:new Uint8Array(1),format:'gray'}),RangeError)
  assert.throws(()=>decodePixels({width:30,height:30,data:new Uint8Array(899),format:'gray'}),RangeError)
  assert.throws(()=>decodePixels({width:30,height:30,data:new Uint8Array(900),format:'nope'}),TypeError)
})
