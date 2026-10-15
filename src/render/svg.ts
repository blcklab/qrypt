import type { QryptResult, SVGOptions } from '../types.js'

const DEFAULT_SCALE = 8
const DEFAULT_MARGIN = 4
const MAX_SVG_DIMENSION = 65_535
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

interface NormalizedSVGOptions {
  readonly scale: number
  readonly margin: number
  readonly darkColor: string
  readonly lightColor: string
}

function normalizeSVGOptions(options: SVGOptions | undefined): NormalizedSVGOptions {
  if (options === undefined) {
    return { scale: DEFAULT_SCALE, margin: DEFAULT_MARGIN, darkColor: '#000000', lightColor: '#FFFFFF' }
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw new TypeError('SVG options must be a plain object.')
  }

  for (const key of Object.keys(options)) {
    if (key !== 'scale' && key !== 'margin' && key !== 'darkColor' && key !== 'lightColor') {
      throw new TypeError(`Unknown SVG option: ${key}.`)
    }
  }

  const scale = options.scale === undefined ? DEFAULT_SCALE : options.scale
  const margin = options.margin === undefined ? DEFAULT_MARGIN : options.margin
  const darkColor = options.darkColor === undefined ? '#000000' : options.darkColor
  const lightColor = options.lightColor === undefined ? '#FFFFFF' : options.lightColor

  if (!Number.isSafeInteger(scale) || scale < 1) {
    throw new RangeError('SVG scale must be a positive safe integer.')
  }
  if (!Number.isSafeInteger(margin) || margin < 0) {
    throw new RangeError('SVG margin must be a nonnegative safe integer.')
  }
  if (typeof darkColor !== 'string' || !HEX_COLOR.test(darkColor)) {
    throw new TypeError('SVG darkColor must be a #RRGGBB hexadecimal color.')
  }
  if (typeof lightColor !== 'string' || !HEX_COLOR.test(lightColor)) {
    throw new TypeError('SVG lightColor must be a #RRGGBB hexadecimal color.')
  }

  return { scale, margin, darkColor, lightColor }
}

/** Render a QR Code Model 2 symbol as a standalone, dependency-free SVG string.
 * The default four-module quiet zone is part of the output, not the QR matrix.
 */
export function toSVG(qr: QryptResult, options?: SVGOptions): string {
  const config = normalizeSVGOptions(options)
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
