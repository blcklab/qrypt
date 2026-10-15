import { describe, it, expect } from 'vitest'
import { qrypt } from '../src/index.js'
import { createFunctionPatterns, alignmentPositions } from '../src/matrix/patterns.js'
import { maskAt } from '../src/matrix/masking.js'
import { getRawDataModules } from '../src/encoding/capacity.js'

describe('QR Code Model 2 matrix', () => {
  it('produces fully populated symbols at all 40 versions and correction levels', () => {
    for (let version = 1; version <= 40; version++) {
      for (const errorCorrectionLevel of ['L', 'M', 'Q', 'H'] as const) {
        const qr = qrypt('QR', { version, errorCorrectionLevel })
        expect(qr.size).toBe(version * 4 + 17)
        expect(qr.mask).toBeGreaterThanOrEqual(0)
        expect(qr.mask).toBeLessThanOrEqual(7)
        expect(qr.matrix().every(row => row.length === qr.size && row.every(v => typeof v === 'boolean'))).toBe(true)
      }
    }
  })
  it('reserves precisely the functional module area', () => {
    for (let version = 1; version <= 40; version++) {
      const pattern = createFunctionPatterns(version, 'M')
      expect(pattern.reserved.reduce((count, value) => count + (value === 0 ? 1 : 0), 0)).toBe(getRawDataModules(version))
    }
  })
  it('honors special version 32 alignment spacing', () => {
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138])
  })
  it('implements the eight mask formulas', () => {
    expect(Array.from({ length: 8 }, (_, mask) => maskAt(mask, 3, 4))).toEqual([
      false, true, true, false, false, true, true, false,
    ])
  })
  it('does not leak mutable matrix data to consumers', () => {
    const qr = qrypt('Hello Qrypt')
    const expected = qr.matrix()
    qr.matrix()[0]![0] = !expected[0]![0]
    expect(qr.matrix()).toEqual(expected)
  })
})
