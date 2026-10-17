import { describe, expect, it } from 'vitest'
import { qrypt } from '../src/index.js'
import { qryptBytes } from '../src/advanced.js'
import { decodeMatrix, decodePixels } from '../src/decode.js'
import { toPixels } from '../src/render.js'

describe('M20 reliability release checks', () => {
  it('round trips multilingual text and arbitrary binary content', () => {
    for (const text of ['HELLO', 'Café', '日本語 🧪', 'Hello\nWorld', '👩‍💻']) {
      const qr = qrypt(text, { errorCorrectionLevel: 'H' })
      expect(decodeMatrix(qr.matrix()).text).toBe(text)
    }
    const bytes = new Uint8Array([0, 255, 128, 0, 42, 255])
    expect(decodeMatrix(qryptBytes(bytes).matrix()).bytes).toEqual(bytes)
  })
  it('decodes low contrast pixel buffers and does not mutate input', () => {
    const qr = qrypt('M20-VITEST', {errorCorrectionLevel:'Q'})
    const pixels = toPixels(qr, {scale:7})
    const data = new Uint8ClampedArray(pixels.data)
    for (let i=0; i<data.length; i+=4) {
      data[i] = data[i+1] = data[i+2] = Math.round(data[i]! * .14 + 110)
    }
    const before = data.slice()
    expect(decodePixels({...pixels,data})?.text).toBe('M20-VITEST')
    expect(data).toEqual(before)
  })
})
