import { gfMultiply } from '../ecc/reed-solomon.js'

/** RS decoding over QR's GF(256) with generator roots alpha^0..alpha^(degree-1).
 * Unknown byte errors only; no erasure hints. Fail closed when the ECC budget is exceeded.
 */
function power(exponent: number): number {
  let value = 1
  const e = ((exponent % 255) + 255) % 255
  for (let i = 0; i < e; i++) value = gfMultiply(value, 2)
  return value
}
function inverse(value: number): number {
  if (!value) throw new RangeError('Invalid Reed–Solomon zero divisor.')
  // The field is small, so exponentiation suffices without global tables.
  let result = 1
  let base = value
  for (let exponent = 254; exponent > 0; exponent >>>= 1) {
    if (exponent & 1) result = gfMultiply(result, base)
    base = gfMultiply(base, base)
  }
  return result
}
function evaluateHigh(coefficients: Uint8Array, at: number): number {
  let result = 0
  for (const c of coefficients) result = gfMultiply(result, at) ^ c
  return result
}
function evaluateLow(coefficients: readonly number[], at: number): number {
  let result = 0
  for (let i = coefficients.length - 1; i >= 0; i--) result = gfMultiply(result, at) ^ coefficients[i]!
  return result
}

/** Returns corrected block and number of corrected codewords; rejects uncorrectable blocks. */
export function repairBlock(block: Uint8Array, eccBytes: number): { bytes: Uint8Array; corrected: number } {
  if (!(block instanceof Uint8Array) || !Number.isInteger(eccBytes) || eccBytes < 1 ||
      eccBytes > 30 || block.length <= eccBytes || block.length > 255) {
    throw new RangeError('Invalid QR Reed–Solomon block layout.')
  }
  const syndromes = Array.from({ length: eccBytes }, (_, i) => evaluateHigh(block, power(i)))
  if (syndromes.every(s => s === 0)) return { bytes: block.slice(), corrected: 0 }

  // Berlekamp–Massey: error locator polynomial in ascending coefficient order.
  let locator = [1]
  let previous = [1]
  let degree = 0
  let shift = 1
  let last = 1
  for (let n = 0; n < eccBytes; n++) {
    let discrepancy = syndromes[n]!
    for (let j = 1; j <= degree; j++) discrepancy ^= gfMultiply(locator[j] ?? 0, syndromes[n - j]!)
    if (discrepancy === 0) {
      shift++
      continue
    }
    const before = locator.slice()
    const scale = gfMultiply(discrepancy, inverse(last))
    while (locator.length < previous.length + shift) locator.push(0)
    for (let j = 0; j < previous.length; j++) {
      locator[j + shift] = locator[j + shift]! ^ gfMultiply(scale, previous[j]!)
    }
    if (2 * degree <= n) {
      degree = n + 1 - degree
      previous = before
      last = discrepancy
      shift = 1
    } else shift++
  }
  if (degree < 1 || degree * 2 > eccBytes) throw new Error('QR Reed–Solomon errors exceed correction capacity.')

  // Locate roots Lambda(alpha^(-exponent)), exponent = block length - 1 - position.
  const locations: { pos: number; exponent: number }[] = []
  for (let pos = 0; pos < block.length; pos++) {
    const exponent = block.length - 1 - pos
    if (evaluateLow(locator, power(-exponent)) === 0) locations.push({ pos, exponent })
  }
  if (locations.length !== degree) throw new Error('QR Reed–Solomon could not locate corrupted codewords.')

  // Solve S_j = sum(error_i * (alpha^exponent_i)^j) for magnitudes.
  // The number of QR errors per block is at most 15, so Gaussian elimination
  // is compact, deterministic and avoids special-case Forney conventions.
  const n = locations.length
  const equations = Array.from({ length: n }, (_, row) => {
    const values = locations.map(({ exponent }) => power(exponent * row))
    values.push(syndromes[row]!)
    return values
  })
  for (let column = 0; column < n; column++) {
    let pivot = column
    while (pivot < n && equations[pivot]![column] === 0) pivot++
    if (pivot === n) throw new Error('QR Reed–Solomon correction is singular.')
    ;[equations[column], equations[pivot]] = [equations[pivot]!, equations[column]!]
    const row = equations[column]!
    const factor = inverse(row[column]!)
    for (let j = column; j <= n; j++) row[j] = gfMultiply(row[j]!, factor)
    for (let i = 0; i < n; i++) {
      if (i === column) continue
      const other = equations[i]!
      const multiplier = other[column]!
      if (!multiplier) continue
      for (let j = column; j <= n; j++) other[j] = other[j]! ^ gfMultiply(multiplier, row[j]!)
    }
  }
  const fixed = block.slice()
  for (let i = 0; i < n; i++) fixed[locations[i]!.pos] = fixed[locations[i]!.pos]! ^ equations[i]![n]!
  if (syndromes.some((_, i) => evaluateHigh(fixed, power(i)) !== 0)) {
    throw new Error('QR Reed–Solomon verification failed after correction.')
  }
  return { bytes: fixed, corrected: n }
}
