# Milestone 5 — Standalone SVG renderer

## Scope

**Baseline:** Milestone 4 clean source, with an independently verified QR matrix generator.

**Completed:** `toSVG(qr, options?)` now renders the existing QR result into standalone SVG markup. It uses a filled light rectangle and dark horizontal path strips (adjacent modules merged into one strip). Coordinates use whole modules under the SVG `viewBox`, avoiding blurry fractional module edges. `shape-rendering="crispEdges"` is included.

**Rendering controls:** positive integer `scale` (default 8), nonnegative integer quiet-zone `margin` (default 4), dark color `#000000`, light color `#FFFFFF`. Colors must be exactly six-digit `#RRGGBB`; unknown settings are rejected. Maximum SVG pixel dimension is 65,535 on each side. The renderer rejects incomplete/forged matrices rather than generating confusing output.

**Security:** QR input text is never placed into an SVG element or attribute. User-controlled color strings are validated before interpolation. No DOM, Node-specific APIs, dynamic code evaluation, or runtime dependency is required.

## Source changes

- `src/render/svg.ts`: complete renderer, bounds/option/matrix validation and compact dark module path generation.
- `test/svg.node.test.mjs`: dependency-free SVG path-coordinate conformance and validation tests.
- `test/svg.test.ts`: Vitest equivalents for automated repository CI.
- `scripts/verify-svg-render.py`: optional independent CairoSVG rasterization + OpenCV decoding.
- `test/api.test.ts`, `test/foundation.node.test.mjs`: update legacy expected-unimplemented renderer checks to the new working contract.
- `package.json`: new `verify:svg` and `verify:svg-decode` commands.
- `scripts/verify-package.mjs`: production ESM and CJS SVG smoke check (not yet executable without bundling).
- `README.md`: updated consumer docs and explicit remaining release blockers.
- `.gitignore`: ignore emitted `.m5-check/` folder.

## Verification performed

- `tsc -p tsconfig.json --noEmit`: passed.
- `npm run verify:foundation`: 11/11 passed.
- `npm run verify:encoding`: 11/11 passed.
- `npm run verify:ecc`: 8/8 passed.
- `npm run verify:matrix`: 8/8 passed, including previously recorded 160 independent QR matrix fixture checks.
- `npm run verify:svg`: 6/6 passed, including a reconstruction of dark modules for versions 1, 7, 22 and 40 at all four ECC levels (16 symbols). The tests enforce the four-module quiet zone and byte-for-byte deterministic SVG output.
- `python scripts/verify-svg-render.py`: 5/5 independent QR scans passed after rasterizing **the actual SVG string** via CairoSVG. Covers a URL, alphanumeric, numeric, UTF-8/ECI, and version 7 symbol. OpenCV emitted its pre-existing ECI support warning, though the example decoded correctly.
- Incremental patch independently applied against original Milestone 4 source and clean-source equality checked.

## Release status

The SVG feature is implemented and validated locally. However, `vitest` / `tsdown` installation, actual production bundling, isolated ESM/CJS consumption, generated declaration verification, and reproducible lockfile remain unverified because npm development dependencies are absent. The package must remain private and unpublished.

PNG generation is deferred to **Milestone 6** and must not be silently added to the main entry point.

## Reproducibility

```bash
npm run typecheck
npm run verify:foundation
npm run verify:encoding
npm run verify:ecc
npm run verify:matrix
npm run verify:svg
npm run verify:svg-decode  # needs CairoSVG, OpenCV, NumPy
```

The independent test utilities are development-only and are not part of the distributed runtime.
