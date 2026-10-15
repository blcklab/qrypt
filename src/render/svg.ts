import type { QryptResult, SVGOptions } from '../types.js'

import { normalizeRenderOptions } from './options.js'

const MAX_SVG_DIMENSION = 65_535

/** Render a QR Code Model 2 symbol as a standalone, dependency-free SVG string.
 * The default four-module quiet zone is part of the output, not the QR matrix.
 */
export function toSVG(qr: QryptResult, options?: SVGOptions): string {
  const config = normalizeRenderOptions(options, 'SVG')
  if (typeof qr !== 'object' || qr === null ||
      !Number.isInteger(qr.version) || qr.version < 1 || qr.version > 40 ||
      qr.size !== qr.version * 4 + 17 || typeof qr.matrix !== 'function') {
    throw new TypeError('toSVG requires a valid Qrypt QR result.')
  }

  const { scale, margin, darkColor, lightColor } = config
  const moduleExtent = qr.size + margin * 2
  const pixelExtent = moduleExtent * scale
  if (!Number.isSafeInteger(moduleExtent) || !Number.isSafeInteger(pixelExtent) ||
      pixelExtent > MAX_SVG_DIMENSION) {
    throw new RangeError(`SVG dimensions must not exceed ${MAX_SVG_DIMENSION} pixels per side.`)
  }

  const matrix = qr.matrix()
  if (!Array.isArray(matrix) || matrix.length !== qr.size) {
    throw new TypeError('Qrypt matrix must contain exactly size rows.')
  }

  // Join contiguous dark modules into horizontal strips. Coordinates stay in
  // module units under viewBox; no DOM, floating-point scaling, or user text.
  const strips: string[] = []
  for (let y = 0; y < qr.size; y++) {
    const row = matrix[y]
    if (!Array.isArray(row) || row.length !== qr.size) {
      throw new TypeError(`Qrypt matrix row ${y} must contain exactly size modules.`)
    }
    let start = -1
    for (let x = 0; x <= qr.size; x++) {
      const dark = x < qr.size ? row[x] : false
      if (typeof dark !== 'boolean') {
        throw new TypeError(`Qrypt matrix module (${x}, ${y}) must be a boolean.`)
      }
      if (dark && start === -1) start = x
      if (!dark && start !== -1) {
        const run = x - start
        strips.push(`M${start + margin} ${y + margin}h${run}v1h-${run}z`)
        start = -1
      }
    }
  }

  const path = strips.join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelExtent}" height="${pixelExtent}" viewBox="0 0 ${moduleExtent} ${moduleExtent}" shape-rendering="crispEdges"><rect width="${moduleExtent}" height="${moduleExtent}" fill="${lightColor}"/><path fill="${darkColor}" d="${path}"/></svg>`
}
