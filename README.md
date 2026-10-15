# Qrypt

A lightweight, framework-agnostic TypeScript QR Code Model 2 generator with zero runtime dependencies.

> **Development status: Milestone 8 — distribution verification gates added; release blocked pending an online production build.** Generates QR versions 1–40 with error correction L/M/Q/H and renders standalone SVGs. The package remains `private: true` until production bundling, consumer installation, and npm publication checks are completed. PNG output is available through an isolated subpath.

## Quick start (source API)

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'H' })
const svg = toSVG(qr, {
  scale: 8,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
})

console.log(qr.version, qr.size, qr.mask)
// svg is a standalone SVG XML string. Save it as a .svg file or display it.
```

**Installation:** This package is not yet published. The examples describe the intended import path for a future npm release; while developing, import from source or use the built distribution after a verified local build.

### Matrix API

```ts
import { qrypt } from '@blcklab/qrypt'

const qr = qrypt('Hello 🌐 世界', {
  errorCorrectionLevel: 'Q',
  version: 'auto',
})

const modules: boolean[][] = qr.matrix()
const dark = modules[0]?.[0]
```

`qrypt(input, options?)` accepts a JavaScript string. The returned result exposes `version`, `size` (modules per side), `mask`, `errorCorrectionLevel`, and `matrix()`. Matrix coordinates are `[y][x]`, where `true` is a dark module. `matrix()` returns a fresh copy each time, without the rendering quiet zone. The result object is frozen at runtime to protect its readonly metadata against accidental mutation.

**Encoding options:**

| Setting | Type | Default | Behavior |
| --- | --- | --- | --- |
| `errorCorrectionLevel` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | Never silently downgraded. |
| `version` | `1..40 \| 'auto'` | `'auto'` | Auto picks the smallest version that fits; explicit versions are preserved. |

Qrypt automatically selects numeric, alphanumeric, and UTF-8 byte segments. Non-ASCII text is represented with UTF-8 ECI assignment 26. Some readers have incomplete ECI support, so test Unicode with your target scanning software.

### SVG API

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('HELLO WORLD')
const svg = toSVG(qr, { scale: 12, margin: 4 })
```

`toSVG(qr, options?)` is a pure function that returns a valid standalone SVG string using a light background `<rect>` and compact dark-module `<path>`. It does **not** access the DOM or Node.js APIs, and it does not interpolate the payload into SVG markup.

| Setting | Type | Default | Behavior |
| --- | --- | --- | --- |
| `scale` | positive safe integer | `8` | Output pixels per QR module. |
| `margin` | nonnegative safe integer | `4` | Quiet zone, in modules. |
| `darkColor` | `#RRGGBB` | `#000000` | Dark module color. |
| `lightColor` | `#RRGGBB` | `#FFFFFF` | Background/quiet-zone color. |

The resulting square SVG has width and height `(qr.size + 2 × margin) × scale` pixels, with a matching module-coordinate `viewBox`. Rendering is limited to **65,535 pixels per side** to prevent invalid or unreasonable dimensions. SVG stays vector-based regardless of its declared pixel size.

A four-module quiet zone with high-contrast colors is recommended for reliable scanning. You can set `margin: 0`, but the resulting symbol may not scan correctly.

### PNG API (optional subpath)

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

const qr = qrypt('https://example.com')
const bytes: Uint8Array = toPNG(qr, {
  scale: 8,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
})
```

The PNG renderer is **not imported by the core entry point**. It is synchronous, framework-agnostic, dependency-free, and uses no DOM, Canvas, Buffer, or Node zlib API. `toPNG` returns real PNG bytes as `Uint8Array`. Its options have the same meanings and defaults as `toSVG`, including a four-module quiet zone.

PNG output uses an opaque, one-bit indexed RGB palette (exactly two configured colors), not RGBA. There is no built-in data URL helper. A browser can create an object URL from the resulting bytes; a Node.js program can write the bytes directly.

A single PNG is limited to **8,192 pixels on either side** and **16,777,216 total pixels**. The PNG's stored DEFLATE stream is standards-compliant but not LZ77-compressed; files may be larger than those produced by an optimized PNG compressor. The byte-level palette representation keeps typical QR PNG output reasonably small.

### Browser integration

The SVG string can be used as markup in a trusted application context, or converted into an object URL through browser APIs. PNG bytes can similarly be rendered with a `Blob`:

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

const png = toPNG(qrypt('Hello!'))
const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
// Assign URL to an <img> element, and revoke it after use.
```

This uses browser APIs in the *application*, not in Qrypt. Release object URLs when no longer needed.

### Node.js integration

```ts
import { writeFile } from 'node:fs/promises'
import { qrypt, toSVG } from '@blcklab/qrypt'

await writeFile('qrypt.svg', toSVG(qrypt('https://example.com')), 'utf8')
```

For PNG files:

```ts
import { writeFile } from 'node:fs/promises'
import { qrypt } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

await writeFile('qrypt.png', toPNG(qrypt('https://example.com')))
```

The `node:fs/promises` import is **consumer application code**, not part of Qrypt's core or renderers.

### Validation and errors

Non-string input, malformed UTF-16 surrogate sequences, invalid options, unsupported colors, malformed QR matrices, and out-of-range SVG dimensions throw `TypeError` or `RangeError`. Text is never trimmed or normalized automatically; payloads that exceed QR capacity fail rather than being truncated.

## Development

The build configuration targets ESM, CJS, and TypeScript declarations using `tsdown`. Node.js 22.12+ is required by the current development toolchain; the core encoder, SVG renderer, and optional PNG renderer avoid DOM and Node-only APIs.

```bash
npm install
npm run typecheck
npm run verify:foundation
npm run verify:encoding
npm run verify:ecc
npm run verify:matrix
npm run verify:svg
npm run verify:png
npm run verify:conformance         # exact capacity boundaries and independent mask-score oracle
npm run verify:distribution:static # export and package metadata assertions
npm run verify:conformance-reference # optional: Python qrcode 160 rotated-mode comparisons
npm run verify:conformance-reference:full # optional: Python qrcode 480 comparisons
npm run verify:png-decode   # optional: requires Pillow, OpenCV and NumPy
npm run verify:svg-decode   # optional: requires CairoSVG, OpenCV and NumPy
npm run test                # Vitest; requires installed development dependencies
npm run build               # tsdown; requires installed development dependencies
npm run verify:package   # packs + installs tarball, checks ESM/CJS & NodeNext declaration consumers
npm run verify:lockfile  # requires a committed package-lock.json
npm run check:release    # complete online release gate
npm pack --dry-run
```

The `verify:*` Node suites work with the globally installed TypeScript compiler and Node's test runner, without installing development packages. The optional reference comparison uses Python `qrcode`, and independent image scanning uses separate Python development-only tooling; none are npm runtime dependencies.

**Unverified release gates:** This offline workspace does not have the declared `vitest` and `tsdown` packages installed, and there is no lockfile. The new packed-package verifier is implemented but cannot pass until the real ESM/CJS/DTS artifacts have been built. Run `npm install`, commit `package-lock.json`, then run `npm ci` and `npm run check:release` on a machine with registry access. Do not publish based on source-only checks.

Implementation and verification records: `docs/MILESTONE-01.md` through `docs/MILESTONE-08.md`.

## Limitations

- QR Code Model 2 generation only; no scanner, decoder, logo overlay, gradients, or other barcode types.
- PNG is limited to two opaque RGB palette colors; no transparency, built-in data URL, or advanced compression.
- Unicode reader interoperability depends on ECI support. During exploratory testing, OpenCV decoded 7 of 8 additional UTF-8 examples; one valid-looking Version 2/M symbol with `π 3.14` was not decoded by OpenCV, while alternate versions decoded correctly. This does not establish whether the limitation is specific to OpenCV or that symbol; validate with target scanners before relying on complex ECI text.
- `toSVG` colors are restricted to six-digit hexadecimal RGB strings; transparency and CSS colors are not supported.
- Official QR standard certification has not been claimed.

## License

MIT. See [LICENSE](LICENSE).
