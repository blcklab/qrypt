import type { PixelBuffer, QryptResult, SVGOptions } from '../types.js'
import { createFunctionPatterns } from '../matrix/patterns.js'
import { validateQRMatrix, MAX_RGBA_DIMENSION, MAX_RGBA_PIXELS } from './pixels.js'
import { normalizeRenderOptions } from './options.js'
import { encodeRGBAPNG } from './png.js'

export type ModuleShape = 'square' | 'rounded' | 'dot'
export type FinderStyle = 'square' | 'rounded'
export interface StyledGradient {
  /** Colors must be opaque 6-digit hex values. */
  from: string
  to: string
  direction?: 'horizontal' | 'vertical'
}
export interface StyledOptions extends SVGOptions {
  moduleShape?: ModuleShape
  finderStyle?: FinderStyle
  /** Optional foreground gradient; replaces darkColor. Background stays solid. */
  gradient?: StyledGradient
}

type Rgb = readonly [number, number, number]
interface StylePlan {
  readonly qr: QryptResult
  readonly matrix: boolean[][]
  readonly reserved: Uint8Array
  readonly scale: number
  readonly margin: number
  readonly width: number
  readonly moduleShape: ModuleShape
  readonly finderStyle: FinderStyle
  readonly background: Rgb
  readonly foreground: Rgb
  readonly gradient: { from: Rgb; to: Rgb; direction: 'horizontal' | 'vertical' } | undefined
}
const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_SVG_DIMENSION = 65_535
const finders = (size: number): [number, number][] => [[0, 0], [size - 7, 0], [0, size - 7]]
const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const hex = (c: Rgb): string => '#' + c.map(value => value.toString(16).padStart(2, '0')).join('')
const luminance = (rgb: Rgb): number => {
  const channels = rgb.map(channel => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}
function requireContrast(foreground: Rgb, background: Rgb): void {
  const light = luminance(background)
  const dark = luminance(foreground)
  if (light <= dark || (light + 0.05) / (dark + 0.05) < 4.5) {
    throw new RangeError('Styled QR foreground must be darker than its background with at least 4.5:1 contrast.')
  }
}
/** Stable per-gradient ID for embedding distinct SVGs inline in one document. */
function gradientIdentifier(signature: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `qrypt-gradient-${(hash >>> 0).toString(16)}`
}
const lerp = (start: Rgb, end: Rgb, t: number): Rgb => [
  Math.round(start[0] + (end[0] - start[0]) * t),
  Math.round(start[1] + (end[1] - start[1]) * t),
  Math.round(start[2] + (end[2] - start[2]) * t),
]
function inFinder(x: number, y: number, size: number): boolean {
  return finders(size).some(([left, top]) => x >= left && x < left + 7 && y >= top && y < top + 7)
}
function plan(qr: QryptResult, options: StyledOptions | undefined, format: 'SVG' | 'Pixels'): StylePlan {
  if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null))) {
    throw new TypeError('Styled options must be a plain object.')
  }
  for (const key of Object.keys(options ?? {})) {
    if (!['scale', 'margin', 'darkColor', 'lightColor', 'moduleShape', 'finderStyle', 'gradient'].includes(key)) {
      throw new TypeError(`Unknown styled option: ${key}.`)
    }
  }
  const opt = options ?? {}
  const { scale, margin, darkColor, lightColor } = normalizeRenderOptions(Object.fromEntries(
    Object.entries({ scale: opt.scale, margin: opt.margin, darkColor: opt.darkColor, lightColor: opt.lightColor })
      .filter(([, value]) => value !== undefined),
  ), format)
  if (opt.moduleShape !== undefined && !['square', 'rounded', 'dot'].includes(opt.moduleShape)) {
    throw new RangeError('moduleShape must be square, rounded, or dot.')
  }
  if (opt.finderStyle !== undefined && !['square', 'rounded'].includes(opt.finderStyle)) {
    throw new RangeError('finderStyle must be square or rounded.')
  }
  if (opt.gradient !== undefined && opt.darkColor !== undefined) {
    throw new TypeError('Choose gradient or darkColor, not both.')
  }
  let gradient: StylePlan['gradient']
  if (opt.gradient !== undefined) {
    const value = opt.gradient
    if (typeof value !== 'object' || value === null || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new TypeError('gradient must be a plain object.')
    }
    if (Object.keys(value).some(key => !['from', 'to', 'direction'].includes(key)) ||
        typeof value.from !== 'string' || !HEX.test(value.from) ||
        typeof value.to !== 'string' || !HEX.test(value.to) ||
        (value.direction !== undefined && value.direction !== 'horizontal' && value.direction !== 'vertical')) {
      throw new TypeError('gradient requires #RRGGBB from/to and optional horizontal/vertical direction.')
    }
    gradient = { from: rgb(value.from), to: rgb(value.to), direction: value.direction ?? 'vertical' }
  }
  const matrix = validateQRMatrix(qr)
  const width = (qr.size + 2 * margin) * scale
  const maximum = format === 'SVG' ? MAX_SVG_DIMENSION : MAX_RGBA_DIMENSION
  if (!Number.isSafeInteger(width) || width > maximum ||
      (format === 'Pixels' && width * width > MAX_RGBA_PIXELS)) {
    throw new RangeError(`Styled ${format} exceeds its dimension or pixel budget.`)
  }
  const background = rgb(lightColor)
  for (const foreground of gradient ? [gradient.from, gradient.to] : [rgb(darkColor)]) {
    requireContrast(foreground, background)
  }
  const reserved = createFunctionPatterns(qr.version, qr.errorCorrectionLevel).reserved
  return {
    qr, matrix, reserved, scale, margin, width,
    moduleShape: opt.moduleShape ?? 'square', finderStyle: opt.finderStyle ?? 'square',
    background, foreground: rgb(darkColor), gradient,
  }
}
function foregroundColor(p: StylePlan, x: number, y: number): Rgb {
  if (!p.gradient) return p.foreground
  const t = p.gradient.direction === 'horizontal' ? x / Math.max(1, p.qr.size) : y / Math.max(1, p.qr.size)
  return lerp(p.gradient.from, p.gradient.to, Math.min(1, Math.max(0, t)))
}
/** Square, subtly rounded, or circular data modules. Reserved function modules remain square. */
function insideModule(localX: number, localY: number, shape: ModuleShape): boolean {
  if (shape === 'square') return true
  if (shape === 'dot') {
    const dx = localX - 0.5
    const dy = localY - 0.5
    return dx * dx + dy * dy <= 0.48 * 0.48
  }
  // Rounded rectangle with corner radius 0.22 modules (near-total ink coverage).
  const cx = Math.max(0.22, Math.min(0.78, localX))
  const cy = Math.max(0.22, Math.min(0.78, localY))
  return (localX - cx) ** 2 + (localY - cy) ** 2 <= 0.22 ** 2
}
function insideRoundedRect(x: number, y: number, left: number, top: number, extent: number, radius: number): boolean {
  if (x < left || x >= left + extent || y < top || y >= top + extent) return false
  const cx = Math.max(left + radius, Math.min(left + extent - radius, x))
  const cy = Math.max(top + radius, Math.min(top + extent - radius, y))
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius
}
function finderColor(p: StylePlan, x: number, y: number): boolean | undefined {
  if (p.finderStyle !== 'rounded') return undefined
  for (const [left, top] of finders(p.qr.size)) {
    if (x < left || x >= left + 7 || y < top || y >= top + 7) continue
    if (!insideRoundedRect(x, y, left, top, 7, 0.85)) return false
    if (!insideRoundedRect(x, y, left + 1, top + 1, 5, 0.65)) return true
    if (insideRoundedRect(x, y, left + 2, top + 2, 3, 0.65)) return true
    return false
  }
  return undefined
}

/** Portable straight-alpha RGBA output. Reserved matrix patterns are not decoratively eroded. */
export function toStyledPixels(qr: QryptResult, options?: StyledOptions): PixelBuffer {
  const p = plan(qr, options, 'Pixels')
  const { width, scale, margin } = p
  const data = new Uint8ClampedArray(width * width * 4)
  for (let py = 0; py < width; py++) {
    const my = Math.floor(py / scale) - margin
    const fy = (py + 0.5) / scale - margin
    for (let px = 0; px < width; px++) {
      const mx = Math.floor(px / scale) - margin
      const fx = (px + 0.5) / scale - margin
      let dark = false
      if (mx >= 0 && my >= 0 && mx < qr.size && my < qr.size) {
        const styledFinder = finderColor(p, fx, fy)
        if (styledFinder !== undefined) dark = styledFinder
        else if (p.matrix[my]![mx]) {
          const reserved = p.reserved[my * qr.size + mx] === 1
          dark = insideModule(fx - mx, fy - my, reserved ? 'square' : p.moduleShape)
        }
      }
      const color = dark ? foregroundColor(p, fx, fy) : p.background
      const offset = (py * width + px) * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = 255
    }
  }
  return { width, height: width, data }
}

/** Self-contained SVG; no payload text, foreignObject, external URLs, or event handlers. */
export function toStyledSVG(qr: QryptResult, options?: StyledOptions): string {
  const p = plan(qr, options, 'SVG')
  const { margin, width } = p
  const extent = qr.size + 2 * margin
  const foreground = hex(p.foreground)
  // The gradient is scoped to the standalone graphic. Two different graphics can be
  // embedded as separate <img> or SVG documents without ID collisions.
  const id = gradientIdentifier(`${hex(p.gradient?.from ?? p.foreground)}:${hex(p.gradient?.to ?? p.foreground)}:${p.gradient?.direction}:${qr.size}:${margin}`)
  const fill = p.gradient ? `url(#${id})` : foreground
  const gradient = p.gradient
    ? `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${margin}" y1="${margin}" x2="${margin + (p.gradient.direction === 'horizontal' ? qr.size : 0)}" y2="${margin + (p.gradient.direction === 'vertical' ? qr.size : 0)}"><stop offset="0%" stop-color="${hex(p.gradient.from)}"/><stop offset="100%" stop-color="${hex(p.gradient.to)}"/></linearGradient></defs>`
    : ''
  const elements: string[] = []
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!p.matrix[y]![x]) continue
      if (p.finderStyle === 'rounded' && inFinder(x, y, qr.size)) continue
      const reserved = p.reserved[y * qr.size + x] === 1
      const shape = reserved ? 'square' : p.moduleShape
      const left = x + margin
      const top = y + margin
      if (shape === 'dot') elements.push(`<circle cx="${left + 0.5}" cy="${top + 0.5}" r="0.48"/>`)
      else elements.push(`<rect x="${left}" y="${top}" width="1" height="1"${shape === 'rounded' ? ' rx="0.22" ry="0.22"' : ''}/>`)
    }
  }
  if (p.finderStyle === 'rounded') {
    for (const [fx, fy] of finders(qr.size)) {
      const x = fx + margin
      const y = fy + margin
      elements.push(`<rect x="${x}" y="${y}" width="7" height="7" rx="0.85"/>`)
      // Draw the interior light ring before the pupil, using the configured background.
      elements.push(`</g><rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="0.65" fill="${hex(p.background)}"/><g fill="${fill}">`)
      elements.push(`<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.65"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${extent} ${extent}" shape-rendering="geometricPrecision"><rect width="${extent}" height="${extent}" fill="${hex(p.background)}"/>${gradient}<g fill="${fill}">${elements.join('')}</g></svg>`
}

/** Styled PNG always uses the optional full-color, dependency-free PNG path. */
export function toStyledPNG(qr: QryptResult, options?: StyledOptions): Uint8Array {
  return encodeRGBAPNG(toStyledPixels(qr, options))
}
