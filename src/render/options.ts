import type { PixelOptions, SVGOptions } from '../types.js'

export interface NormalizedRenderOptions {
  readonly scale: number
  readonly margin: number
  readonly darkColor: string
  readonly lightColor: string
  readonly darkAlpha: number
  readonly lightAlpha: number
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Pure, strict renderer validation. Alpha is supported only by RGBA/PNG paths. */
export function normalizeRenderOptions(
  options: SVGOptions | PixelOptions | undefined,
  renderer: 'SVG' | 'PNG' | 'Pixels',
): NormalizedRenderOptions {
  if (options === undefined) {
    return { scale: 8, margin: 4, darkColor: '#000000', lightColor: '#FFFFFF', darkAlpha: 255, lightAlpha: 255 }
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw new TypeError(`${renderer} options must be a plain object.`)
  }
  const alphaAllowed = renderer !== 'SVG'
  for (const key of Object.keys(options)) {
    if (key !== 'scale' && key !== 'margin' && key !== 'darkColor' && key !== 'lightColor' &&
        !(alphaAllowed && (key === 'darkAlpha' || key === 'lightAlpha'))) {
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
  const pixelOptions = options as PixelOptions
  const darkAlpha = alphaAllowed && pixelOptions.darkAlpha !== undefined ? pixelOptions.darkAlpha : 255
  const lightAlpha = alphaAllowed && pixelOptions.lightAlpha !== undefined ? pixelOptions.lightAlpha : 255
  if (!Number.isInteger(darkAlpha) || darkAlpha < 0 || darkAlpha > 255) {
    throw new RangeError(`${renderer} darkAlpha must be an integer between 0 and 255.`)
  }
  if (!Number.isInteger(lightAlpha) || lightAlpha < 0 || lightAlpha > 255) {
    throw new RangeError(`${renderer} lightAlpha must be an integer between 0 and 255.`)
  }
  return { scale, margin, darkColor, lightColor, darkAlpha, lightAlpha }
}
