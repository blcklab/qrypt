# Milestone 4 — QR Code Model 2 matrix construction

## Implemented

- `src/matrix/patterns.ts`: finder patterns and separators; timing patterns; version-dependent alignment grids (including version 32's special spacing); reserved format/version information; BCH format/version information; fixed dark module.
- `src/matrix/matrix.ts`: MSB-first interleaved data+ECC codeword placement in the standard two-column zigzag, explicit zero remainder bits, mask selection, and final matrix.
- `src/matrix/masking.ts`: eight QR masks and all four penalty categories (runs, solid 2×2 squares, finder-like patterns with surrounding white, and dark-module balance), including border-aware finder-like scoring. Lowest score wins; ties prefer the lower mask index.
- `src/qrypt.ts`: public `qrypt(text, options)` now returns a complete QR matrix and metadata (`version`, `size`, `errorCorrectionLevel`, `mask`). `matrix()` returns a fresh row-major boolean grid on every call. There is **no quiet zone** in this raw matrix; renderers must supply it.
- Compatibility updates to initial foundation tests, production usage documentation, and a new independent matrix fixture/test suite.

## Tests executed

- Strict TypeScript compile (`npm run typecheck`): passed.
- Foundation, encoding, ECC, matrix Node suites: **11 + 11 + 8 + 8 = 38 tests passed**.
- All **160 version x error-correction** representative final matrices matched independent `python-qrcode` symbols by SHA-256 over module grids **at the same explicit mask**. This verifies full codeword placement, format/version patterns, alignment grids and matrix bits. The mask selection itself is Qrypt's choice and is *not* independently certified by this comparison.
- Module reservations match the theoretical count for all 40 QR versions.
- Independent OpenCV `QRCodeDetector` successfully decoded **five** rasterized symbols (including UTF-8/ECI text and the version-7 transition). OpenCV emitted an ECI support warning, even though the example decoded correctly.
- Patch verification is performed independently against the original Milestone 3 clean source and retested after application.

## Regeneration / optional tests

```bash
npm run typecheck
npm run verify:foundation
npm run verify:encoding
npm run verify:ecc
npm run verify:matrix
# Requires Python qrcode, OpenCV and NumPy (development-only):
python scripts/verify-independent-decode.py
# Fixture regeneration needs Python qrcode and compiled .m4-check:
python scripts/generate-matrix-fixtures.py
```

The `reference-matrices.json` fixture is committed so the standard Node suite does **not** require Python packages. The Python dependencies do not affect the published npm runtime.

## Deliberately deferred

- SVG: `toSVG()` still throws an explicit "not implemented" error until Milestone 5. No unvalidated SVG is generated.
- PNG: Milestone 6 or a documented deferral.
- Full cross-decoder, adversarial scanning and performance matrix: Milestone 7 hardening.
- `vitest`, `tsdown`, npm registry installation, production distribution/consumer tests, and lockfile are still **unverified or unavailable** in this offline container. Do not publish from this milestone.

## Independent references

- Python [`qrcode`](https://github.com/lincolnloop/python-qrcode), forced explicit masks to normalize permitted mask-choice variation, reference matrices generated from raw QR symbols (quiet zone excluded).
- OpenCV's independent QR Code detector/decoder.
- Nayuki's QR Code generation reference and pattern/mask discussion: https://www.nayuki.io/page/qr-code-generator-library

No reference encoder or image decoder code is bundled in the Qrypt runtime.
