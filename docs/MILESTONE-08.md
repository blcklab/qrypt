# Milestone 8 — Distribution quality (gated)

## Purpose

Validate **the package consumers will actually install**, not just local `dist/` files. The release is intentionally held until all gates run on a machine with the declared build and test dependencies.

## Changes

- Retained a deliberately small, explicit dual-format package exports map (`.` and `./png`), with ESM/CJS declarations.
- Replaced the old direct-`dist` smoke test with `scripts/verify-package.mjs`. It verifies entrypoints, runtime-dependency policy, and the actual `npm pack --json` tarball file list; installs that tarball offline into an isolated consumer; loads ESM and CommonJS imports by **package name**; and type-checks `.mts`/`.cts` consumers with NodeNext resolution.
- The check also prints raw and gzipped entrypoint sizes. No artificial size claim is made.
- Added `prepack` to rebuild before normal `npm pack`; `verify:package` uses `--ignore-scripts` internally to avoid recursive prepack invocations. A package built externally must pass `verify:package` before release.
- Added `verify:lockfile` and `check:release` to enforce a committed modern npm lockfile before release.
- Left the PNG encoder an isolated `@blcklab/qrypt/png` subpath; no new runtime dependencies.

## Actual environment verification

- `npm run typecheck` — passed with TypeScript installed globally.
- `npm run verify:distribution:static` — passed (three static manifest, dual declaration map, and release-guard tests).
- Milestone 1–7 dependency-free Node tests — rerun: 56/56 passed.
- Independent SVG and PNG scanning — 5/5 each passed (some OpenCV ECI warnings).
- `verify:package` fails **as intended** when `dist/` has not been built; the old script misleadingly exercised only local build paths.
- `verify:lockfile` fails **as intended** with a clear message because `package-lock.json` is absent.

The registry cannot be reached from this workspace, and `tsdown`, `vitest`, and `@vitest/coverage-v8` have not been installed. Therefore **the production bundler, Vitest, declaration output, isolated actual packed-package runtime checks, and `npm ci` have not yet been executed**. This milestone adds correct release gates but does not falsely claim to have passed them.

## Final validation on a machine with registry access

1. `npm install` (generates and commits `package-lock.json`).
2. `npm ci` (reproducible install from the lockfile).
3. `npm run check:release` (typecheck, Vitest, production ESM/CJS/DTS build, real packed-package consumer install, ESM/CJS runtime tests, both declaration consumers, and dry-run packaging).
4. `npm run test:coverage` (review real coverage, not a fabricated target).
5. Confirm no `dist/` files are missing. Inspect package file list and both raw/gzip bundle sizes recorded by `verify:package`.
6. Keep `private: true` and do not publish until the release is approved.

If tsdown changes its actual extension output, **fix the exports map only after inspecting real built artifacts and rerun the packed-package checks**. Never fabricate dist files or passing results.
