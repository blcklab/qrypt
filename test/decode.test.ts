import { describe, expect, it } from 'vitest'
import { qrypt } from '../src/index.js'
import { decodeMatrix } from '../src/decode.js'

describe('QR matrix decoding', () => {
  it('round-trips all four correction levels', () => {
    for (const errorCorrectionLevel of ['L','M','Q','H'] as const) {
      const value = 'HELLO-'+errorCorrectionLevel
      const qr = qrypt(value,{errorCorrectionLevel})
      const result = decodeMatrix(qr.matrix())
      expect(result.text).toBe(value)
      expect(result.errorCorrectionLevel).toBe(errorCorrectionLevel)
      expect(result.mask).toBe(qr.mask)
      expect(result.correctedErrors).toBe(0)
    }
  })
  it('reassembles UTF-8 and mixed segments', () => {
    const message = '1234 日本語 🧪 abc DEF 987654321'
    const result = decodeMatrix(qrypt(message,{version:7,errorCorrectionLevel:'H'}).matrix())
    expect(result.text).toBe(message)
    expect(result.segments.some(s => s.mode === 'byte' && s.eci === 26)).toBe(true)
  })
  it('returns a readable empty result', () => {
    expect(decodeMatrix(qrypt('').matrix()).text).toBe('')
  })
  it('rejects malformed dimensions and module values', () => {
    expect(() => decodeMatrix([[true]])).toThrow()
    expect(() => decodeMatrix(Array.from({length:21}, () => Array(21).fill(1)))).toThrow()
  })
})
