import { validateText } from '../validation.js'
import type { SecureJsonValue, SecureKey } from './types.js'

export function nonEmptyString(value: unknown, name: string, max = 256): asserts value is string {
  validateText(value)
  if (value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || value.trim() !== value) {
    throw new TypeError(`${name} must be a nonempty, bounded string without controls or surrounding whitespace.`)
  }
}

export function identifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) {
    throw new TypeError(`${name} must be 1–64 safe ASCII identifier characters.`)
  }
}

export function unixSeconds(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 253402300799) {
    throw new RangeError(`${name} must be a nonnegative Unix timestamp in whole seconds.`)
  }
}

export function positiveSeconds(value: unknown, name: string, max: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new RangeError(`${name} must be an integer from 1 through ${max}.`)
  }
}

export function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Makes JSON serialization predictable and rejects ambient custom behavior. */
export function normalizeJSON(value: unknown, depth = 0): SecureJsonValue {
  if (depth > 16) throw new TypeError('Secure QR data nesting exceeds 16 levels.')
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    validateText(value)
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Secure QR data contains a nonfinite number.')
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 256) throw new TypeError('Secure QR data array is too large.')
    if (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, i) => i).some(i => !Object.prototype.hasOwnProperty.call(value, i))) {
      throw new TypeError('Secure QR data must not contain sparse arrays or extra array properties.')
    }
    return value.map(item => normalizeJSON(item, depth + 1))
  }
  if (!plainRecord(value)) throw new TypeError('Secure QR data must consist of plain JSON values.')
  const names = Object.keys(value).sort()
  if (names.length > 128) throw new TypeError('Secure QR data contains too many properties.')
  const result: Record<string, SecureJsonValue> = Object.create(null) as Record<string, SecureJsonValue>
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const name of names) {
    validateText(name)
    if (!('value' in descriptors[name]!)) throw new TypeError('Secure QR data cannot contain accessors.')
    if (name === '__proto__' || name === 'constructor' || name === 'prototype') throw new TypeError('Unsafe secure QR data property.')
    result[name] = normalizeJSON(value[name], depth + 1)
  }
  return result
}

export function validateKey(value: unknown, usage: 'sign' | 'verify'): asserts value is SecureKey {
  if (!value || typeof value !== 'object') throw new TypeError('A WebCrypto ECDSA P-256 key is required.')
  const key = value as Partial<SecureKey>
  if (key.type !== (usage === 'sign' ? 'private' : 'public') || key.algorithm?.name !== 'ECDSA' ||
      key.algorithm.namedCurve !== 'P-256' || !Array.isArray(key.usages) || !key.usages.includes(usage)) {
    throw new TypeError(`A WebCrypto ECDSA P-256 ${usage} key is required.`)
  }
}

export function onlyFields(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) throw new TypeError(`Unknown ${name} option: ${field}.`)
  }
}
