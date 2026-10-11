import { describe, expect, it } from 'vitest'
import { qrypt, toSVG } from '../src/index.js'

// Foundation tests cover the real implemented behavior only.
// Encoding conformance tests replace these placeholder expectations in later milestones.
describe('public surface at milestone 1', () => {
  it('exports two functional entry points', () => {
    expect(typeof qrypt).toBe('function')
    expect(typeof toSVG).toBe('function')
  })

  it('fails explicitly rather than returning an invalid QR symbol', () => {
    expect(() => qrypt('https://example.com')).toThrow(/encoder is not implemented/)
  })

  it('does not pretend SVG rendering is implemented', () => {
    expect(() => toSVG({} as never)).toThrow(/SVG rendering is not implemented/)
  })
})
