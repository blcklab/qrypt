import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { qrypt, toSVG } from '../.m11-check/index.js'
import { toPixels } from '../.m11-check/render.js'
import { toPNG, toPNGDataURL } from '../.m11-check/png.js'

function parsePNG(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  let offset = 8
  const chunks = []
  while (offset < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const size = view.getUint32(0, false)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const content = bytes.subarray(offset + 8, offset + 8 + size)
    assert.ok(offset + 12 + size <= bytes.length)
    let crc = 0xffffffff
    for (let i = offset + 4; i < offset + 8 + size; i++) {
      crc ^= bytes[i]
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320)
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, view.getUint32(8 + size, false), `CRC mismatch: ${type}`)
    chunks.push({ type, content })
    offset += 12 + size
  }
  assert.equal(offset, bytes.length)
  const { content: header } = chunks[0]
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  return { width: view.getUint32(0), height: view.getUint32(4), depth: header[8], colorType: header[9], chunks, raw: inflateSync(chunks.find(c => c.type === 'IDAT').content) }
}

test('portable RGBA pixels are exact and independent of output mutation', () => {
  const qr = qrypt('Hi', { version: 1 })
  const image = toPixels(qr, { scale: 2, margin: 1, darkColor: '#123456', lightColor: '#CDEFAB', lightAlpha: 0, darkAlpha: 153 })
  assert.equal(image.width, 46)
  assert.equal(image.height, 46)
  assert.ok(image.data instanceof Uint8ClampedArray)
  assert.equal(image.data.length, image.width * image.height * 4)
  const modules = qr.matrix()
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const mx = Math.floor(x / 2) - 1, my = Math.floor(y / 2) - 1
    const dark = mx >= 0 && mx < qr.size && my >= 0 && my < qr.size && modules[my][mx]
    assert.deepEqual([...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)], dark ? [18, 52, 86, 153] : [205, 239, 171, 0])
  }
  image.data.fill(0)
  assert.notEqual(toPixels(qr).data[3], 0)
})

test('opaque indexed PNG remains bit-for-bit identical to explicitly opaque options', () => {
  const qr = qrypt('HELLO')
  assert.deepEqual(toPNG(qr), toPNG(qr, { darkAlpha: 255, lightAlpha: 255 }))
  const parsed = parsePNG(toPNG(qr))
  assert.equal(parsed.depth, 1)
  assert.equal(parsed.colorType, 3)
  assert.deepEqual(parsed.chunks.map(c => c.type), ['IHDR','PLTE','IDAT','IEND'])
})

test('RGBA PNG has valid chunks and exact unassociated alpha, crossing DEFLATE blocks', () => {
  const qr = qrypt('Qrypt transparent 🌍', { version: 7 })
  const options = { scale: 4, margin: 2, darkColor: '#112233', lightColor: '#FAE0C0', lightAlpha: 0, darkAlpha: 192 }
  const image = toPixels(qr, options)
  const parsed = parsePNG(toPNG(qr, options))
  assert.deepEqual(parsed.chunks.map(c => c.type), ['IHDR','IDAT','IEND'])
  assert.equal(parsed.depth, 8)
  assert.equal(parsed.colorType, 6)
  assert.equal(parsed.width, image.width)
  assert.equal(parsed.height, image.height)
  assert.ok(parsed.raw.length > 65535)
  const width = image.width
  for (let y = 0; y < width; y++) {
    const stride = width * 4 + 1
    assert.equal(parsed.raw[y * stride], 0)
    assert.deepEqual(parsed.raw.subarray(y * stride + 1, (y + 1) * stride), Buffer.from(image.data.subarray(y * width * 4, (y + 1) * width * 4)))
  }
})

test('transparent light/background also retains opaque dark modules', () => {
  const qr = qrypt('Transparent')
  const png = parsePNG(toPNG(qr, { scale: 1, margin: 4, lightAlpha: 0 }))
  assert.equal(png.colorType, 6)
  assert.deepEqual([...png.raw.subarray(1, 5)], [255, 255, 255, 0])
  const pixel = toPixels(qr, { scale: 1, margin: 4, lightAlpha: 0 })
  assert.equal(pixel.data.some((value, i) => i % 4 === 3 && value === 255), true)
})

test('portable PNG data URL round-trips byte-for-byte without browser globals', () => {
  const qr = qrypt('World 世界')
  for (const opts of [{ scale: 1, margin: 1 }, { scale: 2, lightAlpha: 0 }]) {
    const url = toPNGDataURL(qr, opts)
    assert.ok(url.startsWith('data:image/png;base64,'))
    assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), Buffer.from(toPNG(qr, opts)))
    assert.equal(toPNGDataURL(qr, opts), url)
  }
})

test('options reject malformed alpha/extra attributes without loosening SVG validation', () => {
  const qr = qrypt('test')
  for (const alpha of [-1, 256, 1.25, NaN, Infinity, null, '0', {}, true]) {
    assert.throws(() => toPixels(qr, { darkAlpha: alpha }), /darkAlpha/)
    assert.throws(() => toPNG(qr, { lightAlpha: alpha }), /lightAlpha/)
  }
  assert.throws(() => toPixels(qr, { typo: 1 }), /Unknown Pixels option/)
  assert.throws(() => toPNG(qr, { typo: 1 }), /Unknown PNG option/)
  assert.throws(() => toSVG(qr, { lightAlpha: 0 }), /Unknown SVG option/)
  assert.throws(() => toPixels(qr, { scale: 300 }), /RGBA output/)
  assert.throws(() => toPNG(qr, { scale: 300, lightAlpha: 0 }), /RGBA output/)
  assert.throws(() => toPixels(null), /valid Qrypt/)
  assert.throws(() => toPixels({ ...qr, matrix: () => [] }), /exactly size rows/)
  assert.throws(() => toPixels({ ...qr, matrix: () => qr.matrix().map(row => row.map(() => 7)) }), /booleans/)
})
