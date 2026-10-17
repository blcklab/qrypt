/** Optional QR Model 2 advanced encoders. No framework or platform-specific dependencies. */
import type { QryptOptions, QryptResult } from './types.js'
import { validateText } from './validation.js'
import { BitBuffer } from './encoding/bits.js'
import { encodeAdvanced, validateBytes, validateKanjiPair, writeKanji, writeRawBytes } from './encoding/advanced.js'

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

/** Encode arbitrary bytes without Unicode conversion, normalization, or ECI insertion. */
export function qryptBytes(input: Uint8Array, options?: QryptOptions): QryptResult {
  validateBytes(input)
  return encodeAdvanced(options, v => {
    const writer = new BitBuffer()
    writeRawBytes(writer, input, v)
    return writer
  })
}

/** Encode already-converted Shift-JIS double-byte characters in QR Kanji mode.
 * Only eligible QR Kanji pairs are accepted; no implicit Unicode transcoding.
 */
export function qryptKanji(shiftJIS: Uint8Array, options?: QryptOptions): QryptResult {
  validateBytes(shiftJIS)
  if (shiftJIS.length === 0 || shiftJIS.length % 2) throw new RangeError('Kanji input must contain complete, nonempty Shift-JIS pairs.')
  for (let i = 0; i < shiftJIS.length; i += 2) validateKanjiPair(shiftJIS[i]!, shiftJIS[i + 1]!)
  return encodeAdvanced(options, v => {
    const writer = new BitBuffer()
    if (shiftJIS.length / 2 >= 2 ** (v <= 9 ? 8 : v <= 26 ? 10 : 12)) return null
    writeKanji(writer, shiftJIS, v)
    return writer
  })
}

/** GS1/FNC1-first-position for already formatted GS1 element strings.
 * ASCII GS (0x1D) is a separator and a literal '%' is escaped as '%%'.
 * The caller is responsible for the GS1 Application Identifier grammar.
 */
export function qryptGS1(text: string, options?: QryptOptions): QryptResult {
  validateText(text)
  if (!text.length) throw new RangeError('GS1 payload cannot be empty.')
  let encoded = ''
  for (const character of text) {
    if (character === '\x1d') encoded += '%'
    else if (character === '%') encoded += '%%'
    else if (ALPHANUMERIC.includes(character)) encoded += character
    else throw new RangeError('GS1 first-position encoder supports uppercase QR alphanumeric characters and ASCII group separators only.')
  }
  return encodeAdvanced(options, version => {
    const width = version <= 9 ? 9 : version <= 26 ? 11 : 13
    const writer = new BitBuffer()
    writer.write(0b0101, 4)
    if (encoded.length >= 2 ** width) return null // count field cannot represent this payload
    writer.write(0b0010, 4)
    writer.write(encoded.length, width)
    for (let i = 0; i < encoded.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(encoded[i]!)
      if (i + 1 < encoded.length) writer.write(a * 45 + ALPHANUMERIC.indexOf(encoded[i + 1]!), 11)
      else writer.write(a, 6)
    }
    return writer
  })
}

/** Explicit structured-append symbols with a shared XOR parity, maximum 16 parts.
 * The caller splits bytes; many general-purpose camera apps do NOT reassemble sets.
 */
export function qryptStructuredAppend(parts: readonly Uint8Array[], options?: QryptOptions): QryptResult[] {
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 16) throw new RangeError('Structured append requires 2 to 16 parts.')
  let parity = 0
  for (const part of parts) {
    validateBytes(part)
    if (!part.length) throw new RangeError('Structured append parts must be nonempty.')
    for (const byte of part) parity ^= byte
  }
  return parts.map((part, index) => encodeAdvanced(options, v => {
    const writer = new BitBuffer()
    writer.write(0b0011, 4)
    writer.write(index, 4)
    writer.write(parts.length - 1, 4)
    writer.write(parity, 8)
    writeRawBytes(writer, part, v)
    return writer
  }))
}
