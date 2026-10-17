import { countBits } from '../encoding/segments.js'
import type { MatrixData } from './matrix.js'

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

/** A successfully decoded QR data segment, preserving its raw bytes for byte mode. */
export type DecodedSegment =
  | { readonly mode: 'numeric' | 'alphanumeric'; readonly text: string }
  | { readonly mode: 'byte'; readonly text: string; readonly bytes: Uint8Array; readonly eci: number }
  | { readonly mode: 'kanji'; readonly text: string; readonly shiftJIS: Uint8Array }

export interface DecodedQR {
  readonly text: string
  readonly version: number
  readonly size: number
  readonly errorCorrectionLevel: MatrixData['errorCorrectionLevel']
  readonly mask: number
  /** Count of repaired Reed–Solomon codewords, across all blocks. */
  readonly correctedErrors: number
  readonly segments: readonly DecodedSegment[]
  /** Raw payload for QR symbols composed exclusively of byte segments. */
  readonly bytes?: Uint8Array
  /** GS1 FNC1 in first position. This is not a validation of GS1 AI syntax. */
  readonly fnc1?: 'gs1'
  /** Structured-append metadata; parity is an XOR checksum, not authentication. */
  readonly structuredAppend?: { readonly index: number; readonly total: number; readonly parity: number }
}

/** Reject invalid UTF-8: overlong forms, invalid continuations, surrogates, and >U+10FFFF. */
function readUTF8(bytes: Uint8Array): string {
  const codes: number[] = []
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++]!
    let cp: number
    if (first < 0x80) cp = first
    else {
      const length = first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0
      if (!length || i + length - 1 > bytes.length) throw new Error('Invalid QR UTF-8 byte segment.')
      cp = first & (length === 2 ? 0x1f : length === 3 ? 0x0f : 0x07)
      for (let j = 1; j < length; j++) {
        const next = bytes[i++]!
        if ((next & 0xc0) !== 0x80) throw new Error('Invalid QR UTF-8 continuation byte.')
        cp = (cp << 6) | (next & 0x3f)
      }
      if (cp < (length === 2 ? 0x80 : length === 3 ? 0x800 : 0x10000) ||
          (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) throw new Error('Invalid QR Unicode code point.')
    }
    if (cp <= 0xffff) codes.push(cp)
    else { cp -= 0x10000; codes.push(0xd800 | cp >>> 10, 0xdc00 | cp & 0x3ff) }
  }
  // String.fromCharCode(...large array) can exceed the JS argument limit.
  let result = ''
  for (let i = 0; i < codes.length; i += 1024) result += String.fromCharCode(...codes.slice(i, i + 1024))
  return result
}

class BitReader {
  private offset = 0
  constructor(private readonly bytes: Uint8Array) {}
  get remaining(): number { return this.bytes.length * 8 - this.offset }
  read(width: number): number {
    if (!Number.isInteger(width) || width < 0 || width > 24 || width > this.remaining) {
      throw new Error('QR segment is truncated or has an invalid bit length.')
    }
    let value = 0
    for (let i = 0; i < width; i++) {
      value = value << 1 | (this.bytes[this.offset >>> 3]! >>> (7 - (this.offset & 7)) & 1)
      this.offset++
    }
    return value
  }
}

function eciValue(reader: BitReader): number {
  const first = reader.read(8)
  if ((first & 0x80) === 0) return first
  if ((first & 0xc0) === 0x80) return ((first & 0x3f) << 8) | reader.read(8)
  if ((first & 0xe0) === 0xc0) return ((first & 0x1f) << 16) | reader.read(16)
  throw new Error('Invalid QR ECI assignment header.')
}

export function decodePayload(decoded: MatrixData): DecodedQR {
  const reader = new BitReader(decoded.data)
  const segments: DecodedSegment[] = []
  let activeECI = 3 // QR's default ECI assignment: ISO-8859-1
  let text = ''
  let fnc1 = false
  let structuredAppend: { index: number; total: number; parity: number } | undefined
  let sawData = false
  while (reader.remaining >= 4) {
    const mode = reader.read(4)
    if (mode === 0) break // terminator
    if (mode === 3) {
      if (sawData || structuredAppend || fnc1) throw new Error('QR structured append must occur at the beginning.')
      const index = reader.read(4)
      const total = reader.read(4) + 1
      const parity = reader.read(8)
      if (index >= total) throw new Error('Invalid QR structured-append index.')
      structuredAppend = { index, total, parity }
      continue
    }
    if (mode === 5) {
      if (sawData || fnc1) throw new Error('QR FNC1 must appear before data segments.')
      fnc1 = true
      continue
    }
    if (mode === 7) {
      activeECI = eciValue(reader)
      if (activeECI !== 3 && activeECI !== 26) throw new Error(`Unsupported QR ECI assignment ${activeECI}.`)
      continue
    }
    if (mode !== 1 && mode !== 2 && mode !== 4 && mode !== 8) throw new Error(`Unsupported QR data mode ${mode}.`)
    sawData = true
    const name = mode === 1 ? 'numeric' : mode === 2 ? 'alphanumeric' : mode === 8 ? 'kanji' : 'byte'
    const count = reader.read(mode === 8 ? (decoded.version <= 9 ? 8 : decoded.version <= 26 ? 10 : 12) : countBits(name as 'numeric' | 'alphanumeric' | 'byte', decoded.version))
    // Cap loops using the remaining codeword bit budget; never trust a damaged length blindly.
    const minimum = name === 'numeric' ? Math.floor(count / 3) * 10 + [0, 4, 7][count % 3]!
      : name === 'alphanumeric' ? Math.floor(count / 2) * 11 + count % 2 * 6
      : name === 'kanji' ? count * 13 : count * 8
    if (minimum > reader.remaining) throw new Error('QR segment length exceeds remaining data.')
    let part = ''
    if (mode === 1) {
      for (let i = 0; i < count; i += 3) {
        const digits = Math.min(3, count - i)
        const number = reader.read(digits === 3 ? 10 : digits === 2 ? 7 : 4)
        if (number >= 10 ** digits) throw new Error('Invalid QR numeric codeword.')
        part += String(number).padStart(digits, '0')
      }
      segments.push({ mode: 'numeric', text: part })
    } else if (mode === 2) {
      for (let i = 0; i < count; i += 2) {
        if (i + 1 < count) {
          const value = reader.read(11)
          if (value >= 45 * 45) throw new Error('Invalid QR alphanumeric pair.')
          part += ALPHANUMERIC[Math.floor(value / 45)]! + ALPHANUMERIC[value % 45]!
        } else {
          const value = reader.read(6)
          if (value >= 45) throw new Error('Invalid QR alphanumeric character.')
          part += ALPHANUMERIC[value]!
        }
      }
      if (fnc1) part = part.replace(/%%|%/g, match => match === '%%' ? '%' : '\x1d')
      segments.push({ mode: 'alphanumeric', text: part })
    } else if (mode === 8) {
      const shiftJIS = new Uint8Array(count * 2)
      for (let i = 0; i < count; i++) {
        const value = reader.read(13)
        const adjusted = (Math.floor(value / 0xc0) << 8) | value % 0xc0
        const pair = adjusted + (adjusted < 0x1f00 ? 0x8140 : 0xc140)
        const high = pair >>> 8, low = pair & 255
        if (!(pair >= 0x8140 && pair <= 0x9ffc || pair >= 0xe040 && pair <= 0xebbf) || low < 0x40 || low > 0xfc || low === 0x7f) {
          throw new Error('Invalid QR Kanji codeword.')
        }
        shiftJIS[i * 2] = high
        shiftJIS[i * 2 + 1] = low
      }
      const TextDecoderClass = (globalThis as unknown as { TextDecoder?: new (encoding: string, options: { fatal: boolean }) => { decode(input: Uint8Array): string } }).TextDecoder
      if (!TextDecoderClass) throw new Error('Kanji decoding requires platform Shift-JIS TextDecoder support.')
      try { part = new TextDecoderClass('shift_jis', { fatal: true }).decode(shiftJIS) }
      catch { throw new Error('Invalid or unsupported QR Shift-JIS sequence.') }
      segments.push({ mode: 'kanji', text: part, shiftJIS })
    } else {
      const bytes = new Uint8Array(count)
      for (let i = 0; i < count; i++) bytes[i] = reader.read(8)
      part = activeECI === 26 ? readUTF8(bytes) : Array.from(bytes, c => String.fromCharCode(c)).join('')
      segments.push({ mode: 'byte', text: part, bytes, eci: activeECI })
    }
    text += part
  }
  const byteOnly = segments.length > 0 && segments.every(segment => segment.mode === 'byte')
  const allBytes = byteOnly ? new Uint8Array(segments.reduce((total, segment) => total + (segment.mode === 'byte' ? segment.bytes.length : 0), 0)) : undefined
  if (allBytes) {
    let offset = 0
    for (const segment of segments) if (segment.mode === 'byte') { allBytes.set(segment.bytes, offset); offset += segment.bytes.length }
  }
  return Object.freeze({
    text,
    version: decoded.version,
    size: decoded.size,
    errorCorrectionLevel: decoded.errorCorrectionLevel,
    mask: decoded.mask,
    correctedErrors: decoded.correctedErrors,
    segments,
    ...(allBytes ? { bytes: allBytes } : {}),
    ...(fnc1 ? { fnc1: 'gs1' as const } : {}),
    ...(structuredAppend ? { structuredAppend } : {}),
  })
}
