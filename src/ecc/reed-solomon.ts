/**
 * Reed–Solomon parity for QR Code Model 2.
 * Arithmetic is in GF(2^8), primitive polynomial x^8+x^4+x^3+x^2+1
 * (0x11D), with consecutive generator roots 2^0, 2^1, ... .
 * Everything here is platform-neutral and has no stateful caches.
 */

/** Multiply two GF(256) elements with reduction modulo 0x11D. */
export function gfMultiply(a: number, b: number): number {
  let value = a
  let product = 0
  for (let bit = 0; bit < 8; bit++) {
    if ((b & 1) !== 0) product ^= value
    b >>>= 1
    value = (value << 1) ^ ((value & 0x80) !== 0 ? 0x11d : 0)
  }
  return product
}

/**
 * Monic generator polynomial in descending power order, including the
 * leading coefficient. QR blocks use only degrees 7..30, but any degree
 * from 1..255 is valid for this internal helper.
 */
export function generatorPolynomial(degree: number): Uint8Array {
  if (!Number.isInteger(degree) || degree < 1 || degree > 255) {
    throw new RangeError('Reed–Solomon generator degree must be between 1 and 255.')
  }
  const coefficients = new Uint8Array(degree + 1)
  coefficients[0] = 1
  let root = 1
  for (let size = 1; size <= degree; size++) {
    // Multiply the previous polynomial by (x + root), descending to
    // preserve coefficients not yet visited.
    for (let j = size; j >= 1; j--) {
      coefficients[j] = coefficients[j]! ^ gfMultiply(coefficients[j - 1]!, root)
    }
    root = gfMultiply(root, 2)
  }
  return coefficients
}

/** Returns exactly `degree` parity bytes, even when leading bytes are zero. */
export function reedSolomonRemainder(data: Uint8Array, degree: number): Uint8Array {
  const generator = generatorPolynomial(degree)
  const remainder = new Uint8Array(degree)
  for (const byte of data) {
    const factor = byte ^ remainder[0]!
    remainder.copyWithin(0, 1)
    remainder[degree - 1] = 0
    for (let i = 0; i < degree; i++) {
      remainder[i] = remainder[i]! ^ gfMultiply(generator[i + 1]!, factor)
    }
  }
  return remainder
}
