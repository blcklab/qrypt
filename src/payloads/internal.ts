import { validateText } from '../validation.js'

/** Portable payload validation; never sends data or generates QR modules. */
export function record(input: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new TypeError(`${label} must be a plain object.`)
  }
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new TypeError(`Unknown ${label} field: ${key}.`)
  }
  return input as Record<string, unknown>
}

export function text(input: unknown, name: string, opts: { empty?: boolean; multiline?: boolean } = {}): string {
  validateText(input)
  if (!opts.empty && !input.length) throw new RangeError(`${name} must not be empty.`)
  if (opts.multiline) {
    if (/[\u0000-\u0009\u000b-\u000c\u000e-\u001f\u007f]/u.test(input)) {
      throw new TypeError(`${name} contains unsupported control characters.`)
    }
  } else if (/[\u0000-\u001f\u007f]/u.test(input)) {
    throw new TypeError(`${name} contains unsupported control characters.`)
  }
  return input
}

export function optionalText(input: unknown, name: string, multiline = false): string | undefined {
  return input === undefined ? undefined : text(input, name, { multiline, empty: true })
}

export function encodeUriComponent(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** RFC 6350 and RFC 5545 TEXT value escaping. */
export function escapeText(input: string): string {
  return input.replace(/\r\n?|\n|[\\;,]/g, match =>
    match === '\r' || match === '\n' || match === '\r\n' ? '\\n' : `\\${match}`)
}

function charBytes(char: string): number {
  const point = char.codePointAt(0)!
  return point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
}

export function utf8Length(input: string): number {
  let length = 0
  for (const char of input) length += charBytes(char)
  return length
}

/** Fold at 75 UTF-8 octets, preserving multi-byte characters. */
export function foldLine(line: string): string {
  let result = ''
  let width = 0
  for (const char of line) {
    const bytes = charBytes(char)
    if (width + bytes > 75) {
      result += '\r\n '
      width = 1
    }
    result += char
    width += bytes
  }
  return result
}

export function foldedDocument(lines: string[]): string {
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Conservative international E.164 subset; local phone-context not supported yet. */
export function e164(input: unknown): string {
  const number = text(input, 'phone')
  if (!/^\+[1-9][0-9]{1,14}$/u.test(number)) {
    throw new RangeError('phone must be an international E.164 number such as +639171234567.')
  }
  return number
}

/** Common ASCII email addresses. Full RFC 5322 quoted/EAI addresses are outside M10. */
export function emailAddress(input: unknown): string {
  const address = text(input, 'email address')
  const parts = address.split('@')
  const local = parts[0] ?? ''
  const domain = parts[1] ?? ''
  if (parts.length !== 2 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/u.test(domain) ||
      address.length > 254) {
    throw new RangeError('email address must be a conventional ASCII mailbox address.')
  }
  return address
}
