/** QR Code Model 2 decoding from already-sampled boolean module matrices.
 * No camera, image detection, network, DOM or Node-specific APIs.
 */
import { readMatrixData } from './decode/matrix.js'
import { decodePayload } from './decode/payload.js'
export type { DecodedQR, DecodedSegment } from './decode/payload.js'

/** Decode a square QR module matrix without its quiet zone (matrix[y][x]).
 * Corrects codeword errors within the QR's Reed–Solomon capability.
 * Unsupported encoding modes/ECI assignments reject explicitly.
 */
export function decodeMatrix(matrix: boolean[][]) {
  return decodePayload(readMatrixData(matrix))
}

export { decodePixels } from './decode/image.js'
export type { QRImage, QRPoint, ImageDecodedQR, ImageDecodeOptions } from './decode/image.js'

/** Reassemble completed, validated QR structured-append BYTE parts.
 * XOR parity guards against accidental mixups; it is NOT a cryptographic integrity check.
 */
export function assembleStructuredAppend(results: readonly import('./decode/payload.js').DecodedQR[]): Uint8Array {
  if (!Array.isArray(results) || results.length < 2 || results.length > 16) throw new RangeError('Expected 2 to 16 decoded QR parts.')
  const first = results[0]?.structuredAppend
  if (!first || first.total !== results.length) throw new Error('Incomplete QR structured-append set.')
  const ordered: Uint8Array[] = new Array(first.total)
  for (const part of results) {
    const info = part.structuredAppend
    if (!info || info.total !== first.total || info.parity !== first.parity || !part.bytes || ordered[info.index]) {
      throw new Error('Duplicate, mixed, or non-byte structured-append part.')
    }
    ordered[info.index] = part.bytes
  }
  let parity = 0
  let length = 0
  for (const part of ordered) {
    if (!part) throw new Error('Missing structured-append part.')
    length += part.length
    for (const byte of part) parity ^= byte
  }
  if (parity !== first.parity) throw new Error('Structured-append XOR parity mismatch.')
  const combined = new Uint8Array(length)
  let offset = 0
  for (const part of ordered) { combined.set(part, offset); offset += part.length }
  return combined
}
