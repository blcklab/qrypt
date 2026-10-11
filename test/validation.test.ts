import { describe, expect, it } from 'vitest'
import { qrypt } from '../src/index.js'
import { normalizeOptions, validateText } from '../src/validation.js'

describe('input boundary', () => {
  it('allows an empty string', () => expect(() => validateText('')).not.toThrow())
  it('allows valid Unicode surrogate pairs', () => expect(() => validateText('hello 🌐')).not.toThrow())
  it('rejects unpaired high surrogates', () => expect(() => qrypt('\ud83d')).toThrow(/unpaired high surrogate/))
  it('rejects unpaired low surrogates', () => expect(() => qrypt('\udc00')).toThrow(/unpaired low surrogate/))
  it('rejects non-strings at runtime', () => expect(() => qrypt(123 as never)).toThrow(/must be a string/))
})

describe('core options', () => {
  it('defaults to medium ECC and auto version', () => {
    expect(normalizeOptions(undefined)).toEqual({ errorCorrectionLevel: 'M', version: 'auto' })
  })
  it('preserves explicit valid selections', () => {
    expect(normalizeOptions({ errorCorrectionLevel: 'H', version: 40 })).toEqual({
      errorCorrectionLevel: 'H', version: 40,
    })
  })
  it.each([0, 41, 1.2, Infinity, NaN])('rejects invalid version %s', (version) => {
    expect(() => qrypt('test', { version })).toThrow(/version must/)
  })
  it('rejects invalid ECC without falling back', () => {
    expect(() => qrypt('test', { errorCorrectionLevel: 'Z' as never })).toThrow(/errorCorrectionLevel/)
  })
  it('rejects unknown options', () => {
    expect(() => qrypt('test', { quality: 5 } as never)).toThrow(/Unknown Qrypt option/)
  })
  it('rejects invalid options objects', () => {
    expect(() => qrypt('test', null as never)).toThrow(/plain object/)
  })
})
