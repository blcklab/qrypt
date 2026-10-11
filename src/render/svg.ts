import type { QryptResult, SVGOptions } from '../types.js'

/** Render a completed Qrypt symbol as a standalone SVG string. */
export function toSVG(_qr: QryptResult, _options?: SVGOptions): string {
  // Deliberately unavailable until Milestone 5. Do not emit fake QR patterns.
  throw new Error('Qrypt SVG rendering is not implemented (milestone 5).')
}
