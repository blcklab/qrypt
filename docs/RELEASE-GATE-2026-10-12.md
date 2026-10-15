# Qrypt — final production release gate audit (2026-10-12)

**Verdict: NOT APPROVED FOR PUBLICATION.** The QR encoding and image-generation checks below passed, but the actual production bundler and packaged consumer gates have not executed successfully. This report describes the *Milestone 9 + release-audit updates* source, not a published npm version.

## Baseline and environment

- Baseline: `blcklab-qrypt-m9-release-candidate-clean-source.zip` (the original Milestone 9 artifact).
- Source changes in this audit: optional independent ZBar ECI check, updated README/release checklist/changelog, and this report. **No implementation changes to `src/` or public API.**
- Package: `@blcklab/qrypt@0.1.0`; `private: true`; zero declared runtime dependencies.
- Environment: Linux, Node.js 22.16.0, npm 10.9.2, global TypeScript 5.8.3. Python 3.13; qrcode, Pillow, NumPy, OpenCV, CairoSVG and pyzbar/ZBar available for optional development testing.
- npm registry request failed with DNS error `EAI_AGAIN`; local pinned `tsdown`, `vitest`, `@vitest/coverage-v8` and a verified `package-lock.json` are unavailable.

## Executed checks (passed)

| Test | Evidence / result |
| --- | --- |
| Strict source TypeScript | `npm run typecheck` — passed |
| Documentation / metadata | `npm run verify:docs` — passed; `npm run verify:distribution:static` — **3/3** |
| Source-compiled Node regression suites | **56/56**, including encoding, ECC, matrix, SVG, PNG, conformance and foundation |
| Independent full matrix reference | `npm run verify:conformance-reference:full` — **480/480** module-for-module comparisons, using the chosen QR mask |
| Independent SVG scanner | `npm run verify:svg-decode` — **5/5** |
| Independent PNG scanner | `npm run verify:png-decode` — **5/5** |
| Independent Unicode/ECI scanner | `npm run verify:eci-zbar` — **9/9**, exact UTF-8 payload bytes; including the earlier `π 3.14` Version 2/M OpenCV edge case |
| Source-compiled ESM | Node loaded `.m7-check/index.js` and `.m7-check/png.js`, generated valid SVG and PNG for three payloads. **Not a production bundle test.** |

The ZBar result is independent scanner evidence, not a guarantee of universal QR-reader interoperability or official ISO certification. OpenCV previously failed one of these symbols while ZBar decoded it, so applications should test their target readers.

## Blocked/failed release gates (not regressions in verified QR encoding)

| Command / gate | Actual observed result |
| --- | --- |
| `npm view tsdown@0.23.0 version` | `EAI_AGAIN` resolving `registry.npmjs.org` |
| `npm ci --offline` | Fail: `package-lock.json` is missing |
| `npm run test` | Fail: `vitest: not found` |
| `npm run build` | Fail: `tsdown: not found` |
| `npm run check:release` | Fails closed at `verify:lockfile` (missing lockfile) |
| `npm pack --dry-run` | Fail: `prepack` requires unavailable `tsdown` |
| Actual ESM/CJS and `.d.ts` / `.d.cts` from tsdown | **Not generated or verified** |
| Isolated installation from actual npm tarball | **Not run**, because production build artifacts are unavailable |
| Source-compiled ESM in browser (optional Playwright attempt) | Chromium was blocked by administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR` for local test server). **Not passed**. A production browser bundle remains to be tested. |
| Exact raw/minified/gzipped distributable sizes | **Not measured**, because there is no production build. Do not invent numbers. |

## Reproduction / next required steps

On a registry-connected development machine using supported Node.js:

```bash
npm install
# Review and commit the generated package-lock.json.
npm ci
npm run check:release
npm run test:coverage
npm run verify:conformance-reference:full
npm run verify:svg-decode
npm run verify:png-decode
npm run verify:eci-zbar
npm pack --dry-run
```

The four Python-based commands are optional development conformance checks; install their documented Python test dependencies separately. All runtime QR generation remains JavaScript/TypeScript only.

Review the real `dist/` files, exports, tarball inventory, consumer ESM/CommonJS + TypeScript import results and bundle sizes. Test a real browser integration using the *actual production bundle*, not just source-compiled modules. Resolve any failures and repeat the checks after changes.

Keep `private: true` and do not create an npm release/tag, enable provenance, or publish without explicit maintainer authorization after all release gates pass.
