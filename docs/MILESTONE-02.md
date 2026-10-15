# Milestone 2 — Data encoding, optimal segmentation and capacity planning

## Scope delivered

- Internal bit writer and explicit UTF-8 scalar-to-byte encoding without DOM, Node.js, `Buffer` or `TextEncoder` APIs.
- Numeric, QR alphanumeric and byte-mode bit encoding.
- Version-group-dependent character count fields for QR Model 2 versions 1–40.
- Deterministic optimal mixed-mode segmentation, with an O(n) dynamic programming implementation using monotone queues (bounded to the QR maximum of 7,089 Unicode scalars).
- UTF-8 ECI assignment 26 for non-ASCII input, emitted before the first byte segment; the 12-bit designator is included in capacity planning.
- Full standard error-correction block layout and data capacity for 4 error-correction levels × 40 versions.
- Automatic smallest-fitting version or fixed explicit version; errors on overflow without truncation or ECC downgrade.
- Complete padded **data** codewords, excluding Reed–Solomon correction and matrix layout.

## Verification performed

- `npm run typecheck` — global TypeScript compiler, passed.
- `npm run verify:foundation` — 11 foundation Node smoke tests passed.
- `npm run verify:encoding` — 11 Node encoding tests passed, including:
  - 160 QR data capacity entries compared with an independent Python `qrcode` reference library.
  - Reference data-codeword prefixes for numeric/alphanumeric/byte/empty input (obtained independently from Python `qrcode`).
  - 1,500 pseudorandom short-input segmentations compared to a standalone quadratic brute-force oracle.
  - UTF-8 and ECI codeword placement; version boundaries, oversized payloads, max-length numeric input.
- Vitest test cases are included but **could not be executed** in the current offline toolchain (Vitest and tsdown dependencies unavailable).
- Packaging/ESM/CJS consumer verification and lockfile creation remain pending registry access; no QR matrix or decoded symbol tests are possible yet.

## Data reference provenance

- QR block layout and raw module counts: published QR Model 2 parameter tables, independently reviewed against Nayuki's MIT-licensed QR Code Generator implementation, https://www.nayuki.io/page/qr-code-generator-library .
- Independent data capacity fixture: generated using the third-party Python `qrcode` project's `base.rs_blocks(version, level)` implementation. The Python dependency is used **only in development verification**, not packaged or imported at runtime.
- Independent golden data-codeword prefixes: produced via Python `qrcode.util.create_data` with explicit encoding modes (before error-correction and interleaving).

## Architecture and pending work

Encoding modules deliberately remain internal (`src/encoding/`). The exported `qrypt()` and `toSVG()` functions still fail explicitly, rather than returning incorrect QR symbols. Milestone 3 adds Reed–Solomon correction and codeword interleaving, and Milestone 4 constructs the QR matrix and integrates a working `qrypt()` API.

**Security:** Unicode validation occurs before encoding; user input is never evaluated or interpolated into markup. Inputs larger than any possible QR payload are rejected. The upper bound is on Unicode scalars; malformed surrogate sequences are rejected at the public planning boundary.

**Limitations:** no Kanji mode, FNC1 or structured append; only Numeric/Alphanumeric/UTF-8 Byte and ECI assignment 26 are supported. Final QR conformance and independent decoding must be assessed after matrix construction.

**Release gate:** `private: true` remains set. Do not publish.
