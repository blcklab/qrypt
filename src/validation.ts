import type { ErrorCorrectionLevel, QryptOptions } from './types.js'

export interface NormalizedQryptOptions {
  readonly errorCorrectionLevel: ErrorCorrectionLevel
  readonly version: number | 'auto'
}

/** Reject ill-formed UTF-16 rather than silently replacing characters during UTF-8 encoding. */
export function validateText(input: unknown): asserts input is string {
  if (typeof input !== 'string') {
    throw new TypeError('Qrypt input must be a string.')
  }

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`Qrypt input contains an unpaired high surrogate at index ${i}.`)
      }
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`Qrypt input contains an unpaired low surrogate at index ${i}.`)
    }
  }
}

export function normalizeOptions(options: QryptOptions | undefined): NormalizedQryptOptions {
  if (options === undefined) {
    return { errorCorrectionLevel: 'M', version: 'auto' }
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw new TypeError('Qrypt options must be a plain object.')
  }

  for (const key of Object.keys(options)) {
    if (key !== 'errorCorrectionLevel' && key !== 'version') {
      throw new TypeError(`Unknown Qrypt option: ${key}.`)
    }
  }

  const errorCorrectionLevel = options.errorCorrectionLevel === undefined ? 'M' : options.errorCorrectionLevel
  if (errorCorrectionLevel !== 'L' && errorCorrectionLevel !== 'M' &&
      errorCorrectionLevel !== 'Q' && errorCorrectionLevel !== 'H') {
    throw new RangeError('errorCorrectionLevel must be L, M, Q, or H.')
  }

  const version = options.version === undefined ? 'auto' : options.version
  if (version !== 'auto' && (!Number.isInteger(version) || version < 1 || version > 40)) {
    throw new RangeError('version must be auto or an integer from 1 to 40.')
  }

  return { errorCorrectionLevel, version }
}
