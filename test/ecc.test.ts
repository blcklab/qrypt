import { describe, expect, it } from 'vitest'
import { generatorPolynomial, gfMultiply, reedSolomonRemainder } from '../src/ecc/reed-solomon.js'
import { interleaveWithErrorCorrection } from '../src/ecc/interleave.js'
import { getDataCodewords, getRawDataModules } from '../src/encoding/capacity.js'
import { planEncoding } from '../src/encoding/plan.js'
import reference from './fixtures/reference-ecc.json'

const levels = ['L', 'M', 'Q', 'H'] as const
const seeds = { L: 3, M: 5, Q: 7, H: 11 }

describe('Reed–Solomon and QR interleaving', () => {
  it('matches independently generated GF multiplication and generator coefficients', () => {
    for (const [a, b, product] of reference.gf) expect(gfMultiply(a, b)).toBe(product)
    for (const [degree, coefficients] of Object.entries(reference.generator)) {
      expect([...generatorPolynomial(Number(degree))]).toEqual(coefficients)
    }
  })

  it('retains zero padding in the ECC remainder', () => {
    expect([...reedSolomonRemainder(new Uint8Array(20), 7)]).toEqual(Array(7).fill(0))
  })

  it('reproduces exact complete codewords from the independent QR encoder', () => {
    for (const [key, expected] of Object.entries(reference.knownCodewords)) {
      const [version, level, ...data] = key.split('-')
      expect([...planEncoding(data.join('-'), level as typeof levels[number], Number(version)).interleavedCodewords])
        .toEqual(expected)
    }
  })

  it('works on all version-level configurations and does not mutate caller data', () => {
    for (const level of levels) {
      for (let version = 1; version <= 40; version++) {
        const data = Uint8Array.from({ length: getDataCodewords(version, level) }, (_, i) =>
          (i * 149 + (i >>> 1) * 31 + version * 17 + seeds[level] * 43) & 255)
        const before = data.slice()
        const result = interleaveWithErrorCorrection(data, version, level)
        expect(result.length).toBe(Math.floor(getRawDataModules(version) / 8))
        expect(data).toEqual(before)
      }
    }
  })

  it('rejects the wrong data length instead of attempting partial encoding', () => {
    expect(() => interleaveWithErrorCorrection(new Uint8Array(1), 1, 'M')).toThrow(/exactly/)
  })
})
