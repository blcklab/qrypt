import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { qrypt } from '../.m6-check/index.js'
import { toPNG } from '../.m6-check/png.js'

function readPNG(bytes) {
  assert.ok(bytes instanceof Uint8Array)
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = []
  let offset = 8
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, 'truncated PNG chunk')
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const length = view.getUint32(0, false)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const payloadStart = offset + 8
    const payloadEnd = payloadStart + length
    assert.ok(payloadEnd + 4 <= bytes.length, 'truncated PNG chunk payload')
    const data = bytes.subarray(payloadStart, payloadEnd)
    // Independently compute CRC with a different implementation (lookup table).
    let crc = 0xffffffff
    for (let index = offset + 4; index < payloadEnd; index++) {
      crc ^= bytes[index]
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320)
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, new DataView(bytes.buffer, bytes.byteOffset + payloadEnd).getUint32(0, false), `CRC mismatch for ${type}`)
    chunks.push({ type, data })
    offset = payloadEnd + 4
  }
  assert.equal(offset, bytes.length)
  assert.deepEqual(chunks.map(c => c.type), ['IHDR', 'PLTE', 'IDAT', 'IEND'])
  const header = chunks[0].data
  assert.equal(header.length, 13)
  const headerView = new DataView(header.buffer, header.byteOffset)
  const width = headerView.getUint32(0, false)
  const height = headerView.getUint32(4, false)
  assert.equal(width, height)
  assert.deepEqual([...header.subarray(8,13)], [1,3,0,0,0])
  assert.equal(chunks[1].data.length, 6)
  assert.equal(chunks[3].data.length, 0)
  const raw = inflateSync(chunks[2].data)
  const stride = 1 + Math.ceil(width / 8)
  assert.equal(raw.length, height * stride)
  for (let y = 0; y < height; y++) assert.equal(raw[y * stride], 0, 'unfiltered scanline')
  return {
    width,
    palette: chunks[1].data,
    getIndex(x, y) { return (raw[y * stride + 1 + (x >>> 3)] >>> (7 - (x & 7))) & 1 },
    compressed: chunks[2].data,
    raw,
  }
}

function comparePixels(qr, opts = {}) {
  const margin = opts.margin ?? 4, scale = opts.scale ?? 8
  const decoded = readPNG(toPNG(qr, opts))
  const modules = qr.matrix()
  assert.equal(decoded.width, (qr.size + margin * 2) * scale)
  for (let y = 0; y < decoded.width; y++) {
    for (let x = 0; x < decoded.width; x++) {
      const mx = Math.floor(x / scale) - margin
      const my = Math.floor(y / scale) - margin
      const expected = mx >= 0 && mx < qr.size && my >= 0 && my < qr.size ? Number(modules[my][mx]) : 0
      assert.equal(decoded.getIndex(x, y), expected, `pixel mismatch (${x}, ${y}) in QR version ${qr.version}`)
    }
  }
  // Any bits beyond the final pixel must be zero.
  const padding = decoded.width & 7
  if (padding) {
    const finalByte = Math.ceil(decoded.width / 8)
    const stride = finalByte + 1
    for (let y = 0; y < decoded.width; y++) {
      assert.equal(decoded.raw[y * stride + finalByte] & ((1 << (8 - padding)) - 1), 0)
    }
  }
  return decoded
}

test('default is opaque black/white, indexed one-bit PNG with four-module quiet zone', () => {
  const qr = qrypt('Hi', { version: 1 })
  const result = comparePixels(qr)
  assert.equal(result.width, 232)
  assert.deepEqual([...result.palette], [255,255,255,0,0,0])
})

test('exact scaled pixels across versions and all error-correction levels', () => {
  for (const version of [1, 7, 22, 40]) {
    for (const errorCorrectionLevel of ['L', 'M', 'Q', 'H']) {
      comparePixels(qrypt('QR', { version, errorCorrectionLevel }), { scale: 2, margin: 1 })
    }
  }
})

test('custom colors, zero margin, and one-pixel-wide modules', () => {
  const qr = qrypt('Qrypt PNG')
  const png = comparePixels(qr, { scale: 1, margin: 0, darkColor: '#aB12f0', lightColor: '#FeaC09' })
  assert.deepEqual([...png.palette], [254,172,9,171,18,240])
  assert.equal(png.width, qr.size)
})

test('large symbols cross multiple DEFLATE stored blocks with valid checksums', () => {
  const qr = qrypt('Qrypt', { version: 40, errorCorrectionLevel: 'H' })
  const png = comparePixels(qr, { scale: 8 })
  assert.ok(png.raw.length > 65535 * 3)
  assert.equal(png.compressed[0], 0x78)
  assert.equal(png.compressed[1], 0x01)
  const bytes = png.compressed
  let offset = 2
  let count = 0
  while (offset < bytes.length - 4) {
    const final = bytes[offset++]
    assert.ok(final === 0 || final === 1)
    const len = bytes[offset] | (bytes[offset + 1] << 8)
    const nlen = bytes[offset + 2] | (bytes[offset + 3] << 8)
    assert.equal(len ^ nlen, 65535)
    offset += 4 + len
    count++
    if (final) break
  }
  assert.ok(count >= 4)
  assert.equal(offset, bytes.length - 4)
})

test('identical inputs produce identical portable byte streams and separate buffers', () => {
  const qr = qrypt('🌍 Hello 世界')
  const first = toPNG(qr)
  assert.deepEqual(first, toPNG(qr))
  assert.deepEqual(first, toPNG(qrypt('🌍 Hello 世界')))
  first.fill(0)
  assert.notDeepEqual(first, toPNG(qr))
})

test('invalid PNG options and dimensions are rejected without allocations', () => {
  const qr = qrypt('test')
  for (const opts of [null, [], new Date(), 'text', { extra: 1 }]) {
    assert.throws(() => toPNG(qr, opts), /PNG options|Unknown PNG option/)
  }
  for (const scale of [0, -1, 1.1, NaN, Infinity, '4', null, 100000]) {
    assert.throws(() => toPNG(qr, { scale }), /PNG scale|PNG output/)
  }
  for (const margin of [-1, 1.3, Infinity, '4', NaN, 1000000]) {
    assert.throws(() => toPNG(qr, { margin }), /PNG margin|PNG output/)
  }
  for (const color of ['', '#fff', 'red', '#abcdffAA', '#112233" onerror="evil', {}, null]) {
    assert.throws(() => toPNG(qr, { darkColor: color }), /PNG darkColor/)
  }
  assert.throws(() => toPNG(qr, { lightColor: 'transparent' }), /PNG lightColor/)
  assert.throws(() => toPNG(qr, { scale: 200 }), /PNG output/)
  assert.throws(() => toPNG(qr, { margin: 2048 }), /PNG output/)
})

test('rejects malformed symbol structures and matrix data', () => {
  const qr = qrypt('hello')
  assert.throws(() => toPNG(null), /valid Qrypt/)
  assert.throws(() => toPNG({}), /valid Qrypt/)
  assert.throws(() => toPNG({ ...qr, size: 999 }), /valid Qrypt/)
  assert.throws(() => toPNG({ ...qr, matrix: () => [] }), /exactly size rows/)
  assert.throws(() => toPNG({ ...qr, matrix: () => [[], ...qr.matrix().slice(1)] }), /exactly size modules/)
  assert.throws(() => toPNG({ ...qr, matrix: () => qr.matrix().map(row => row.map(() => 1)) }), /booleans/)
})
