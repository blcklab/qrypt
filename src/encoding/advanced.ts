import type { QryptOptions, QryptResult } from '../types.js'
import { normalizeOptions } from '../validation.js'
import { BitBuffer } from './bits.js'
import { getDataCodewords } from './capacity.js'
import { interleaveWithErrorCorrection } from '../ecc/interleave.js'
import { makeQRResult } from '../qrypt.js'

/** Shared padding, version selection, and Reed–Solomon path for specialist modes. */
export function encodeAdvanced(options: QryptOptions | undefined, compose: (version: number) => BitBuffer | null): QryptResult {
  const { version: requestedVersion, errorCorrectionLevel: level } = normalizeOptions(options)
  const first = requestedVersion === 'auto' ? 1 : requestedVersion
  const last = requestedVersion === 'auto' ? 40 : requestedVersion
  for (let version = first; version <= last; version++) {
    const bits = compose(version)
    if (bits === null) continue
    const capacity = getDataCodewords(version, level) * 8
    if (bits.bitLength > capacity) continue
    bits.write(0, Math.min(4, capacity - bits.bitLength))
    if (bits.bitLength % 8) bits.write(0, 8 - bits.bitLength % 8)
    const used = bits.toBytes()
    const data = new Uint8Array(capacity / 8)
    data.set(used)
    for (let i = used.length; i < data.length; i++) data[i] = (i - used.length) % 2 ? 0x11 : 0xec
    return makeQRResult(version, level, interleaveWithErrorCorrection(data, version, level))
  }
  throw new RangeError(requestedVersion === 'auto'
    ? `Payload exceeds QR Code Model 2 capacity at error correction ${level}.`
    : `Payload exceeds QR version ${requestedVersion} capacity at error correction ${level}.`)
}

/** QR byte mode, which is distinct from ECI-tagged UTF-8 string input. */
export function writeRawBytes(writer: BitBuffer, bytes: Uint8Array, version: number): void {
  const maxCount = version <= 9 ? 255 : 65535
  if (!bytes.length) {
    writer.write(4, 4)
    writer.write(0, version <= 9 ? 8 : 16)
    return
  }
  for (let offset = 0; offset < bytes.length; offset += maxCount) {
    const chunk = bytes.subarray(offset, offset + maxCount)
    writer.write(4, 4)
    writer.write(chunk.length, version <= 9 ? 8 : 16)
    for (const byte of chunk) writer.write(byte, 8)
  }
}

export function validateBytes(value: unknown): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array payload.')
  if (value.length > 2953) throw new RangeError('Binary payload exceeds QR Model 2 maximum byte capacity.')
}

export function validateKanjiPair(lead: number, trail: number): number {
  if (trail < 0x40 || trail > 0xfc || trail === 0x7f) throw new RangeError('Invalid QR Kanji Shift-JIS byte pair.')
  const pair = lead << 8 | trail
  if (pair >= 0x8140 && pair <= 0x9ffc) {
    const adjusted = pair - 0x8140
    return ((adjusted >>> 8) * 0xc0) + (adjusted & 0xff)
  }
  if (pair >= 0xe040 && pair <= 0xebbf) {
    const adjusted = pair - 0xc140
    return ((adjusted >>> 8) * 0xc0) + (adjusted & 0xff)
  }
  throw new RangeError('Shift-JIS pair is outside the QR Kanji-mode ranges.')
}

export function writeKanji(writer: BitBuffer, bytes: Uint8Array, version: number): void {
  const chars = bytes.length / 2
  const countWidth = version <= 9 ? 8 : version <= 26 ? 10 : 12
  if (chars >= 2 ** countWidth) throw new RangeError('Kanji segment is too long for this QR version.')
  writer.write(8, 4)
  writer.write(chars, countWidth)
  for (let i = 0; i < bytes.length; i += 2) writer.write(validateKanjiPair(bytes[i]!, bytes[i + 1]!), 13)
}
