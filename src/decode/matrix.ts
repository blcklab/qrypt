import type { ErrorCorrectionLevel } from '../types.js'
import { getDataCodewords, getECCLayout, getRawDataModules } from '../encoding/capacity.js'
import { maskAt } from '../matrix/masking.js'
import { createFunctionPatterns } from '../matrix/patterns.js'
import { repairBlock } from './reed-solomon.js'

export interface MatrixData {
  readonly version: number
  readonly size: number
  readonly mask: number
  readonly errorCorrectionLevel: ErrorCorrectionLevel
  readonly data: Uint8Array
  readonly correctedErrors: number
}

/** Validate an exact QR Model 2 module matrix; no quiet zone and no implicit cropping. */
function readModules(matrix: boolean[][]): { size: number; dark: Uint8Array; version: number } {
  if (!Array.isArray(matrix)) throw new TypeError('QR matrix must be a boolean[][] array.')
  const size = matrix.length
  if (size < 21 || size > 177 || (size - 17) % 4 !== 0) throw new RangeError('Invalid QR Model 2 matrix dimensions.')
  const dark = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    const row = matrix[y]
    if (!Array.isArray(row) || row.length !== size) throw new TypeError('QR matrix must be square.')
    for (let x = 0; x < size; x++) {
      if (typeof row[x] !== 'boolean') throw new TypeError('QR modules must be booleans.')
      dark[y * size + x] = row[x] ? 1 : 0
    }
  }
  return { size, dark, version: (size - 17) / 4 }
}
function hamming(a: number, b: number): number {
  let bits = a ^ b
  let count = 0
  while (bits) { count++; bits &= bits - 1 }
  return count
}
const LEVEL_BITS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }
function formatCodeword(level: ErrorCorrectionLevel, mask: number): number {
  const data = LEVEL_BITS[level] << 3 | mask
  let remainder = data
  for (let i = 0; i < 10; i++) remainder = remainder << 1 ^ ((remainder >>> 9) & 1) * 0x537
  return (data << 10 | remainder) ^ 0x5412
}
function decodeFormat(dark: Uint8Array, size: number): { level: ErrorCorrectionLevel; mask: number } {
  const get = (x: number, y: number): number => dark[y * size + x]!
  let first = 0
  for (let i = 0; i <= 5; i++) first |= get(8, i) << i
  first |= get(8, 7) << 6
  first |= get(8, 8) << 7
  first |= get(7, 8) << 8
  for (let i = 9; i < 15; i++) first |= get(14 - i, 8) << i
  let second = 0
  for (let i = 0; i < 8; i++) second |= get(size - 1 - i, 8) << i
  for (let i = 8; i < 15; i++) second |= get(8, size - 15 + i) << i
  let best: { level: ErrorCorrectionLevel; mask: number } | undefined
  let distance = 4
  let ambiguous = false
  for (const level of ['L', 'M', 'Q', 'H'] as const) for (let mask = 0; mask < 8; mask++) {
    const code = formatCodeword(level, mask)
    const candidate = Math.min(hamming(first, code), hamming(second, code))
    if (candidate < distance) { best = { level, mask }; distance = candidate; ambiguous = false }
    else if (candidate === distance) ambiguous = true
  }
  if (!best || ambiguous) throw new Error('QR format information is damaged beyond BCH recovery.')
  return best
}
function versionCodeword(version: number): number {
  let remainder = version
  for (let i = 0; i < 12; i++) remainder = remainder << 1 ^ ((remainder >>> 11) & 1) * 0x1f25
  return version << 12 | remainder
}
function verifyVersion(dark: Uint8Array, size: number, version: number): void {
  if (version < 7) return
  let a = 0, b = 0
  for (let i = 0; i < 18; i++) {
    const x = size - 11 + (i % 3)
    const y = Math.floor(i / 3)
    a |= dark[y * size + x]! << i
    b |= dark[x * size + y]! << i
  }
  const expected = versionCodeword(version)
  if (Math.min(hamming(a, expected), hamming(b, expected)) > 3) {
    throw new Error('QR version information is inconsistent with matrix dimensions.')
  }
}

/** Extract, deinterleave and correct full QR codewords. */
export function readMatrixData(matrix: boolean[][]): MatrixData {
  const { size, dark, version } = readModules(matrix)
  const { level, mask } = decodeFormat(dark, size)
  verifyVersion(dark, size, version)
  const reserved = createFunctionPatterns(version, level).reserved
  const bitLength = getRawDataModules(version)
  const totalBytes = Math.floor(bitLength / 8)
  const interleaved = new Uint8Array(totalBytes)
  let bit = 0
  let up = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let offset = 0; offset < size; offset++) {
      const y = up ? size - 1 - offset : offset
      for (let column = 0; column < 2; column++) {
        const x = right - column
        const index = y * size + x
        if (reserved[index]) continue
        if (bit < totalBytes * 8) {
          const value = dark[index]! ^ (maskAt(mask, x, y) ? 1 : 0)
          interleaved[bit >>> 3] = interleaved[bit >>> 3]! | value << (7 - (bit & 7))
        }
        bit++
      }
    }
    up = !up
  }
  if (bit !== bitLength) throw new Error('QR matrix codeword length is inconsistent.')
  const { blockCount, eccCodewordsPerBlock } = getECCLayout(version, level)
  const shortCount = blockCount - totalBytes % blockCount
  const shortDataLength = Math.floor(totalBytes / blockCount) - eccCodewordsPerBlock
  const dataBlocks: Uint8Array[] = []
  for (let i = 0; i < blockCount; i++) dataBlocks.push(new Uint8Array(shortDataLength + (i >= shortCount ? 1 : 0) + eccCodewordsPerBlock))
  let read = 0
  for (let column = 0; column <= shortDataLength; column++) {
    for (let i = 0; i < blockCount; i++) {
      const block = dataBlocks[i]!
      const dataLength = block.length - eccCodewordsPerBlock
      if (column < dataLength) block[column] = interleaved[read++]!
    }
  }
  for (let column = 0; column < eccCodewordsPerBlock; column++) {
    for (const block of dataBlocks) block[block.length - eccCodewordsPerBlock + column] = interleaved[read++]!
  }
  if (read !== totalBytes) throw new Error('QR matrix interleaving mismatch.')
  const output = new Uint8Array(getDataCodewords(version, level))
  let write = 0
  let correctedErrors = 0
  for (const block of dataBlocks) {
    const corrected = repairBlock(block, eccCodewordsPerBlock)
    correctedErrors += corrected.corrected
    const dataLength = block.length - eccCodewordsPerBlock
    output.set(corrected.bytes.subarray(0, dataLength), write)
    write += dataLength
  }
  if (write !== output.length) throw new Error('QR decoded data length mismatch.')
  return { version, size, mask, errorCorrectionLevel: level, data: output, correctedErrors }
}
