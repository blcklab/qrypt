/** QR Code Model 2 error-correction strength. Defaults to M. */
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/** Core encoding settings. Rendering settings are deliberately separate. */
export interface QryptOptions {
  /** Defaults to M; Qrypt will not silently change this level. */
  errorCorrectionLevel?: ErrorCorrectionLevel
  /** 1–40 or auto (default). Explicit versions are never changed. */
  version?: number | 'auto'
}

/** A completed QR symbol (not including its rendering quiet zone). */
export interface QryptResult {
  readonly version: number
  /** Module count per side, equal to 4 * version + 17. */
  readonly size: number
  readonly errorCorrectionLevel: ErrorCorrectionLevel
  /** The automatically chosen QR mask, between 0 and 7. */
  readonly mask: number
  /** Row-major boolean matrix; matrix[y][x] indicates a dark module. Returns a fresh copy. */
  matrix(): boolean[][]
}

/** SVG appearance only; values do not affect the encoded QR modules. */
export interface SVGOptions {
  /** Positive integer pixels per module. Default: 8. */
  scale?: number
  /** Nonnegative integer quiet-zone width in modules. Default: 4. */
  margin?: number
  /** #RRGGBB only. Default: #000000. */
  darkColor?: string
  /** #RRGGBB only. Default: #FFFFFF. */
  lightColor?: string
}

/** Portable raw pixel rendering; alpha channels are byte values (0–255). */
export interface PixelOptions extends SVGOptions {
  /** Dark-module opacity: 0 transparent, 255 opaque (default). */
  darkAlpha?: number
  /** Light-module/quiet-zone opacity: 0 transparent, 255 opaque (default). */
  lightAlpha?: number
}

/** An uncompressed row-major RGBA image; data contains width × height × 4 bytes. */
export interface PixelBuffer {
  readonly width: number
  readonly height: number
  /** Four channels per pixel (R, G, B, A), row-major. May be modified by the caller. */
  readonly data: Uint8ClampedArray
}

/** PNG options. Opaque output retains the existing compact 1-bit PNG representation. */
export interface PNGOptions extends PixelOptions {}

