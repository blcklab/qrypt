import { describe, expect, it } from 'vitest'
import { qryptBytes, qryptKanji, qryptGS1, qryptStructuredAppend } from '../src/advanced.js'
import { decodeMatrix, assembleStructuredAppend } from '../src/decode.js'
import { qrypt } from '../src/index.js'

describe('M18 advanced QR modes', () => {
  it('round-trips arbitrary binary payloads without a UTF-8 coercion', () => {
    const data = new Uint8Array([0x00, 0xff, 0xc3, 0x28, 0x80])
    const decoded = decodeMatrix(qryptBytes(data, { errorCorrectionLevel: 'H' }).matrix())
    expect([...decoded.bytes!]).toEqual([...data])
    expect(decoded.segments[0]?.mode).toBe('byte')
  })
  it('enforces version capacity', () => {
    expect(() => qryptBytes(new Uint8Array(20), { version: 1, errorCorrectionLevel: 'L' })).toThrow(/capacity/)
    expect(() => qryptBytes(new Uint8Array(2954))).toThrow(/capacity/)
  })
  it('writes and decodes genuine QR Kanji segments', () => {
    const decoded = decodeMatrix(qryptKanji(new Uint8Array([0xe4, 0xaa, 0x89, 0xd7])).matrix())
    expect(decoded.text).toBe('茗荷')
    expect(decoded.segments[0]?.mode).toBe('kanji')
  })
  it('marks GS1 and preserves separators and literal percent signs', () => {
    const text = '01095011015300031725010110LOT%2\x1d21SERIAL7'
    const decoded = decodeMatrix(qryptGS1(text, { errorCorrectionLevel: 'L' }).matrix())
    expect(decoded.text).toBe(text)
    expect(decoded.fnc1).toBe('gs1')
  })
  it('reassembles shuffled structured append and rejects replayed pieces', () => {
    const parts = [new Uint8Array([0, 1, 255]), new Uint8Array([8, 7])]
    const [first, second] = qryptStructuredAppend(parts).map(qr => decodeMatrix(qr.matrix()))
    expect([...assembleStructuredAppend([second!, first!])]).toEqual([0, 1, 255, 8, 7])
    expect(() => assembleStructuredAppend([first!, first!])).toThrow()
  })
  it('preserves the core string API unchanged', () => {
    expect(decodeMatrix(qrypt('Hello 🧪').matrix()).text).toBe('Hello 🧪')
  })
})
