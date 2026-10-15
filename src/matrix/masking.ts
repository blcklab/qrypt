import type { MatrixBuffers } from './patterns.js'

export function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5: return (x * y) % 2 + (x * y) % 3 === 0
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0
    default: throw new RangeError('QR mask must be an integer from 0 to 7.')
  }
}

export function applyMask(grid: MatrixBuffers, mask: number): void {
  const { size, dark, reserved } = grid
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x
      if (reserved[index] === 0 && maskAt(mask, x, y)) dark[index] = dark[index]! ^ 1
    }
  }
}

/** The four ISO QR mask penalties, including quiet-zone-aware finder-like runs. */
export function penaltyScore(grid: MatrixBuffers): number {
  const { size, dark } = grid
  let penalty = 0
  let darkCount = 0
  const get = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= size || y >= size) return 0
    return dark[y * size + x]!
  }

  for (let y = 0; y < size; y++) {
    let run = 0
    let last = -1
    for (let x = 0; x < size; x++) {
      const value = get(x, y)
      darkCount += value
      if (value === last) run++
      else {
        if (run >= 5) penalty += 3 + run - 5
        last = value
        run = 1
      }
    }
    if (run >= 5) penalty += 3 + run - 5
  }
  for (let x = 0; x < size; x++) {
    let run = 0
    let last = -1
    for (let y = 0; y < size; y++) {
      const value = get(x, y)
      if (value === last) run++
      else {
        if (run >= 5) penalty += 3 + run - 5
        last = value
        run = 1
      }
    }
    if (run >= 5) penalty += 3 + run - 5
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const value = get(x, y)
      if (get(x + 1, y) === value && get(x, y + 1) === value && get(x + 1, y + 1) === value) penalty += 3
    }
  }

  // Finder-like 1:1:3:1:1 pattern, with four white modules on either side.
  // Treat the area outside the symbol as white for edge-adjacent patterns.
  const first = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  const second = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
  for (let axis = 0; axis < 2; axis++) {
    for (let fixed = 0; fixed < size; fixed++) {
      for (let start = -4; start < size; start++) {
        let matchFirst = true
        let matchSecond = true
        for (let j = 0; j < 11; j++) {
          const value = axis === 0 ? get(start + j, fixed) : get(fixed, start + j)
          if (value !== first[j]) matchFirst = false
          if (value !== second[j]) matchSecond = false
          if (!matchFirst && !matchSecond) break
        }
        if (matchFirst || matchSecond) penalty += 40
      }
    }
  }
  const total = size * size
  penalty += 10 * Math.max(0, Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1)
  return penalty
}
