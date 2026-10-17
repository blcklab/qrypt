import { describe, expect, it } from 'vitest'
import { qrypt, toSVG } from '../src/index.js'
import { toPixels } from '../src/render.js'
import { toPNG, toPNGDataURL } from '../src/png.js'

describe('M11 portable rendering', () => {
  it('exports exact RGBA pixels with optional transparent quiet zones', () => {
    const qr = qrypt('Hello')
    const image = toPixels(qr, { scale: 1, margin: 4, lightAlpha: 0 })
    expect(image.data).toBeInstanceOf(Uint8ClampedArray)
    expect(image.data.length).toBe(image.width * image.height * 4)
    expect(Array.from(image.data.slice(0, 4))).toEqual([255, 255, 255, 0])
  })

  it('preserves indexed PNG by default and emits transparent RGBA PNG on demand', () => {
    const qr = qrypt('Hello')
    expect(toPNG(qr)[25]).toBe(3)
    expect(toPNG(qr, { lightAlpha: 0 })[25]).toBe(6)
    expect(toPNG(qr, { lightAlpha: 0 })[24]).toBe(8)
  })

  it('returns a portable image/png data URL', () => {
    const qr = qrypt('hello')
    expect(toPNGDataURL(qr)).toMatch(/^data:image\/png;base64,/)
    expect(toPNGDataURL(qr)).toBe(toPNGDataURL(qr))
  })

  it('rejects invalid alpha without changing SVG options', () => {
    const qr = qrypt('hello')
    expect(() => toPixels(qr, { darkAlpha: 256 })).toThrow(/darkAlpha/)
    expect(() => toPNG(qr, { lightAlpha: -1 })).toThrow(/lightAlpha/)
    expect(() => toSVG(qr, { lightAlpha: 0 } as never)).toThrow(/Unknown SVG option/)
  })
})
