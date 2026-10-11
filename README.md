# Qrypt

A lightweight, framework-agnostic TypeScript QR Code Model 2 generator.

> **Development status: Milestone 1 foundation only.** QR encoding, SVG rendering and PNG output are **not yet implemented**. The package is marked `private` intentionally and must not be published or used as a QR generator until the conformance milestones pass.

## Planned public API

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'M' })
const matrix = qr.matrix() // matrix[y][x]: dark module?
const svg = toSVG(qr, { scale: 8, margin: 4 })
```

The example documents the **target contract**, not working Milestone 1 functionality.

## Proposed options

Encoding accepts `errorCorrectionLevel` (`L`, `M`, `Q`, `H`; default `M`) and `version` (`1`–`40` or `auto`; default `auto`). Rendering uses separate `scale` (default `8`), `margin` (default `4`), `darkColor` and `lightColor` options. Colors will be restricted to six-digit hex strings.

## Implemented in this milestone

- TypeScript API contracts and input validation, including explicit rejection of malformed UTF-16 surrogate sequences.
- Intentional errors for not-yet-implemented encoder and renderer.
- Initial ESM/CJS build configuration, test scaffolding, and package verification script.

## Development

Use Node.js 22.12+ and install dependencies after registry access is available:

```bash
npm install
npm run typecheck
npm run verify:foundation  # dependency-free foundation smoke checks
npm run test
npm run build
npm run verify:package
npm pack --dry-run
```

**Known foundation limitation:** The lockfile and registry-dependent commands have not yet been verified in this workspace. Generate and commit the `package-lock.json` with a successful `npm install` before claiming a reproducible build or publishing.

See `docs/MILESTONE-01.md` for the release gates and scope.

## License

MIT.
