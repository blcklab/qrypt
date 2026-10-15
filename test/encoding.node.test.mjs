// Dependency-free milestone 2 verification, using compiled TypeScript and node:test.
// An independent Python qrcode library generated reference-capacities.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BitBuffer } from '../.m2-check/encoding/bits.js'
import { getDataCodewords, getECCLayout, getRawDataModules } from '../.m2-check/encoding/capacity.js'
import { optimizeSegments, payloadBits, writeSegmentBits } from '../.m2-check/encoding/segments.js'
import { planEncoding } from '../.m2-check/encoding/plan.js'
import { toUTF8Bytes } from '../.m2-check/encoding/utf8.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-capacities.json', import.meta.url), 'utf8'))

test('bit writer emits MSB-first bytes and rejects incorrect widths', () => {
  const b = new BitBuffer()
  b.write(0b110, 3); b.write(0b011011, 6); b.write(0, 7)
  assert.deepEqual([...b.toBytes()], [0b11001101, 0b10000000])
  assert.throws(() => b.write(8, 3), /width/)
})

test('UTF-8 matches independent Unicode byte values', () => {
  assert.deepEqual([...toUTF8Bytes('Aé世😀')], [65, 195, 169, 228, 184, 150, 240, 159, 152, 128])
  assert.throws(() => toUTF8Bytes('\udc00'), /well-formed/)
})

test('all 160 capacity entries match an independent QR encoder', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    for (let version = 1; version <= 40; version++) {
      const data = getDataCodewords(version, level)
      const layout = getECCLayout(version, level)
      assert.equal(data, fixture[level][version - 1], `${level} v${version}`)
      assert.equal(data + layout.blockCount * layout.eccCodewordsPerBlock,
        Math.floor(getRawDataModules(version) / 8))
    }
  }
})

test('uses numeric, alphanumeric and UTF-8 byte modes', () => {
  assert.deepEqual(optimizeSegments('01234567', 1).segments.map(s => s.mode), ['numeric'])
  assert.deepEqual(optimizeSegments('HELLO WORLD', 1).segments.map(s => s.mode), ['alphanumeric'])
  assert.deepEqual(optimizeSegments('hello', 1).segments.map(s => s.mode), ['byte'])
  assert.equal(optimizeSegments('Hello', 1).utf8ECI, false)
  assert.equal(optimizeSegments('é', 1).utf8ECI, true)
})

test('matches reference data-only codewords for numeric, alphanumeric, byte, and empty inputs', () => {
  const cases = [
    ['01234567', [16, 32, 12, 86, 97, 128]],
    ['HELLO WORLD', [32, 91, 11, 120, 209, 114, 220, 77, 67, 64]],
    ['hello', [64, 86, 134, 86, 198, 198, 240]],
    ['', [0, 236, 17]],
  ]
  for (const [input, prefix] of cases) {
    const bytes = planEncoding(input, 'L', 1).dataCodewords
    assert.deepEqual([...bytes.slice(0, prefix.length)], prefix)
    assert.equal(bytes.length, 19)
  }
})

test('ECI designator 26 precedes the first UTF-8 byte segment', () => {
  const segments = optimizeSegments('Hi😀', 1)
  assert.equal(segments.bitLength, 72)
  const data = writeSegmentBits(segments.segments, 1, segments.utf8ECI).toBytes()
  assert.deepEqual([...data], [113, 164, 6, 72, 105, 240, 159, 152, 128])
})

test('respects byte character counts and version group headers', () => {
  for (const version of [1, 9, 10, 26, 27, 40]) {
    const encoding = optimizeSegments('1234567890Zé', version)
    assert.equal(writeSegmentBits(encoding.segments, version, encoding.utf8ECI).bitLength, encoding.bitLength)
  }
  const huge = optimizeSegments('a'.repeat(255) + '😀', 1)
  assert.ok(huge.segments.length >= 2)
  assert.ok(huge.segments.every(s => s.count <= 255))
})

test('optimal segmenter matches brute-force cost for 1500 seeded short cases', () => {
  const alphabet = ['0', '1', 'A', ' ', '/', 'a', ':', 'é', '😀', 'Z']
  let seed = 987654321
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
  for (const version of [1, 10, 27]) {
    for (let t = 0; t < 500; t++) {
      let text = ''
      const length = next() % 13
      for (let k = 0; k < length; k++) text += alphabet[next() % alphabet.length]
      const got = optimizeSegments(text, version)
      const chars = Array.from(text)
      const dp = Array(chars.length + 1).fill(Infinity)
      dp[0] = 0
      const widths = version <= 9 ? [10, 9, 8] : version <= 26 ? [12, 11, 16] : [14, 13, 16]
      for (let end = 1; end <= chars.length; end++) {
        for (let start = 0; start < end; start++) {
          const part = chars.slice(start, end).join('')
          const possible = [/^[0-9]+$/.test(part), Array.from(part).every(c => charset.includes(c)), true]
          const modes = ['numeric', 'alphanumeric', 'byte']
          for (let mode = 0; mode < 3; mode++) {
            if (!possible[mode]) continue
            const count = mode === 2 ? toUTF8Bytes(part).length : end - start
            if (count >= 2 ** widths[mode]) continue
            dp[end] = Math.min(dp[end], dp[start] + 4 + widths[mode] + payloadBits(modes[mode], count))
          }
        }
      }
      const eci = chars.some(c => c.codePointAt(0) > 127) ? 12 : 0
      assert.equal(got.bitLength, dp[chars.length] + eci, `${JSON.stringify(text)} at v${version}`)
    }
  }
})

test('exact version, smallest fitting version and data codeword capacity', () => {
  assert.equal(planEncoding('A', 'M').version, 1)
  assert.equal(planEncoding('A', 'M', 25).version, 25)
  assert.equal(planEncoding('1'.repeat(41), 'L').version, 1)
  assert.equal(planEncoding('1'.repeat(42), 'L').version, 2)
  for (const version of [1, 9, 10, 26, 27, 40]) {
    const plan = planEncoding('HELLO123é', 'L', version)
    assert.equal(plan.version, version)
    assert.equal(plan.dataCodewords.length, getDataCodewords(version, 'L'))
  }
})

test('never downgrades ECC or silently truncates oversized payloads', () => {
  assert.throws(() => planEncoding('1'.repeat(42), 'L', 1), /exceeds QR version 1/)
  assert.throws(() => planEncoding('1'.repeat(35), 'M', 1), /exceeds QR version 1/)
  assert.throws(() => planEncoding('1'.repeat(7090), 'L'), /too large/)
  assert.throws(() => planEncoding('x'.repeat(3000), 'H'), /exceeds QR Code Model 2/)
})

test('large payload runtime remains bounded', () => {
  const started = performance.now()
  const result = planEncoding('1'.repeat(7089), 'L')
  assert.equal(result.version, 40)
  assert.ok(performance.now() - started < 5000, '7089-digit planning unexpectedly slow')
})
