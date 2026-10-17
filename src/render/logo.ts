import type { PixelBuffer, QryptResult } from '../types.js'
import { createFunctionPatterns } from '../matrix/patterns.js'
import { toStyledSVG, toStyledPixels, type StyledOptions } from './styled.js'
import { encodeRGBAPNG } from './png.js'

/** Caller-provided decoded image pixels. No DOM image objects, URLs or remote fetching. */
export interface LogoImage {
  readonly width: number
  readonly height: number
  /** Straight-alpha, row-major RGBA bytes. */
  readonly data: Uint8Array | Uint8ClampedArray
}

/** Branding options. The default uses a compact, data-only region near the center. */
export interface LogoOptions extends StyledOptions {
  /** Side length of the cleared logo backing in whole modules. Defaults to a conservative fraction. */
  logoSize?: number
  /** Clear space around the image, in whole modules. Default: 1. */
  logoPadding?: number
}

interface Placement {
  left: number
  top: number
  side: number
  padding: number
  margin: number
  scale: number
  background: readonly [number, number, number]
  image: LogoImage
  /** Aspect-ratio preserving image bounds in full QR output pixels. */
  bounds: { x: number; y: number; width: number; height: number }
}
const MAX_INPUT_PIXELS = 1_048_576
const MAX_LOGO_SIZE = 1024
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const supportedKeys = new Set(['scale', 'margin', 'darkColor', 'lightColor', 'moduleShape', 'finderStyle', 'gradient', 'logoSize', 'logoPadding'])

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  let part = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0
    part += BASE64[a >>> 2]! + BASE64[((a & 3) << 4) | (b >>> 4)]! +
      (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >>> 6)]! : '=') +
      (i + 2 < bytes.length ? BASE64[c & 63]! : '=')
    if (part.length >= 16_384) { parts.push(part); part = '' }
  }
  parts.push(part)
  return parts.join('')
}

function validateImage(image: LogoImage): void {
  if (!image || typeof image !== 'object' || Array.isArray(image) ||
      !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      image.width < 1 || image.height < 1 || image.width > MAX_LOGO_SIZE ||
      image.height > MAX_LOGO_SIZE || image.width * image.height > MAX_INPUT_PIXELS ||
      !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) ||
      image.data.byteLength !== image.width * image.height * 4) {
    throw new TypeError('Logo must contain a bounded width, height, and exactly width × height × 4 RGBA bytes.')
  }
}

function integer(value: unknown, name: string, min: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min) {
    throw new RangeError(`${name} must be a safe integer >= ${min}.`)
  }
}

function placement(qr: QryptResult, image: LogoImage, options: LogoOptions | undefined): Placement {
  validateImage(image)
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null))) {
    throw new TypeError('Logo options must be a plain object.')
  }
  const opt = options ?? {}
  for (const key of Object.keys(opt)) {
    if (!supportedKeys.has(key)) throw new TypeError(`Unknown logo option: ${key}.`)
  }
  // Require stronger ECC because clearing QR data modules is destructive.
  if (qr.errorCorrectionLevel !== 'Q' && qr.errorCorrectionLevel !== 'H') {
    throw new RangeError('Embedded logos require Q or H error correction. Re-encode using Q or H.')
  }
  const scale = opt.scale ?? 8
  const margin = opt.margin ?? 4
  integer(scale, 'scale', 1)
  integer(margin, 'margin', 0)
  // Hard cap the cleared square; this is a conservative visual limit, not an ECC guarantee.
  const limit = Math.max(3, Math.floor(qr.size * (qr.errorCorrectionLevel === 'H' ? 0.17 : 0.14)))
  const padding = opt.logoPadding ?? 1
  integer(padding, 'logoPadding', 0)
  if (opt.logoSize !== undefined) {
    integer(opt.logoSize, 'logoSize', 3)
    if (opt.logoSize > limit) throw new RangeError(`logoSize exceeds the ${limit}-module limit for this QR version and ECC level.`)
    if (padding * 2 >= opt.logoSize) throw new RangeError('logoPadding leaves no space for the image.')
  }

  // Integral image of reserved function modules. Any candidate's surrounding
  // one-module safety border is checked in constant time, including version 40.
  const { reserved } = createFunctionPatterns(qr.version, qr.errorCorrectionLevel)
  const n = qr.size
  const stride = n + 1
  const sums = new Int32Array(stride * stride)
  for (let y = 1; y <= n; y++) {
    let row = 0
    for (let x = 1; x <= n; x++) {
      row += reserved[(y-1)*n+x-1] ? 1 : 0
      sums[y*stride+x] = sums[(y-1)*stride+x]!+row
    }
  }
  const countReserved = (x0: number,y0: number,x1: number,y1: number): number =>
    sums[y1*stride+x1]! - sums[y0*stride+x1]! - sums[y1*stride+x0]! + sums[y0*stride+x0]!
  const maxDisplacement = Math.floor(n * 0.25)
  let best: { left: number; top: number; distance: number } | undefined
  let side = opt.logoSize ?? limit
  // Automatic size may shrink to avoid alignment patterns on dense QR versions;
  // an explicitly requested size is never silently changed.
  for (; side >= Math.max(3, 2*padding+1); side--) {
    const center = (n - side) / 2
    for (let top = 0; top <= n - side; top++) {
      if (Math.abs(top - center) > maxDisplacement) continue
      for (let left = 0; left <= n - side; left++) {
        if (Math.abs(left - center) > maxDisplacement) continue
        if (countReserved(Math.max(0,left-1),Math.max(0,top-1),
            Math.min(n,left+side+1),Math.min(n,top+side+1)) !== 0) continue
        const distance = (left-center)**2+(top-center)**2
        if (!best || distance < best.distance) best = {left,top,distance}
      }
    }
    if (best || opt.logoSize !== undefined) break
  }
  if (!best) throw new RangeError('No safe near-center logo placement avoids protected QR patterns. Reduce logoSize or use a different version.')
  const inner = (side - padding * 2) * scale
  const ratio = Math.min(inner / image.width, inner / image.height)
  const width = Math.max(1, Math.floor(image.width * ratio))
  const height = Math.max(1, Math.floor(image.height * ratio))
  const originX = (best.left + margin) * scale
  const originY = (best.top + margin) * scale
  const color = opt.lightColor ?? '#FFFFFF'
  // The shared styled renderer will validate all other color and gradient options.
  if (typeof color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(color)) {
    throw new TypeError('lightColor must be a six-digit #RRGGBB color.')
  }
  return {
    left: best.left, top: best.top, side, padding, margin, scale, image,
    background: [parseInt(color.slice(1,3),16), parseInt(color.slice(3,5),16), parseInt(color.slice(5,7),16)],
    bounds: {
      x: originX + Math.floor((side * scale - width) / 2),
      y: originY + Math.floor((side * scale - height) / 2),
      width, height,
    },
  }
}
function styledOptions(options: LogoOptions | undefined): StyledOptions {
  const { logoSize: _size, logoPadding: _padding, ...rest } = options ?? {}
  return rest
}
/** Nearest-neighbor resize to explicit RGBA data; deterministic across runtimes. */
function resizedLogo(p: Placement): PixelBuffer {
  const { width, height } = p.bounds
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(p.image.height - 1, Math.floor((y + 0.5) * p.image.height / height))
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(p.image.width - 1, Math.floor((x + 0.5) * p.image.width / width))
      const source = (srcY * p.image.width + srcX) * 4
      const target = (y * width + x) * 4
      data[target] = p.image.data[source]!
      data[target + 1] = p.image.data[source + 1]!
      data[target + 2] = p.image.data[source + 2]!
      data[target + 3] = p.image.data[source + 3]!
    }
  }
  return { width, height, data }
}
/** Compose on a solid backing in-place; guarantee opaque RGB output. */
function composite(image: PixelBuffer, p: Placement): void {
  const { width: outputWidth, data } = image
  const left = (p.left + p.margin) * p.scale
  const top = (p.top + p.margin) * p.scale
  const side = p.side * p.scale
  for (let y = top; y < top + side; y++) {
    for (let x = left; x < left + side; x++) {
      const o = (y * outputWidth + x) * 4
      data[o] = p.background[0]
      data[o + 1] = p.background[1]
      data[o + 2] = p.background[2]
      data[o + 3] = 255
    }
  }
  const logo = resizedLogo(p)
  for (let y = 0; y < logo.height; y++) {
    for (let x = 0; x < logo.width; x++) {
      const src = (y * logo.width + x) * 4
      const dst = ((y + p.bounds.y) * outputWidth + x + p.bounds.x) * 4
      const a = logo.data[src + 3]! / 255
      for (let c = 0; c < 3; c++) {
        data[dst + c] = Math.round(logo.data[src + c]! * a + p.background[c]! * (1 - a))
      }
      data[dst + 3] = 255
    }
  }
}

/** Raster logo composition; never changes the encoded QR matrix. */
export function toLogoPixels(qr: QryptResult, image: LogoImage, options?: LogoOptions): PixelBuffer {
  // Validate style and output budget before any large logo allocation.
  const pixels = toStyledPixels(qr, styledOptions(options))
  const p = placement(qr, image, options)
  composite(pixels, p)
  return pixels
}
/** Portable PNG with local, bounded RGBA logo input. */
export function toLogoPNG(qr: QryptResult, image: LogoImage, options?: LogoOptions): Uint8Array {
  return encodeRGBAPNG(toLogoPixels(qr, image, options))
}
/** Self-contained SVG with a generated PNG data URI; never interprets logo markup. */
export function toLogoSVG(qr: QryptResult, image: LogoImage, options?: LogoOptions): string {
  const svg = toStyledSVG(qr, styledOptions(options))
  const p = placement(qr, image, options)
  const backing = `#${p.background.map(v => v.toString(16).padStart(2, '0')).join('')}`
  const x = p.left + p.margin, y = p.top + p.margin
  const logo = resizedLogo(p)
  const data = bytesToBase64(encodeRGBAPNG(logo))
  const imageTag = `<rect x="${x}" y="${y}" width="${p.side}" height="${p.side}" fill="${backing}"/><image x="${p.bounds.x / p.scale}" y="${p.bounds.y / p.scale}" width="${logo.width / p.scale}" height="${logo.height / p.scale}" preserveAspectRatio="none" href="data:image/png;base64,${data}"/>`
  return svg.replace('</svg>', `${imageTag}</svg>`)
}
