# Milestone 3 — Reed–Solomon parity and block interleaving

## Added

- `src/ecc/reed-solomon.ts`: portable GF(256) multiplication using the QR polynomial `0x11D`, monic generator polynomial from roots `2^0 .. 2^(degree-1)`, and full-width parity remainders.
- `src/ecc/interleave.ts`: exact QR short/long Reed–Solomon block partitioning and separate data/ECC interleaving for versions 1–40, levels L/M/Q/H. Does not modify caller-supplied data arrays.
- `EncodingPlan.interleavedCodewords`: complete ordered **codewords** (data + parity). These do not yet contain the matrix's 0–7 remainder bits, functional modules, format/version information, or masking.
- `test/fixtures/reference-ecc.json`: known-answer GF and generator vectors, reference complete QR codewords, and SHA-256 of independently generated interleaved codewords for all 160 layouts.
- `scripts/generate-ecc-fixtures.py`: optional fixture regeneration with the independent third-party Python `qrcode` package (development-only, no npm dependency).
- Node built-in and Vitest test cases for ECC, known examples and validation.

## Verification executed locally

- `npm run typecheck` — passed, using globally available TypeScript 5.8.3.
- `npm run verify:foundation` — 11/11 passed.
- `npm run verify:encoding` — 11/11 passed, including 160 capacity checks and 1,500 segmentation oracle cases.
- `npm run verify:ecc` — 8/8 passed, including all 160 independent ECC/interleave digests and complete known-answer codewords for numeric, alphanumeric and byte payloads.
- Independent checks used Python `qrcode`'s RS polynomial arithmetic and QR block tables, *not* the TypeScript implementation being tested.
- `npm pack --dry-run` without a prior build contains `LICENSE`, `README.md`, and `package.json` only; **the resulting tarball is NOT usable** because `dist/` has not been built.

## Not verified / release blockers

- Runtime tools `vitest` and `tsdown` are not installed in the offline environment; do not claim their test suite or bundling succeeded.
- `npm install` and lockfile generation depend on registry access; `package-lock.json` is still missing.
- The public `qrypt()` and SVG renderer intentionally throw. No QR symbol is available yet, so no independent QR scanner/decoder test can be performed.
- Milestone 4 must construct and verify functional patterns, format and version information, mask choice, bit placement and remainder bits.

## Architecture constraints

- ECC remains internal to the library; no new consumer-facing exports or runtime dependencies were added.
- `interleaveWithErrorCorrection()` checks that input length exactly matches data codeword capacity. The matrix code should consume `EncodingPlan.interleavedCodewords` and append the required QR remainder **bits** during placement.
- The library remains `private: true` and unpublished until the full release quality gates pass.

## Reference sources

- Independent fixture generation: Python `qrcode` `base.rs_blocks`, `base.Polynomial`, `util.create_bytes`, `util.create_data`.
- Mathematical background: QR GF(256) with generator element 2 and polynomial `0x11D`; see [rsc/qr GF256](https://github.com/rsc/qr/blob/master/gf256/gf256.go) and [Nayuki's QR Code generator documentation](https://www.nayuki.io/page/qr-code-generator-library).
