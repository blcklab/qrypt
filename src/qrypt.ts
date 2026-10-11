import type { QryptOptions, QryptResult } from './types.js'
import { normalizeOptions, validateText } from './validation.js'

/**
 * Encode a string as a QR Code Model 2 symbol.
 *
 * Milestone 1 defines and validates the public contract only.
 * This intentionally fails until the encoder is implemented in milestones 2–4.
 */
export function qrypt(input: string, options?: QryptOptions): QryptResult {
  validateText(input)
  normalizeOptions(options)
  throw new Error('Qrypt encoder is not implemented (milestones 2–4).')
}
