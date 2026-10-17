import { describe, expect, it } from 'vitest'
import { qrypt, toSVG } from '../src/index.js'
import { toPNG } from '../src/png.js'
import { toStyledPixels, toStyledPNG, toStyledSVG } from '../src/styled.js'

describe('M14 optional QR styling', () => {
  const qr = qrypt('M14 STYLED QR')
  it('renders dot, rounded and square shapes without changing QR data', () => {
    const initial = qr.matrix()
    expect(toStyledSVG(qr, { moduleShape: 'dot' })).toContain('<circle')
    expect(toStyledSVG(qr, { moduleShape: 'rounded' })).toContain('rx="0.22"')
    expect(toStyledSVG(qr)).toContain('<rect')
    expect(qr.matrix()).toEqual(initial)
  })
  it('includes a gradient and safe rounded finders', () => {
    expect(toStyledSVG(qr, {finderStyle:'rounded',gradient:{from:'#000000',to:'#163e60'}})).toContain('linearGradient')
  })
  it('produces portable RGBA pixels and a valid RGBA PNG', () => {
    const opts = {moduleShape: 'rounded' as const, scale: 4}
    const pixels = toStyledPixels(qr, opts)
    expect(pixels.data.length).toBe(pixels.width*pixels.height*4)
    expect(toStyledPNG(qr, opts)[25]).toBe(6)
  })
  it('keeps the existing renderers unchanged', () => {
    const svg = toSVG(qr), png = toPNG(qr)
    toStyledSVG(qr, {moduleShape:'dot'})
    expect(toSVG(qr)).toBe(svg)
    expect(toPNG(qr)).toEqual(png)
  })
  it('rejects unsafe gradients and insufficient contrast', () => {
    expect(() => toStyledSVG(qr,{gradient:{from:'#ffffff',to:'#ffffff'}})).toThrow()
    expect(() => toStyledPNG(qr,{moduleShape:'<script>' as never})).toThrow()
  })
})
