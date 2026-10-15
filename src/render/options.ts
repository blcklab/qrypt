import type { SVGOptions } from '../types.js'

export interface NormalizedRenderOptions {
  readonly scale: number
  readonly margin: number
  readonly darkColor: string
  readonly lightColor: string
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Shared validation for SVG and PNG's identical, deliberately small color/size API. */
export function normalizeRenderOptions(
  options: SVGOptions | undefined,
  renderer: 'SVG' | 'PNG',
): NormalizedRenderOptions {
  if (options === undefined) {
    return { scale: 8, margin: 4, darkColor: '#000000', lightColor: '#FFFFFF' }
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw new TypeError(`${renderer} options must be a plain object.`)
  }

  for (const key of Object.keys(options)) {
    if (key !== 'scale' && key !== 'margin' && key !== 'darkColor' && key !== 'lightColor') {
      throw new TypeError(`Unknown ${renderer} option: ${key}.`)
    }
  }

  const scale = options.scale === undefined ? 8 : options.scale
  const margin = options.margin === undefined ? 4 : options.margin
  const darkColor = options.darkColor === undefined ? '#000000' : options.darkColor
  const lightColor = options.lightColor === undefined ? '#FFFFFF' : options.lightColor

  if (!Number.isSafeInteger(scale) || scale < 1) {
    throw new RangeError(`${renderer} scale must be a positive safe integer.`)
  }
  if (!Number.isSafeInteger(margin) || margin < 0) {
    throw new RangeError(`${renderer} margin must be a nonnegative safe integer.`)
  }
  if (typeof darkColor !== 'string' || !HEX_COLOR.test(darkColor)) {
    throw new TypeError(`${renderer} darkColor must be a #RRGGBB hexadecimal color.`)
  }
  if (typeof lightColor !== 'string' || !HEX_COLOR.test(lightColor)) {
    throw new TypeError(`${renderer} lightColor must be a #RRGGBB hexadecimal color.`)
  }

  return { scale, margin, darkColor, lightColor }
}
