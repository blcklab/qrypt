import { describe, expect, it } from 'vitest'
import { BitBuffer } from '../src/encoding/bits.js'
import { getDataCodewords, getECCLayout, getRawDataModules } from '../src/encoding/capacity.js'
import { optimizeSegments, payloadBits, writeSegmentBits } from '../src/encoding/segments.js'
import { planEncoding } from '../src/encoding/plan.js'
import { toUTF8Bytes } from '../src/encoding/utf8.js'
import capacities from './fixtures/reference-capacities.json'

describe('bit writer', () => {
  it('packs MSB-first across byte boundaries', () => {
    const b = new BitBuffer()
    b.write(0b110, 3)
    b.write(0b011011, 6)
    b.write(0, 7)
    expect([...b.toBytes()]).toEqual([0b11001101, 0b10000000])
    expect(b.bitLength).toBe(16)
  })
  it('rejects values that do not fit', () => {
    expect(() => new BitBuffer().write(16, 4)).toThrow(/width/)
    expect(() => new BitBuffer().write(1, -1)).toThrow(/width/)
    const b = new BitBuffer()
    b.write(1, 1)
    expect(() => b.toBytes()).toThrow(/unaligned/)
  })
})

describe('UTF-8', () => {
  it('encodes ASCII, BMP, and supplementary scalars', () => {
    expect([...toUTF8Bytes('Aé世😀')]).toEqual([65, 0xc3, 0xa9, 0xe4, 0xb8, 0x96, 0xf0, 0x9f, 0x98, 0x80])
  })
  it('rejects unpaired UTF-16 surrogates', () => expect(() => toUTF8Bytes('\ud800')).toThrow(/well-formed/))
})

describe('capacity / layout', () => {
  it('matches an independent QR encoder for all 160 version/level combinations', () => {
    for (const level of ['L', 'M', 'Q', 'H'] as const) {
      for (let v = 1; v <= 40; v++) {
        expect(getDataCodewords(v, level)).toBe(capacities[level][v - 1])
        const layout = getECCLayout(v, level)
        expect(getDataCodewords(v, level) + layout.blockCount * layout.eccCodewordsPerBlock)
          .toBe(Math.floor(getRawDataModules(v) / 8))
      }
    }
  })
  it('provides known version capacities', () => {
    expect([getDataCodewords(1, 'L'), getDataCodewords(1, 'M'), getDataCodewords(1, 'Q'), getDataCodewords(1, 'H')])
      .toEqual([19, 16, 13, 9])
    expect([getDataCodewords(40, 'L'), getDataCodewords(40, 'M'), getDataCodewords(40, 'Q'), getDataCodewords(40, 'H')])
      .toEqual([2956, 2334, 1666, 1276])
  })
})

describe('segmentation', () => {
  it('chooses numeric and alphanumeric encoding without modifying case', () => {
    expect(optimizeSegments('01234567', 1).segments).toEqual([{ mode: 'numeric', text: '01234567', count: 8 }])
    expect(optimizeSegments('HELLO WORLD', 1).segments).toEqual([{ mode: 'alphanumeric', text: 'HELLO WORLD', count: 11 }])
    expect(optimizeSegments('hello', 1).segments).toEqual([{ mode: 'byte', text: 'hello', count: 5 }])
  })
  it('accounts for UTF-8 ECI overhead, but not for ASCII-only byte segments', () => {
    const unicode = optimizeSegments('Hi😀', 1)
    expect(unicode.utf8ECI).toBe(true)
    expect(unicode.bitLength).toBe(12 + 4 + 8 + 6 * 8)
    expect(optimizeSegments('hi', 1).utf8ECI).toBe(false)
    const written = writeSegmentBits(unicode.segments, 1, true)
    expect(written.bitLength).toBe(unicode.bitLength)
    const bits = [...new Uint8Array([0x71, 0xa4])]
    expect([...toBytePrefix(written, 2)]).toEqual(bits)
  })
  it('splits at a byte count field boundary and counts emoji as four bytes', () => {
    const result = optimizeSegments('a'.repeat(255) + '😀', 1)
    expect(result.segments.filter(s => s.mode === 'byte').length).toBeGreaterThanOrEqual(2)
    for (const s of result.segments) expect(s.count).toBeLessThanOrEqual(255)
  })
  it('preserves empty input as an empty data plan', () => {
    expect(optimizeSegments('', 1)).toEqual({ segments: [], bitLength: 0, utf8ECI: false })
  })
  it('is optimally segmented against an independent quadratic DP for short strings', () => {
    const alphabet = ['0', '9', 'A', 'Z', ' ', ':', 'a', 'é', '😀']
    let seed = 123456789
    const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed }
    for (const version of [1, 10, 27]) {
      for (let t = 0; t < 250; t++) {
        let input = ''
        for (let i = next() % 12; i > 0; i--) input += alphabet[next() % alphabet.length]
        const optimized = optimizeSegments(input, version)
        expect(optimized.bitLength).toBe(bruteForceCost(input, version))
      }
    }
  })
})

function toBytePrefix(bits: BitBuffer, count: number): Uint8Array {
  // Copy the bytes by writing the unaligned final bits separately in the caller.
  // Here this check is only called for an ECI-bearing payload with aligned length.
  return bits.toBytes().slice(0, count)
}

function bruteForceCost(text: string, version: number): number {
  const scalars = Array.from(text)
  const n = scalars.length
  const cost = Array<number>(n + 1).fill(Infinity)
  cost[0] = 0
  const widths = version <= 9 ? [10, 9, 8] : version <= 26 ? [12, 11, 16] : [14, 13, 16]
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
  const modes = ['numeric', 'alphanumeric', 'byte'] as const
  for (let end = 1; end <= n; end++) {
    for (let start = 0; start < end; start++) {
      const str = scalars.slice(start, end).join('')
      for (let modeIndex = 0; modeIndex < modes.length; modeIndex++) {
        const mode = modes[modeIndex]!
        if (mode === 'numeric' && !/^[0-9]+$/.test(str)) continue
        if (mode === 'alphanumeric' && ![...str].every(c => charset.includes(c))) continue
        const count = mode === 'byte' ? toUTF8Bytes(str).length : end - start
        const width = widths[modeIndex]!
        if (count >= 2 ** width) continue
        cost[end] = Math.min(cost[end]!, cost[start]! + 4 + width + payloadBits(mode, count))
      }
    }
  }
  return cost[n]! + (scalars.some(c => c.codePointAt(0)! > 127) ? 12 : 0)
}

describe('final pre-ECC data codewords', () => {
  it.each([
    ['01234567', [16, 32, 12, 86, 97, 128]],
    ['HELLO WORLD', [32, 91, 11, 120, 209, 114, 220, 77, 67, 64]],
    ['hello', [64, 86, 134, 86, 198, 198, 240]],
    ['', [0, 236, 17]],
  ])('matches independent QR encoder prefix for %s', (input, bytes) => {
    const plan = planEncoding(input, 'L', 1)
    expect([...plan.dataCodewords.slice(0, bytes.length)]).toEqual(bytes)
  })
  it('selects exact explicit versions and the smallest fitting automatic version', () => {
    expect(planEncoding('A', 'M').version).toBe(1)
    expect(planEncoding('A', 'M', 25).version).toBe(25)
    expect(planEncoding('1'.repeat(41), 'L').version).toBe(1)
    expect(planEncoding('1'.repeat(42), 'L').version).toBe(2)
  })
  it('rejects oversized input, never downgrading ECC or the selected version', () => {
    expect(() => planEncoding('1'.repeat(42), 'L', 1)).toThrow(/exceeds QR version 1/)
    expect(() => planEncoding('1'.repeat(35), 'M', 1)).toThrow(/exceeds QR version 1/)
    expect(() => planEncoding('1'.repeat(7090), 'L')).toThrow(/too large/)
    expect(() => planEncoding('x'.repeat(3000), 'H')).toThrow(/exceeds QR Code Model 2/)
  })
  it('handles all supported version groups and bit-length accounting', () => {
    const small = 'A'.repeat(6) + '1234567' + 'é'
    const large = 'A'.repeat(12) + '1234567890123' + 'é'
    // Version 1-L has 152 data bits; the large mixed-mode/ECI payload needs 177.
    expect(optimizeSegments(large, 1).bitLength).toBeGreaterThan(getDataCodewords(1, 'L') * 8)
    expect(() => planEncoding(large, 'L', 1)).toThrow(/exceeds QR version 1 capacity/)

    for (const version of [1, 9, 10, 26, 27, 40]) {
      const input = version === 1 ? small : large
      const plan = planEncoding(input, 'L', version)
      expect(plan.version).toBe(version)
      expect(plan.dataCodewords.length).toBe(getDataCodewords(version, 'L'))
      expect(plan.bitLength).toBe(optimizeSegments(input, version).bitLength)
    }
  })
})
