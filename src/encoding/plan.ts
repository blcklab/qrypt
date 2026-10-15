import type { ErrorCorrectionLevel } from '../types.js'
import { getDataCodewords } from './capacity.js'
import { optimizeSegments, writeSegmentBits } from './segments.js'
import type { DataSegment } from './segments.js'
import { validateText } from '../validation.js'
import { interleaveWithErrorCorrection } from '../ecc/interleave.js'

export interface EncodingPlan {
  readonly version: number
  readonly errorCorrectionLevel: ErrorCorrectionLevel
  readonly segments: readonly DataSegment[]
  readonly utf8ECI: boolean
  readonly bitLength: number
  /** Data-only codewords, padded to the exact data capacity. */
  readonly dataCodewords: Uint8Array
  /** Fully interleaved data and Reed–Solomon ECC bytes. Matrix placement follows in milestone 4. */
  readonly interleavedCodewords: Uint8Array
}

/** Finds the smallest version that fits; recomputes segmentation per version group. */
export function planEncoding(
  input: string,
  errorCorrectionLevel: ErrorCorrectionLevel = 'M',
  requestedVersion: number | 'auto' = 'auto',
): EncodingPlan {
  validateText(input)
  if (!['L', 'M', 'Q', 'H'].includes(errorCorrectionLevel)) throw new RangeError('Invalid QR error correction level.')
  if (requestedVersion !== 'auto' && (!Number.isInteger(requestedVersion) || requestedVersion < 1 || requestedVersion > 40)) {
    throw new RangeError('QR version must be auto or an integer from 1 to 40.')
  }

  const start = requestedVersion === 'auto' ? 1 : requestedVersion
  const end = requestedVersion === 'auto' ? 40 : requestedVersion
  let cachedGroup = -1
  let optimized: ReturnType<typeof optimizeSegments> | undefined

  for (let version = start; version <= end; version++) {
    const group = version <= 9 ? 0 : version <= 26 ? 1 : 2
    if (group !== cachedGroup) {
      optimized = optimizeSegments(input, version)
      cachedGroup = group
    }
    const capacity = getDataCodewords(version, errorCorrectionLevel) * 8
    if (optimized!.bitLength > capacity) continue

    const writer = writeSegmentBits(optimized!.segments, version, optimized!.utf8ECI)
    if (writer.bitLength !== optimized!.bitLength) throw new Error('Internal QR bit-length mismatch.')
    writer.write(0, Math.min(4, capacity - writer.bitLength))
    if (writer.bitLength % 8 !== 0) writer.write(0, 8 - writer.bitLength % 8)
    const used = writer.toBytes()
    const padded = new Uint8Array(capacity / 8)
    padded.set(used)
    for (let i = used.length; i < padded.length; i++) padded[i] = (i - used.length) % 2 === 0 ? 0xec : 0x11

    return {
      version,
      errorCorrectionLevel,
      segments: optimized!.segments,
      utf8ECI: optimized!.utf8ECI,
      bitLength: optimized!.bitLength,
      dataCodewords: padded,
      interleavedCodewords: interleaveWithErrorCorrection(padded, version, errorCorrectionLevel),
    }
  }
  throw new RangeError(requestedVersion === 'auto'
    ? `Payload exceeds QR Code Model 2 capacity at error correction ${errorCorrectionLevel}.`
    : `Payload exceeds QR version ${requestedVersion} capacity at error correction ${errorCorrectionLevel}.`)
}
