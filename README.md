# Qrypt

A lightweight, framework-agnostic TypeScript QR Code Model 2 generator.

> **Development status: Milestone 4 — QR matrix implemented, rendering pending.** `qrypt()` now produces verified QR symbol module matrices for versions 1–40 with L/M/Q/H error correction. **SVG and PNG exports are not yet implemented.** The package remains `private: true` and must not be published until the release gates pass.

## Matrix API (working from source)

```ts
import { qrypt } from '@blcklab/qrypt'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'M' })
console.log(qr.version, qr.size, qr.mask, qr.errorCorrectionLevel)
const modules = qr.matrix() // modules[y][x] is true for a dark module
```

The matrix contains only the QR symbol, **without quiet zone**. Renderers must supply an appropriate white border (normally four modules) to make the symbol reliably scannable. `qr.matrix()` returns a fresh copy, so callers cannot mutate the encoded symbol.

Options:

- `errorCorrectionLevel`: `'L' | 'M' | 'Q' | 'H'`, default `'M'`.
- `version`: `1`–`40` or `'auto'` (default). Explicit versions are never silently changed.

UTF-8 text is encoded with ECI assignment 26 for non-ASCII data. Some readers have incomplete ECI support; validate interoperability with your target scanners. Malformed JavaScript UTF-16 surrogate pairs and unsupported input/options are rejected. Oversized payloads throw rather than silently truncate.

## Rendering API (planned; **not yet usable**)

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com')
const svg = toSVG(qr, { scale: 8, margin: 4 }) // throws until Milestone 5
```

The proposed SVG renderer will support integer `scale`, nonnegative `margin`, and `#RRGGBB` `darkColor` / `lightColor`. PNG generation is deferred pending a separate architecture and correctness review.

## Development

Node.js 22.12+ is declared as the **development tooling** minimum; portable encoding code itself uses no Node- or DOM-specific APIs.

```bash
npm install
npm run typecheck
npm run verify:foundation
npm run verify:encoding
npm run verify:ecc
npm run verify:matrix
npm run test
npm run build
npm run verify:package
npm pack --dry-run
```

The four `verify:*` commands use the globally available TypeScript compiler and Node's built-in test runner, so their tests can run in this workspace without a registry install. The optional `python scripts/verify-independent-decode.py` uses development-only OpenCV and NumPy.

**Outstanding packaging limitations:** The lockfile has not yet been generated. `vitest` and `tsdown` are not installed in this offline environment, so production bundling, consumer imports, `npm test`, and `npm pack` after bundling are still unverified. Do not claim a reproducible production package until those checks pass.

Read the implementation and actual verification records in `docs/MILESTONE-01.md` through `docs/MILESTONE-04.md`.

## License

MIT.
