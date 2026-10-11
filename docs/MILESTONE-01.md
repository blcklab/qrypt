# Qrypt — Milestone 1 handoff

## Agreed public contract

- `qrypt(text, encodingOptions)` returns `QryptResult` after encoding milestones are implemented.
- `toSVG(result, renderOptions)` is a separate renderer and does not re-encode text.
- `result.matrix()` will return a fresh row-major `boolean[][]` with no quiet zone.
- `result.size === 4 * result.version + 17`, and `result.mask` is 0–7.
- Defaults: ECC M, version auto, SVG scale 8, quiet zone 4, black/white.
- Invalid Unicode surrogates are rejected instead of being silently replaced.
- Numeric/alphanumeric/byte mode segmentation and UTF-8 ECI are planned for milestone 2.
- PNG is deliberately not exported until independently verified.

## Scope completed

- Fresh standalone package scaffold; no pre-existing Qrypt repository supplied.
- Public TypeScript surface and input/option boundary validation.
- Explicit unavailable-feature errors, not fake QR output.
- Strict TS configuration, Vitest tests, tsdown ESM/CJS build config, distribution smoke script.
- MIT license and development-status README.

## Why tsdown rather than tsup?

The tsup project now notes that it is no longer actively maintained and directs users toward tsdown. tsdown supports dual ESM/CJS output and declarations. Actual output filenames and Node resolution still require verification after installing dependencies.

## Verified in the available workspace

- `npm run typecheck` — **PASS** (global TypeScript 5.8.3).
- `npm run verify:foundation` — **PASS: 11/11 Node built-in smoke tests**.
- Registry connectivity — **FAILED** (`EAI_AGAIN` resolving registry.npmjs.org).
- Complete Vitest tests and release build — **NOT RUN** (dependencies unavailable).

These smoke tests validate only the foundation and error boundaries. They are not QR conformance tests.

## External validation pending

The tool environment could not access the npm registry. No project dependencies were installed, so the Vitest runner, tsdown bundler, output declarations, ESM/CJS consumer loading, and packed tarball have **not** been verified. A lockfile could not be honestly generated. Do not mark M1 release tooling complete until these are executed in a network-enabled environment.

## Next milestone

Implement bit buffering, Unicode UTF-8/ECI, numeric/alphanumeric/byte segments, efficient mixed segmentation, QR data capacity and version selection. Add independent test vectors. Do not progress into Reed–Solomon or SVG yet.
