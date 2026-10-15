import type { ErrorCorrectionLevel } from '../types.js'
import { getDataCodewords, getECCLayout, getRawDataModules } from '../encoding/capacity.js'
import { reedSolomonRemainder } from './reed-solomon.js'

/**
 * Turns fully padded data codewords into the QR's interleaved data+ECC
 * codeword stream. Remainder *bits* (0..7) are handled by matrix placement.
 *
 * QR block groups differ by at most one data codeword. Short blocks come
 * first; data codewords are interleaved separately from ECC codewords.
 */
export function interleaveWithErrorCorrection(
  data: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
): Uint8Array {
  const expectedData = getDataCodewords(version, level)
  if (!(data instanceof Uint8Array) || data.length !== expectedData) {
    throw new RangeError(`Expected exactly ${expectedData} data codewords for QR v${version}-${level}.`)
  }

  const { blockCount, eccCodewordsPerBlock } = getECCLayout(version, level)
  const total = Math.floor(getRawDataModules(version) / 8)
  const shortBlocks = blockCount - (total % blockCount)
  const shortDataLength = Math.floor(total / blockCount) - eccCodewordsPerBlock
  const blocks: Uint8Array[] = []
  const checks: Uint8Array[] = []
  let offset = 0

  for (let i = 0; i < blockCount; i++) {
    const length = shortDataLength + (i >= shortBlocks ? 1 : 0)
    const block = data.subarray(offset, offset + length)
    blocks.push(block)
    checks.push(reedSolomonRemainder(block, eccCodewordsPerBlock))
    offset += length
  }
  if (offset !== expectedData) throw new Error('Internal QR data-block partition mismatch.')

  const interleaved = new Uint8Array(total)
  let write = 0
  for (let column = 0; column <= shortDataLength; column++) {
    for (const block of blocks) {
      if (column < block.length) interleaved[write++] = block[column]!
    }
  }
  for (let column = 0; column < eccCodewordsPerBlock; column++) {
    for (const check of checks) interleaved[write++] = check[column]!
  }
  if (write !== total) throw new Error('Internal QR interleaving length mismatch.')
  return interleaved
}
