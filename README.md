# Qrypt

A lightweight, framework-agnostic TypeScript library for generating QR Code Model 2 symbols. Zero runtime dependencies; no network access or platform-specific APIs are required for encoding or rendering.

**Status:** `0.1.0` pre-release source. **Not published to npm.** Package publication is intentionally disabled (`private: true`) until the build, declaration, package-installation, and release checks succeed. Examples below show the intended package imports once published.

## Installation

After the first release:

```bash
npm install @blcklab/qrypt
```

For now, use the source ZIP or a locally verified package build. Do not interpret this command as confirmation that `0.1.0` is currently available on npm.

## Quick start

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'H' })
const svg = toSVG(qr, { scale: 8, margin: 4 })

console.log(qr.version, qr.size, qr.mask)
// svg is a self-contained SVG string.
```

Qrypt supports versions **1–40**, error correction **L/M/Q/H**, numeric/alphanumeric/UTF-8 byte segments, automatic mixed-mode selection, and Reed–Solomon error correction. SVG is included in the core entry; PNG is a separate, optional import.

## Generate a module matrix

```ts
import { qrypt, type QryptOptions } from '@blcklab/qrypt'

const options: QryptOptions = { errorCorrectionLevel: 'Q', version: 'auto' }
const qr = qrypt('Hello 🌐 世界', options)
const modules: boolean[][] = qr.matrix()

console.log(qr.version, qr.size, qr.mask, qr.errorCorrectionLevel)
console.log(modules[0]?.[0]) // true = dark module
```

`qrypt(input, options?)` accepts a JavaScript string (including the empty string). It does not normalize, trim, or modify the payload. Malformed UTF-16, invalid options, and oversized inputs are rejected. The result has readonly metadata and a `matrix()` method that returns a **fresh row-major** `boolean[][]` with coordinates `matrix[y][x]`. The quiet zone is deliberately **not** included in the matrix.

| Encoding option | Default | Valid values |
| --- | --- | --- |
| `errorCorrectionLevel` | `'M'` | `'L'`, `'M'`, `'Q'`, `'H'` |
| `version` | `'auto'` | `1` through `40`, or `'auto'` |

`'auto'` selects the smallest version fitting the input at the requested error-correction level. Explicit versions and correction levels are never silently changed.

## Render SVG

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const svg = toSVG(qrypt('HELLO WORLD'), {
  scale: 8,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
})
```

SVG output is standalone XML using sharp-edged module paths. No browser DOM is involved and input text is never inserted into the SVG. The output's width and height are `(qr.size + 2 × margin) × scale` pixels, with a maximum dimension of **65,535 pixels per side**.

## Render PNG (optional)

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

`toPNG` returns actual PNG bytes, not a data URL. The separate `@blcklab/qrypt/png` entry generates an opaque, 1-bit indexed PNG using two RGB palette colors and portable TypeScript code. It does **not** require Canvas, Node.js `Buffer` or `zlib`, or third-party runtime dependencies. PNG output is limited to **8,192 pixels per side** and **16,777,216 total pixels**; its DEFLATE stream is valid but uncompressed, so output may be larger than PNGs from optimized compressors.

Both `toSVG` and `toPNG` use the same options:

| Rendering option | Default | Valid values |
| --- | --- | --- |
| `scale` | `8` | Positive safe integer, in pixels per module |
| `margin` | `4` | Nonnegative safe integer, in modules |
| `darkColor` | `'#000000'` | Six-digit `#RRGGBB` |
| `lightColor` | `'#FFFFFF'` | Six-digit `#RRGGBB` |

For reliable scanning, retain the **four-module quiet zone** and use high-contrast colors. A `margin` of zero is allowed but may make the symbol unscannable.

## Browser usage

Create a local image URL from PNG bytes, then revoke it when no longer needed:

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

const bytes = toPNG(qrypt('Browser example'))
const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
// Use url as an <img> source in your application, then URL.revokeObjectURL(url).
```

The `Blob` and object-URL APIs above belong to the **consumer application**, not Qrypt's core or renderers. SVG may also be saved as a `.svg` file or displayed by your application's trusted rendering layer.

## Node.js usage

```ts
import { writeFile } from 'node:fs/promises'
import { qrypt, toSVG } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

const qr = qrypt('Node.js example')
await writeFile('qrypt.svg', toSVG(qr), 'utf8')
await writeFile('qrypt.png', toPNG(qr))
```

The Node.js filesystem import is only used by the application. The library itself does not import Node-specific modules. Current package metadata requires **Node.js 22.12+** for the supported Node distribution; supported modern browsers can use the platform-independent code. ESM, CommonJS, and declaration entrypoints have been configured but are **not yet validated against a real production build**.

## Errors and interoperability

Invalid input types, ill-formed surrogate pairs, unsupported color formats, and invalid option objects throw `TypeError`; invalid ranges, exceeded QR capacities, or oversized render requests throw `RangeError`. Input is never silently truncated or correction levels downgraded.

Non-ASCII byte text uses UTF-8 with **ECI assignment 26**. ECI support varies between scanners; one exploratory OpenCV Unicode case failed while other Unicode symbols decoded. This remains an interoperability limitation to test against your target readers, not proof of official ISO conformance.

Qrypt generates **QR Code Model 2** only. There is no scanner/decoder API, Micro QR, rMQR, logo overlay, gradients, camera integration, transparent PNG, or built-in data URL helper.

## Development and release checks

```bash
npm install                 # registry required; generates package-lock.json
npm ci                      # after committing the lockfile
npm run typecheck
npm run verify:docs
npm run verify:conformance
npm run verify:conformance-reference:full  # optional Python qrcode reference
npm run verify:svg-decode                # optional Python CairoSVG, OpenCV, NumPy
npm run verify:png-decode                # optional Python Pillow, OpenCV, NumPy
npm run test                # Vitest
npm run test:coverage
npm run build               # tsdown: ESM, CJS, declarations
npm run check:release       # lockfile, tests, build, tarball & consumer verification
```

`npm run check:release` must pass before any release approval. Production builds, real consumer imports, and lockfile reproducibility are **still unverified** in the offline development workspace; this repository is intentionally unpublished. See [Release checklist](docs/RELEASE-CHECKLIST.md), [Milestone 9](docs/MILESTONE-09.md), and [Changelog](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
