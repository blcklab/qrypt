import { describe, expect, it } from 'vitest'
import { qrypt, toSVG } from '../src/index.js'

/** Independent SVG path reader for asserting exact dark-module coordinates. */
function parseDarkModules(svg: string, side: number): boolean[][] {
  const matrix = Array.from({ length: side }, () => Array<boolean>(side).fill(false))
  const path = /<path fill="#[0-9A-Fa-f]{6}" d="([^"]*)"\/>/.exec(svg)
  expect(path).not.toBeNull()
  const commands = path![1]!.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)
  for (const match of commands) {
    const x = Number(match[1]), y = Number(match[2]), width = Number(match[3])
    expect(width).toBe(Number(match[4]))
    expect(width).toBeGreaterThan(0)
    for (let i = x; i < x + width; i++) {
      expect(matrix[y]?.[i]).toBe(false)
      matrix[y]![i] = true
    }
  }
  return matrix
}

describe('toSVG', () => {
  it('renders a standalone deterministic SVG with a four-module white border by default', () => {
    const qr = qrypt('Hi', { version: 1 })
    const svg = toSVG(qr)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="232" height="232" viewBox="0 0 29 29"')
    expect(svg).toContain('<rect width="29" height="29" fill="#FFFFFF"/>')
    expect(toSVG(qr)).toBe(svg)
  })

  it('renders exactly the original modules and leaves the quiet zone empty', () => {
    const qr = qrypt('HELLO WORLD', { errorCorrectionLevel: 'Q', version: 7 })
    const border = 4
    const expected = qr.matrix()
    const actual = parseDarkModules(toSVG(qr), qr.size + 2 * border)
    for (let y = 0; y < actual.length; y++) {
      for (let x = 0; x < actual.length; x++) {
        expect(actual[y]![x]).toBe(y >= border && y < qr.size + border &&
          x >= border && x < qr.size + border ? expected[y - border]![x - border] : false)
      }
    }
  })

  it('supports a borderless output and custom hexadecimal colors', () => {
    const qr = qrypt('custom')
    const svg = toSVG(qr, { scale: 1, margin: 0, darkColor: '#013aBc', lightColor: '#ffFEee' })
    expect(svg).toContain(`viewBox="0 0 ${qr.size} ${qr.size}"`)
    expect(svg).toContain('fill="#013aBc"')
    expect(svg).toContain('fill="#ffFEee"')
  })

  it('never interpolates input data into SVG markup', () => {
    const payload = '<script>alert("unsafe")</script>'
    const svg = toSVG(qrypt(payload))
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('alert(')
  })

  it('rejects invalid scales, margins, and colors', () => {
    const qr = qrypt('input')
    expect(() => toSVG(qr, { scale: 0 })).toThrow(/positive safe integer/)
    expect(() => toSVG(qr, { margin: -1 })).toThrow(/nonnegative safe integer/)
    expect(() => toSVG(qr, { margin: 2 ** 32 })).toThrow(/dimensions/)
    expect(() => toSVG(qr, { darkColor: '#aaa' })).toThrow(/darkColor/)
    expect(() => toSVG(qr, { lightColor: 'url(javascript:1)' })).toThrow(/lightColor/)
    expect(() => toSVG(qr, { unsupported: 1 } as never)).toThrow(/Unknown SVG option/)
  })

  it('validates the symbol and matrix shape at the rendering boundary', () => {
    const qr = qrypt('Hi')
    expect(() => toSVG({} as never)).toThrow(/valid Qrypt/)
    expect(() => toSVG({ ...qr, matrix: () => [] })).toThrow(/exactly size rows/)
    expect(() => toSVG({ ...qr, matrix: () => Array.from({ length: qr.size }, () => []) }))
      .toThrow(/exactly size modules/)
  })
})
