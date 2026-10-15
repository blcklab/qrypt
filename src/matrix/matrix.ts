import type { ErrorCorrectionLevel } from '../types.js'
import { getRawDataModules } from '../encoding/capacity.js'
import { applyMask, penaltyScore } from './masking.js'
import { createFunctionPatterns, drawFormat } from './patterns.js'

export interface EncodedMatrix {
  readonly mask: number
  readonly size: number
  /** Row-major 0/1 bits with no quiet zone. Not exported from the public API. */
  readonly dark: Uint8Array
}

/** Places MSB-first interleaved codeword bits in the QR zig-zag column order. */
export function buildMatrix(version: number, level: ErrorCorrectionLevel, codewords: Uint8Array): EncodedMatrix {
  const rawBits = getRawDataModules(version)
  if (codewords.length !== Math.floor(rawBits / 8)) throw new RangeError('Incorrect interleaved QR codeword count.')
  const grid = createFunctionPatterns(version, level)
  const { size, dark, reserved } = grid
  let bit = 0
  let placed = 0
  let up = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let offset = 0; offset < size; offset++) {
      const y = up ? size - 1 - offset : offset
      for (let column = 0; column < 2; column++) {
        const x = right - column
        const index = y * size + x
        if (reserved[index]) continue
        if (bit < codewords.length * 8) {
          dark[index] = (codewords[bit >>> 3]! >>> (7 - (bit & 7))) & 1
          bit++
        } // Remainder modules must be zero before the mask is applied.
        placed++
      }
    }
    up = !up
  }
  if (bit !== codewords.length * 8 || placed !== rawBits) {
    throw new Error(`Internal QR placement mismatch: placed ${placed}/${rawBits} modules, used ${bit} data bits.`)
  }

  let bestMask = 0
  let lowestPenalty = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(grid, mask)
    drawFormat(grid, level, mask)
    const score = penaltyScore(grid)
    if (score < lowestPenalty) {
      lowestPenalty = score
      bestMask = mask
    }
    applyMask(grid, mask)
  }
  applyMask(grid, bestMask)
  drawFormat(grid, level, bestMask)
  return { mask: bestMask, size, dark }
}
