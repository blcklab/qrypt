import type { ErrorCorrectionLevel } from '../types.js'

/** Flat row-major buffers keep module access cheap even for version 40. */
export interface MatrixBuffers {
  readonly size: number
  readonly dark: Uint8Array
  readonly reserved: Uint8Array
}

function put(grid: MatrixBuffers, x: number, y: number, dark: boolean): void {
  const index = y * grid.size + x
  grid.dark[index] = dark ? 1 : 0
  grid.reserved[index] = 1
}

export function alignmentPositions(version: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const last = 4 * version + 10
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count - 1) / 2) * 2
  const result = [6]
  for (let i = count - 2; i >= 0; i--) result.push(last - i * step)
  return result
}

function finder(grid: MatrixBuffers, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    const y = cy + dy
    if (y < 0 || y >= grid.size) continue
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx
      if (x < 0 || x >= grid.size) continue
      const radius = Math.max(Math.abs(dx), Math.abs(dy))
      put(grid, x, y, radius === 3 || radius <= 1)
    }
  }
}

function alignment(grid: MatrixBuffers, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      put(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
}

const FORMAT_LEVEL_BITS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

/** Writes the two BCH-protected format-information copies, plus the fixed dark module. */
export function drawFormat(grid: MatrixBuffers, level: ErrorCorrectionLevel, mask: number): void {
  const data = (FORMAT_LEVEL_BITS[level] << 3) | mask
  let remainder = data
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537)
  const bits = ((data << 10) | remainder) ^ 0x5412
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0
  for (let i = 0; i <= 5; i++) put(grid, 8, i, bit(i))
  put(grid, 8, 7, bit(6))
  put(grid, 8, 8, bit(7))
  put(grid, 7, 8, bit(8))
  for (let i = 9; i < 15; i++) put(grid, 14 - i, 8, bit(i))
  for (let i = 0; i < 8; i++) put(grid, grid.size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) put(grid, 8, grid.size - 15 + i, bit(i))
  put(grid, 8, grid.size - 8, true)
}

export function drawVersion(grid: MatrixBuffers, version: number): void {
  if (version < 7) return
  let remainder = version
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * 0x1f25)
  const bits = (version << 12) | remainder
  for (let i = 0; i < 18; i++) {
    const a = grid.size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    const value = ((bits >>> i) & 1) !== 0
    put(grid, a, b, value)
    put(grid, b, a, value)
  }
}

/** Constructs all non-data modules and reserves them against data placement/masking. */
export function createFunctionPatterns(version: number, level: ErrorCorrectionLevel): MatrixBuffers {
  const size = 4 * version + 17
  const grid: MatrixBuffers = { size, dark: new Uint8Array(size * size), reserved: new Uint8Array(size * size) }
  for (let i = 0; i < size; i++) {
    put(grid, 6, i, i % 2 === 0)
    put(grid, i, 6, i % 2 === 0)
  }
  finder(grid, 3, 3)
  finder(grid, size - 4, 3)
  finder(grid, 3, size - 4)
  const positions = alignmentPositions(version)
  for (let y = 0; y < positions.length; y++) {
    for (let x = 0; x < positions.length; x++) {
      if ((x === 0 && y === 0) || (x === 0 && y === positions.length - 1) ||
          (x === positions.length - 1 && y === 0)) continue
      alignment(grid, positions[x]!, positions[y]!)
    }
  }
  drawFormat(grid, level, 0)
  drawVersion(grid, version)
  return grid
}
