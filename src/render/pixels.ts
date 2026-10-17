import type { PixelBuffer, PixelOptions, QryptResult } from '../types.js'
import { normalizeRenderOptions } from './options.js'

/** Bound allocations for RGBA: width² × 4, with a separate PNG scanline copy. */
export const MAX_RGBA_PIXELS = 4_194_304
export const MAX_RGBA_DIMENSION = 8192

export function validateQRMatrix(qr: QryptResult): boolean[][] {
  if (typeof qr !== 'object' || qr === null ||
      !Number.isInteger(qr.version) || qr.version < 1 || qr.version > 40 ||
      qr.size !== qr.version * 4 + 17 || typeof qr.matrix !== 'function') {
    throw new TypeError('Rendering requires a valid Qrypt QR result.')
  }
  const matrix = qr.matrix()
  if (!Array.isArray(matrix) || matrix.length !== qr.size) {
    throw new TypeError('Qrypt matrix must contain exactly size rows.')
  }
  for (let y = 0; y < qr.size; y++) {
    const row = matrix[y]
    if (!Array.isArray(row) || row.length !== qr.size) {
      throw new TypeError(`Qrypt matrix row ${y} must contain exactly size modules.`)
    }
    for (const dark of row) {
      if (typeof dark !== 'boolean') throw new TypeError('Qrypt matrix modules must be booleans.')
    }
  }
  return matrix
}

/** Generate raw RGBA bytes without Canvas, DOM, filesystem, or Node APIs.
 * The quiet zone is lightColor/lightAlpha; matrix() itself excludes it.
 */
export function toPixels(qr: QryptResult, options?: PixelOptions): PixelBuffer {
  const { scale, margin, darkColor, lightColor, darkAlpha, lightAlpha } = normalizeRenderOptions(options, 'Pixels')
  // Validate QR *before* looking up its size or allocating any buffers.
  const matrix = validateQRMatrix(qr)
  const modules = qr.size + 2 * margin
  const width = modules * scale
  if (!Number.isSafeInteger(modules) || !Number.isSafeInteger(width) ||
      width > MAX_RGBA_DIMENSION || width * width > MAX_RGBA_PIXELS) {
    throw new RangeError(`RGBA output may not exceed ${MAX_RGBA_DIMENSION} pixels per side or ${MAX_RGBA_PIXELS} total pixels.`)
  }
  const dark = [Number.parseInt(darkColor.slice(1, 3), 16), Number.parseInt(darkColor.slice(3, 5), 16), Number.parseInt(darkColor.slice(5, 7), 16), darkAlpha]
  const light = [Number.parseInt(lightColor.slice(1, 3), 16), Number.parseInt(lightColor.slice(3, 5), 16), Number.parseInt(lightColor.slice(5, 7), 16), lightAlpha]
  const data = new Uint8ClampedArray(width * width * 4)
  // Interleaved RGBA buffer; alpha is straight/unassociated (not premultiplied).
  for (let y = 0; y < width; y++) {
    const moduleY = Math.floor(y / scale) - margin
    const row = moduleY >= 0 && moduleY < qr.size ? matrix[moduleY] : undefined
    let offset = y * width * 4
    for (let x = 0; x < width; x++) {
      const moduleX = Math.floor(x / scale) - margin
      const rgba = row && moduleX >= 0 && moduleX < qr.size && row[moduleX] ? dark : light
      data[offset++] = rgba[0]!
      data[offset++] = rgba[1]!
      data[offset++] = rgba[2]!
      data[offset++] = rgba[3]!
    }
  }
  return { width, height: width, data }
}
