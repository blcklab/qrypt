# Milestone 6 — Portable PNG renderer

## Design decision

**Baseline:** Milestone 5 working QR matrix and SVG renderer.

An optional `@blcklab/qrypt/png` entry point exposes `toPNG(qr, options?) : Uint8Array`. It produces an opaque 1-bit **indexed-color PNG**. `PLTE` has two RGB colors, light at palette index 0 and dark at index 1. Pixel samples use most-significant-bit-first packing; every scanline begins with PNG filter byte 0. No alpha channel, DOM, Canvas, Blob, Node.js APIs, or third-party dependency is used by the PNG module.

The IDAT chunk is a zlib stream (RFC 1950) containing stored DEFLATE blocks (RFC 1951), each at most 65,535 bytes, ending with an Adler-32 checksum. PNG chunks use CRC-32 checksums. All calculations are implemented with portable TypeScript and typed arrays. Binary data is synchronous and deterministic.

**Trade-off:** Uncompressed DEFLATE is extremely simple and guarantees cross-environment output, but the file is larger than PNGs produced by LZ77/Huffman compression. 1-bit packed indexed color limits this overhead without pulling a compressor into the package. Future compression optimizations should be measured before adding complexity.

## API

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

const bytes: Uint8Array = toPNG(qrypt('https://example.com'), {
  scale: 8,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
})
```

PNG shares the SVG scale/margin and six-digit RGB-color options. Default scale 8, four-module quiet zone, black on white. Output is bounded to 8,192 pixels on each side and 16,777,216 total pixels. This is an intentional memory bound for the packed scanline allocation. `toPNG` is not a core entry export and does not provide a data URL; consumer applications can use `Blob`/object URLs in browsers or write bytes to disk in Node.

## Implementation

- `src/render/png.ts`: PNG packing and checksums.
- `src/png.ts`: optional subpath exports (`toPNG`, `PNGOptions`).
- `src/render/options.ts`: shared renderer options validation; SVG reuses it without public API changes.
- `tsdown.config.ts` and `package.json`: second ESM/CJS/d.ts build entry and export map.
- `test/png.node.test.mjs`: runtime structure/CRC/zlib/bit-exact pixel/limits/regression tests.
- `test/png.test.ts`: Vitest source contract smoke tests.
- `scripts/verify-png-render.py`: Pillow + OpenCV independent PNG decoding and QR scanning.
- `scripts/verify-package.mjs`: future ESM/CJS build validation includes subpath and exclusion from core.

## Verification

Run:

```bash
npm run typecheck
npm run verify:png
npm run verify:png-decode # optional: requires Pillow, OpenCV and NumPy
npm run verify:svg
npm run verify:matrix
npm run verify:encoding
npm run verify:ecc
npm run verify:foundation
```

The Node runtime tests verify the PNG signature, chunk sizes and CRC, IHDR / PLTE fields, real zlib decompression, DEFLATE block boundaries, palette colors, entire pixel matrices across versions 1, 7, 22, 40 at L/M/Q/H, default/custom quiet zones, determinism, invalid options, and malformed matrices. The Python scan checks raw PNG bytes with a different decoder and rechecks the resulting pixels against the underlying QR matrix before scanning the QR payload.

Record actual command results in the delivery message; do not consider production bundling, Vitest, package consumer tests or release proven until those commands have been executed successfully.

## Pending release gates

`tsdown`, `vitest`, an npm lockfile, built ESM/CJS consumption, TypeScript declaration checking, and distributable tarball inspection still require a development environment with installable build dependencies. Package remains `private: true`, unpublished.
