import { describe, expect, it } from 'vitest'
import { qrypt } from '../src/index.js'
import { toPNG } from '../src/png.js'

const signature = [137, 80, 78, 71, 13, 10, 26, 10]

describe('toPNG', () => {
  it('generates deterministic indexed-color PNG bytes', () => {
    const qr = qrypt('Hello, Qrypt!')
    const png = toPNG(qr)
    expect(png).toBeInstanceOf(Uint8Array)
    expect([...png.slice(0, 8)]).toEqual(signature)
    const header = new DataView(png.buffer, png.byteOffset + 16, 13)
    expect(header.getUint32(0)).toBe((qr.size + 8) * 8)
    expect(header.getUint32(4)).toBe((qr.size + 8) * 8)
    expect(header.getUint8(8)).toBe(1)
    expect(header.getUint8(9)).toBe(3)
    expect(toPNG(qr)).toEqual(png)
  })

  it('preserves options, rejects invalid ones, and enforces output bounds', () => {
    const qr = qrypt('HELLO')
    expect(toPNG(qr, { margin: 0, scale: 1 })).not.toEqual(toPNG(qr))
    expect(() => toPNG(qr, { scale: 0 })).toThrow(/positive safe integer/)
    expect(() => toPNG(qr, { margin: -1 })).toThrow(/nonnegative safe integer/)
    expect(() => toPNG(qr, { lightColor: 'red' })).toThrow(/lightColor/)
    expect(() => toPNG(qr, { scale: 300 })).toThrow(/PNG output/)
    expect(() => toPNG(qr, { extra: true } as never)).toThrow(/Unknown PNG option/)
  })
})
