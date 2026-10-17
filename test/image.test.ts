import { describe, it, expect } from 'vitest'
import { qrypt } from '../src/index.js'
import { toPixels } from '../src/render.js'
import { decodeMatrix, decodePixels } from '../src/decode.js'

describe('optional raw image QR decoding', () => {
  it('recovers Unicode text and ECC metadata from RGBA pixels', () => {
    const payload='HELLO M17 🌌'
    const qr=qrypt(payload,{errorCorrectionLevel:'H'})
    const result=decodePixels(toPixels(qr,{scale:9}))
    expect(result?.text).toBe(payload)
    expect(result?.errorCorrectionLevel).toBe('H')
    expect(result?.corners).toHaveLength(4)
    expect(decodeMatrix(qr.matrix()).text).toBe(payload)
  })
  it('returns null instead of fabricating symbols from blank images', () => {
    expect(decodePixels({width:32,height:32,data:new Uint8Array(32*32),format:'gray'})).toBeNull()
  })
  it('rejects wrong pixel array lengths', () => {
    expect(()=>decodePixels({width:64,height:64,data:new Uint8Array(64)})).toThrow()
  })
})
