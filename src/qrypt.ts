import type { QryptOptions, QryptResult } from './types.js'
import { normalizeOptions, validateText } from './validation.js'

/**
 * Encode a string as a QR Code Model 2 symbol.
 *
 * Milestones 1–3 define the API, encode payloads and interleave ECC.
 * The public function intentionally fails until QR matrix construction in milestone 4.
 */
export function qrypt(input: string, options?: QryptOptions): QryptResult {
  validateText(input)
  normalizeOptions(options)
  throw new Error('Qrypt encoder is not implemented (milestones 2–4).')
}
