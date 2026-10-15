# Milestone 9 — Documentation and release candidate preparation

## Scope

Document the verified source API, provide actionable release criteria, and make documentation drift detectable without adding any public runtime API or dependency.

## Changes

- Rewrote `README.md` as a consumer-focused quick start with accurate matrix, SVG and PNG examples, option defaults, error behavior, runtime boundaries, and explicit prepublication status.
- Added `CHANGELOG.md` with the intended `0.1.0` candidate scope (not a publication claim).
- Added `docs/RELEASE-CHECKLIST.md` with full npm/consumer, scanner, browser, and maintainer authorization gates, including private GitHub provenance caution.
- Added `scripts/verify-docs.mjs` and a static documentation test to enforce consistency with the public exports and repo metadata.
- Added `publishConfig.access: public` for the eventual authorized scoped npm release, keeping `private: true` throughout this milestone.

## Actual verification

Offline execution in the Milestone 9 workspace:

- `npm run typecheck`: **passed** (global TypeScript).
- `npm run verify:docs`: **passed** (nine checked public import examples, required documentation sections, relative links, and manifest status).
- `npm run verify:distribution:static`: **3/3 passed**.
- `npm run verify:foundation`, `verify:encoding`, `verify:ecc`, `verify:matrix`, `verify:svg`, `verify:png`, `verify:conformance`: **56/56 passed** in aggregate.
- `npm run verify:svg-decode`: **5/5 independently scanned**.
- `npm run verify:png-decode`: **5/5 independently scanned**.
- `npm run verify:lockfile`: **blocked as expected** (`package-lock.json` absent).
- `npm run verify:package`: **blocked as expected** (`dist/` absent).
- `npm run build`: **not runnable** (`tsdown` not installed).

The checks passing here do **not** replace the unrun tsdown build, Vitest, isolated actual tarball consumers, or lockfile check.

## Deferred / blockers

`package-lock.json` must be produced from a real successful dependency install. The GitHub repository URL must be verified before adding repository metadata. No version bump, tag, or `npm publish` is authorized by this milestone.

## Follow-up

Complete the release checklist in an environment with registry access; resolve any actual build/export errors before accepting a release candidate.
