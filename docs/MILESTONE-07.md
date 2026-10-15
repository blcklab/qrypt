# Milestone 7 — Conformance and hardening

## Objective

Prove conformance properties beyond self-referential snapshots, expand the independently generated matrices checked, and harden the public result metadata. This milestone does not claim ISO certification.

## Source changes

- `src/qrypt.ts`: Freeze the result object at runtime. Its TypeScript readonly fields are now also protected against accidental JavaScript mutation; matrix copies remain independent.
- `test/conformance.node.test.mjs`: Adds an independently expressed N1–N4 mask penalty oracle; verifies the selected mask is the lowest-penalty of all eight (lowest index breaks ties) across 44 version/level combinations. Validates exact-fit and first-oversize payloads for all 160 version/level combinations, for numeric, alphanumeric, byte and UTF-8/ECI (640 capacity-boundary pairs). Verifies ECI headers, renderer determinism, public metadata immutability, and mask formulas.
- `scripts/verify-conformance.py`: In `--full` mode independently encodes 480 symbols (40 versions × four levels × numeric/alphanumeric/byte), forcing each symbol's mask for an apples-to-apples matrix comparison against Python `qrcode`. The default shorter run selects 160 combinations, rotating the mode across version/level pairs. For each comparison, Qrypt and the independent implementation choose encoding within the same single mode; the selected mask is taken from Qrypt, **not** independently assessed by the Python test. The Node oracle separately checks mask selection.
- `package.json`, `.gitignore`, `README.md`: Add verified conformance commands, ignore local compiler output and record limitations.

## Commands

```sh
npm run typecheck
npm run verify:foundation
npm run verify:encoding
npm run verify:ecc
npm run verify:matrix
npm run verify:svg
npm run verify:png
npm run verify:conformance
npm run verify:conformance-reference       # requires Python qrcode; 160 selected cases
npm run verify:conformance-reference:full  # requires Python qrcode; all 480 cases
npm run verify:svg-decode              # requires CairoSVG/OpenCV/NumPy
npm run verify:png-decode              # requires Pillow/OpenCV/NumPy
```

The optional Python references are development tools, never runtime npm dependencies.

## Interoperability note

The existing SVG and PNG decoding smoke suites both contain a UTF-8/ECI sample and pass independent OpenCV scanning. In an additional exploratory ECI probe, OpenCV decoded 7/8 multilingual examples but failed to decode `π 3.14` in a Version 2/M symbol. The same text decoded with other versions/error-correction combinations. OpenCV also prints its known ECI support warning. This failure alone does not prove an encoder defect: it warrants checking with a second independent ECI-capable reader before making a universal Unicode scanning claim. Do not overstate cross-reader compatibility.

## Release gates still outstanding

The declared Vitest/tsdown toolchain, production ESM/CJS builds, declaration generation, consumer imports, lockfile generation and npm tarball verification require a working dependency installation and remain unverified unless executed in a separate environment. Package stays `private: true` and unpublished.
