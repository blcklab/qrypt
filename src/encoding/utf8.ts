/** UTF-8 scalar encoding, independent of TextEncoder and Buffer. Input must be valid UTF-16. */
export function utf8Width(scalar: string): number {
  const point = scalar.codePointAt(0)!
  return point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
}

export function toUTF8Bytes(text: string): Uint8Array {
  const result: number[] = []
  for (const scalar of text) {
    const point = scalar.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff) {
      throw new TypeError('UTF-8 encoding requires well-formed Unicode text.')
    }
    if (point < 0x80) {
      result.push(point)
    } else if (point < 0x800) {
      result.push(0xc0 | (point >>> 6), 0x80 | (point & 63))
    } else if (point < 0x10000) {
      result.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 63), 0x80 | (point & 63))
    } else {
      result.push(0xf0 | (point >>> 18), 0x80 | ((point >>> 12) & 63),
        0x80 | ((point >>> 6) & 63), 0x80 | (point & 63))
    }
  }
  return Uint8Array.from(result)
}
