import { describe, expect, it } from 'vitest'
import { qrypt } from '../src/index.js'
import { toLogoSVG, toLogoPNG, toLogoPixels } from '../src/logo.js'

describe('optional QR logo compositing', () => {
  const qr = qrypt('QRYPT BRAND', { errorCorrectionLevel: 'H' })
  const logo = { width: 1, height: 1, data: new Uint8Array([17, 20, 25, 255]) }
  it('embeds only local RGBA imagery with protected patterns', () => {
    expect(toLogoSVG(qr, logo)).toContain('data:image/png;base64,')
    expect(toLogoPNG(qr,logo)[25]).toBe(6)
    expect(toLogoPixels(qr,logo).width).toBe((qr.size+8)*8)
  })
  it('rejects insufficient error correction and oversized coverage', () => {
    expect(()=>toLogoSVG(qrypt('LOW'),logo)).toThrow(/Q or H/)
    expect(()=>toLogoSVG(qr,logo,{logoSize:50})).toThrow()
  })
})
