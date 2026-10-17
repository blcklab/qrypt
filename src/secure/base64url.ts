/** RFC 7515 base64url without padding. Only used for bounded JWS fields. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function encodeBase64url(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    result += ALPHABET[a >>> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >>> 4)]!
    if (b !== undefined) result += ALPHABET[((b & 15) << 2) | ((c ?? 0) >>> 6)]!
    if (c !== undefined) result += ALPHABET[c & 63]!
  }
  return result
}

export function decodeBase64url(input: string, maxBytes: number): Uint8Array {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]*$/.test(input) || input.length % 4 === 1 || input.length > Math.ceil(maxBytes * 4 / 3) + 2) {
    throw new TypeError('Invalid base64url encoding.')
  }
  const output = new Uint8Array(Math.floor(input.length * 3 / 4))
  let offset = 0
  let bits = 0
  let value = 0
  for (const character of input) {
    const digit = ALPHABET.indexOf(character)
    value = ((value << 6) | digit) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output[offset++] = (value >>> bits) & 255
    }
  }
  if (encodeBase64url(output.subarray(0, offset)) !== input) {
    throw new TypeError('Noncanonical base64url encoding.')
  }
  return output.subarray(0, offset)
}

export function decodeUTF8(bytes: Uint8Array): string {
  // decodeURIComponent rejects ill-formed UTF-8 instead of inserting U+FFFD.
  let percent = ''
  for (const byte of bytes) percent += `%${byte.toString(16).padStart(2, '0')}`
  return decodeURIComponent(percent)
}
