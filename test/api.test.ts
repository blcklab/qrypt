import { describe, expect, it } from 'vitest'
import { qrypt, toSVG } from '../src/index.js'

// Foundation tests cover the real implemented behavior only.
// Encoding conformance tests replace these placeholder expectations in later milestones.
describe('public surface at milestone 4', () => {
  it('exports two functional entry points', () => {
    expect(typeof qrypt).toBe('function')
    expect(typeof toSVG).toBe('function')
  })

  it('generates a complete QR matrix and public metadata', () => {
    const qr = qrypt('https://example.com')
    expect(qr.version).toBeGreaterThanOrEqual(1)
    expect(qr.size).toBe(4 * qr.version + 17)
    expect(qr.matrix()).toHaveLength(qr.size)
    expect(qr.mask).toBeGreaterThanOrEqual(0)
    expect(qr.mask).toBeLessThanOrEqual(7)
  })

  it('does not pretend SVG rendering is implemented', () => {
    expect(() => toSVG({} as never)).toThrow(/SVG rendering is not implemented/)
  })
})
