# Qrypt

A lightweight, framework-agnostic TypeScript QR Code Model 2 generator.

> **Development status: Milestone 2 encoding pipeline.** Data segmentation, capacity selection and data-codeword packing are implemented and tested internally. **Final QR symbols, SVG rendering and PNG output are not yet implemented.** The package is marked `private` intentionally and must not be published or used as a QR generator until the conformance milestones pass.

## Planned public API

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'M' })
const matrix = qr.matrix() // matrix[y][x]: dark module?
const svg = toSVG(qr, { scale: 8, margin: 4 })
```

The example documents the **target contract**, not working public functionality at Milestone 2.

## Proposed options

Encoding accepts `errorCorrectionLevel` (`L`, `M`, `Q`, `H`; default `M`) and `version` (`1`–`40` or `auto`; default `auto`). Rendering uses separate `scale` (default `8`), `margin` (default `4`), `darkColor` and `lightColor` options. Colors will be restricted to six-digit hex strings.

## Implemented through Milestone 2

- TypeScript API contracts and input validation, including rejection of malformed UTF-16 surrogate sequences.
- Numeric, alphanumeric and UTF-8 byte-mode segmentation, with version-aware optimal segment boundaries.
- UTF-8 ECI assignment 26 for non-ASCII input; overhead is included in version capacity planning.
- QR version 1–40 data capacity and error-correction block layout tables.
- Deterministic smallest-fitting version selection (or exact requested version) at an explicit correction level.
- Exact MSB-first QR bitstream, terminator, alignment and alternating data pad bytes.
- Internal verification against independent capacity/codeword vectors and an exhaustive short-input segmentation oracle.
- **Not completed:** Reed–Solomon ECC, matrix construction, masking, SVG/PNG rendering. The public `qrypt()` function deliberately still throws until those steps are integrated.

Encoding is only available via private source modules at this stage; this is **not** a QR generation release.

## Development

Use Node.js 22.12+ and install dependencies after registry access is available:

```bash
npm install
npm run typecheck
npm run verify:foundation  # dependency-free foundation smoke checks
npm run verify:encoding    # dependency-free encoding checks with TypeScript compiler
npm run test
npm run build
npm run verify:package
npm pack --dry-run
```

**Known foundation limitation:** The lockfile and registry-dependent commands have not yet been verified in this workspace. Generate and commit the `package-lock.json` with a successful `npm install` before claiming a reproducible build or publishing.

See `docs/MILESTONE-01.md` and `docs/MILESTONE-02.md` for milestones and verification limits.

## License

MIT.
