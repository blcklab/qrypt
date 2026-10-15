# Changelog

This file records public-facing changes. It is not evidence that a package has been published.

## [Unreleased] — 0.1.0 candidate (not approved)

### Added

- Standards-based QR Code Model 2 data encoding, segment optimization, Reed–Solomon correction, and matrix construction, versions 1–40 with L/M/Q/H correction.
- `qrypt(input, options?)` with readonly symbol metadata and defensive matrix copies.
- Pure `toSVG(qr, options?)` rendering in the core entrypoint.
- Portable, optional `toPNG(qr, options?)` via `@blcklab/qrypt/png`.
- Independent encoder/matrix reference checks, scanner-based SVG and PNG checks, and public API regression tests.
- ESM/CommonJS and TypeScript declaration export maps, plus a packed-package consumer verification script.
- Consumer README, release checklist, and documentation integrity checks.

### Limitations / release blockers

- Package is still `private: true` and unpublished.
- `package-lock.json`, production tsdown/Vitest verification, isolated npm consumer installation, and declaration checks require an online environment.
- Unicode/ECI was additionally validated by ZBar (nine exact UTF-8 reads). OpenCV behavior remains scanner-dependent; universal interoperability is not claimed.

Release notes and tag must not be finalized until the release checklist is complete.
