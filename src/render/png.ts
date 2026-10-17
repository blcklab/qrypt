import type { PNGOptions, PixelBuffer, QryptResult } from '../types.js'
import { normalizeRenderOptions } from './options.js'
import { toPixels } from './pixels.js'

// PNG Specification (Third Edition): indexed-color (type 3), one bit per
// pixel, PLTE palette, filter 0 and a zlib-wrapped DEFLATE stored stream.
// No Canvas, DOM, Node.js zlib, or third-party runtime dependency is used.
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
const IHDR = Uint8Array.of(73, 72, 68, 82)
const PLTE = Uint8Array.of(80, 76, 84, 69)
const IDAT = Uint8Array.of(73, 68, 65, 84)
const IEND = Uint8Array.of(73, 69, 78, 68)
const MAX_PNG_DIMENSION = 8192
const MAX_PNG_PIXELS = 16_777_216
const STORED_BLOCK_LIMIT = 65535

function writeU32(destination: Uint8Array, offset: number, value: number): void {
  destination[offset] = (value >>> 24) & 255
  destination[offset + 1] = (value >>> 16) & 255
  destination[offset + 2] = (value >>> 8) & 255
  destination[offset + 3] = value & 255
}

function crc32(first: Uint8Array, second: Uint8Array): number {
  let crc = 0xffffffff
  for (const bytes of [first, second]) {
    for (const value of bytes) {
      crc ^= value
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: Uint8Array, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12)
  writeU32(chunk, 0, data.length)
  chunk.set(type, 4)
  chunk.set(data, 8)
  writeU32(chunk, data.length + 8, crc32(type, data))
  return chunk
}

/** RFC 1950 zlib + RFC 1951 uncompressed DEFLATE blocks.
 * Indexed one-bit pixels keep the raw stream reasonably small even without
 * LZ77 compression. Every block ends on a byte boundary.
 */
function deflateStored(input: Uint8Array): Uint8Array {
  const blocks = Math.ceil(input.length / STORED_BLOCK_LIMIT)
  const output = new Uint8Array(2 + input.length + blocks * 5 + 4)
  output[0] = 0x78 // Deflate / 32 KiB window
  output[1] = 0x01 // no preset dictionary; header divisible by 31

  let source = 0
  let offset = 2
  let a = 1
  let b = 0
  while (source < input.length) {
    const length = Math.min(STORED_BLOCK_LIMIT, input.length - source)
    output[offset++] = source + length === input.length ? 1 : 0 // BFINAL + BTYPE=00
    output[offset++] = length & 255
    output[offset++] = length >>> 8
    output[offset++] = (~length) & 255
    output[offset++] = (~length >>> 8) & 255

    output.set(input.subarray(source, source + length), offset)
    offset += length
    // Reduce periodically to keep arithmetic exact even for max-size PNGs.
    for (let i = source; i < source + length; i++) {
      a += input[i]!
      b += a
      if ((i - source) % 5552 === 5551) {
        a %= 65521
        b %= 65521
      }
    }
    a %= 65521
    b %= 65521
    source += length
  }
  writeU32(output, offset, (b << 16) | a)
  return output
}

function rgb(color: string): Uint8Array {
  return Uint8Array.of(
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  )
}

/** Encode a QR symbol into portable PNG bytes. Opaque inputs retain the
 * original compact two-color indexed representation, unchanged.
 * Supplying non-opaque alpha selects the optional truecolor RGBA route.
 */
export function toPNG(qr: QryptResult, options?: PNGOptions): Uint8Array {
  const { scale, margin, darkColor, lightColor, darkAlpha, lightAlpha } = normalizeRenderOptions(options, 'PNG')
  if (darkAlpha !== 255 || lightAlpha !== 255) {
    return toRGBAPNG(qr, options)
  }
  if (typeof qr !== 'object' || qr === null ||
      !Number.isInteger(qr.version) || qr.version < 1 || qr.version > 40 ||
      qr.size !== qr.version * 4 + 17 || typeof qr.matrix !== 'function') {
    throw new TypeError('toPNG requires a valid Qrypt QR result.')
  }

  const modules = qr.size + 2 * margin
  const pixels = modules * scale
  if (!Number.isSafeInteger(modules) || !Number.isSafeInteger(pixels) ||
      pixels > MAX_PNG_DIMENSION || pixels * pixels > MAX_PNG_PIXELS) {
    throw new RangeError(`PNG output may not exceed ${MAX_PNG_DIMENSION} pixels per side or ${MAX_PNG_PIXELS} total pixels.`)
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
      if (typeof dark !== 'boolean') {
        throw new TypeError('Qrypt matrix modules must be booleans.')
      }
    }
  }

  const scanlineLength = 1 + Math.ceil(pixels / 8)
  const scanlines = new Uint8Array(scanlineLength * pixels)
  // A filter byte of 0 begins each PNG scanline (already zero-filled).
  // Light = palette index 0; dark = index 1. Indexed PNGs pack pixels MSB-first.
  for (let py = margin * scale; py < (margin + qr.size) * scale; py++) {
    const row = matrix[Math.floor(py / scale) - margin]!
    const rowStart = py * scanlineLength + 1
    for (let mx = 0; mx < qr.size; mx++) {
      if (!row[mx]) continue
      const xStart = (margin + mx) * scale
      for (let x = xStart; x < xStart + scale; x++) {
        scanlines[rowStart + (x >>> 3)]! |= 1 << (7 - (x & 7))
      }
    }
  }

  const header = new Uint8Array(13)
  writeU32(header, 0, pixels)
  writeU32(header, 4, pixels)
  header[8] = 1 // bit depth: exactly two RGB colors
  header[9] = 3 // indexed-color (palette)
  // Compression, filtering and interlace method are zero.

  const palette = new Uint8Array(6)
  palette.set(rgb(lightColor), 0)
  palette.set(rgb(darkColor), 3)

  const chunks = [
    PNG_SIGNATURE,
    pngChunk(IHDR, header),
    pngChunk(PLTE, palette),
    pngChunk(IDAT, deflateStored(scanlines)),
    pngChunk(IEND, new Uint8Array(0)),
  ]
  const result = new Uint8Array(chunks.reduce((sum, bytes) => sum + bytes.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** RGBA PNG: 8-bit truecolor + alpha, filter type 0, stored zlib stream.
 * An output cap limits peak allocations from pixels + scanlines + PNG bytes.
 */
function toRGBAPNG(qr: QryptResult, options?: PNGOptions): Uint8Array {
  return encodeRGBAPNG(toPixels(qr, options))
}

/** Portable RGBA PNG encoder reused by the optional styled renderer. */
export function encodeRGBAPNG({ width, height, data }: PixelBuffer): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION ||
      width * height > MAX_PNG_PIXELS || data.length !== width * height * 4) {
    throw new RangeError('Invalid RGBA pixel buffer dimensions.')
  }
  const stride = width * 4
  const scanlines = new Uint8Array((1 + stride) * height)
  for (let y = 0; y < height; y++) {
    scanlines.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const header = new Uint8Array(13)
  writeU32(header, 0, width)
  writeU32(header, 4, height)
  header[8] = 8 // 8 bits per channel
  header[9] = 6 // truecolor RGBA
  const chunks = [
    PNG_SIGNATURE,
    pngChunk(IHDR, header),
    pngChunk(IDAT, deflateStored(scanlines)),
    pngChunk(IEND, new Uint8Array(0)),
  ]
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Platform-neutral base64: does not use Node Buffer, DOM, or btoa. */
function base64Encode(bytes: Uint8Array): string {
  const pieces: string[] = []
  let current = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    current += BASE64[a >>> 2]! + BASE64[((a & 3) << 4) | (b >>> 4)]! +
      (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >>> 6)]! : '=') +
      (i + 2 < bytes.length ? BASE64[c & 63]! : '=')
    if (current.length >= 16_384) {
      pieces.push(current)
      current = ''
    }
  }
  pieces.push(current)
  return pieces.join('')
}

/** Portable PNG data URL. For large images, prefer raw toPNG() bytes instead. */
export function toPNGDataURL(qr: QryptResult, options?: PNGOptions): string {
  return `data:image/png;base64,${base64Encode(toPNG(qr, options))}`
}
