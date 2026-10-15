import type { QryptOptions, QryptResult } from './types.js'
import { normalizeOptions, validateText } from './validation.js'
import { planEncoding } from './encoding/plan.js'
import { buildMatrix } from './matrix/matrix.js'

/** Encode a string into a complete QR Code Model 2 matrix (versions 1–40). */
export function qrypt(input: string, options?: QryptOptions): QryptResult {
  validateText(input)
  const config = normalizeOptions(options)
  const plan = planEncoding(input, config.errorCorrectionLevel, config.version)
  const symbol = buildMatrix(plan.version, plan.errorCorrectionLevel, plan.interleavedCodewords)
  const { version, errorCorrectionLevel } = plan
  const { size, mask } = symbol
  // The data buffer stays private. matrix() always supplies an independent copy.
  return {
    version,
    size,
    mask,
    errorCorrectionLevel,
    matrix(): boolean[][] {
      return Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => symbol.dark[y * size + x] === 1))
    },
  }
}
