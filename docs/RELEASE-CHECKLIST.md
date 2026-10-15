# Qrypt 0.1.0 — Release checklist

**Status: BLOCKED / NOT PUBLISHED.** Completing documentation alone does not certify ISO/IEC 18004 conformance, approve publication, or prove that npm consumers can import Qrypt.

## A. Required before publication (all gates)

- [ ] Review the source, public API, and zero-runtime-dependency manifest. Confirm no new dependencies or unsupported features.
- [ ] Run `npm install` with registry access and review `package-lock.json`; commit it.
- [ ] Run `npm ci` from a clean checkout and ensure the lockfile is reproducible.
- [ ] Run `npm run typecheck` and `npm run verify:docs`.
- [ ] Run `npm run test` and `npm run test:coverage` with the pinned Vitest packages; inspect failing/flaky tests and coverage gaps.
- [ ] Run `npm run verify:conformance-reference:full` with Python `qrcode` installed.
- [ ] Run `npm run verify:svg-decode` and `npm run verify:png-decode` with the documented optional Python tooling installed.
- [x] Independently check Unicode/ECI on a scanner other than OpenCV: ZBar returned exact UTF-8 for nine cases, including the earlier OpenCV failure. Document scanner-dependent compatibility and continue testing target devices before publication.
- [ ] Run `npm run check:release` and confirm the **actual** ESM/CJS builds, `.d.ts`/`.d.cts` declarations, and isolated consumer installs pass.
- [ ] Inspect generated `dist/` files and log minified/gzipped bundle sizes from the verifier. Validate core entry does not eagerly include PNG.
- [ ] Inspect `npm pack --dry-run` and the actual verifier tarball list for leaks and missing files.
- [ ] Test ESM, CommonJS, and TypeScript consumer imports in supported Node versions and verify a real modern browser integration.
- [ ] Review release notes, license, npm name ownership/availability, and npm organization publication permission.
- [ ] Record exact commands, environment versions, results, and accepted limitations in a signed-off release report.

## B. Publication authorization (manual, never automatic)

Only after all the above gates pass and the maintainer **explicitly authorizes publication**:

1. Inspect and update `package.json` with real repository/issue URLs **only after the repository exists**.
2. Set `private: false` (or remove the property) in `package.json` **after** approval. Update the README/status notes to match the new packaging state; then regenerate/verify any changed lockfile metadata.
3. Confirm the scoped package must be public; `publishConfig.access` is already `public`.
4. If npm provenance is enabled in CI, confirm the source repository visibility is compatible with npm's current provenance rules. Do not enable provenance blindly for a private GitHub source repository.
5. Run the final `npm ci`, `npm run check:release`, `npm run test:coverage`, and `npm pack --dry-run`; inspect the exact upload payload.
6. Only with the maintainer's permission, publish using the approved workflow and public access. Never substitute a dry run for successful publication.
7. Verify installation and imports from the actual registry release in a clean consumer project, then create release notes/tag based on the published version.

`private: true` deliberately prevents `npm publish`; **never remove it merely to make a test pass**.

## C. Known issues and acceptance policy

- This development workspace does not have the pinned `tsdown`, `vitest`, or `@vitest/coverage-v8` installed, and could not obtain them offline.
- `package-lock.json` is absent. No generated or guessed dependency-integrity entries may be committed.
- The complete npm tarball and dual-module declaration import gates have **not yet run**; corresponding scripts exist but are not proof of completion.
- `npm pack --dry-run` normally invokes `prepack`, which requires a working build toolchain. Do not claim it passes unless it ran successfully.
- PNG is intentionally opaque with a two-color palette, and SVG accepts only `#RRGGBB` colors.
- Unicode uses UTF-8 ECI 26. ZBar decoded the previously failing OpenCV `π 3.14` v2/M case, suggesting reader interoperability variance. Official certification and universal reader support are not claimed.

## D. Release report template

Copy and fill this section after performing a real release gate:

- Commit / source hash:
- Node and npm versions / operating system:
- `npm ci`:
- `npm run typecheck` / `npm run verify:docs`:
- `npm run test` / coverage:
- Full reference and image decoding checks:
- `npm run check:release`:
- ESM/CJS/DTS and browser smoke results:
- Tarball file inventory and raw/gzip sizes:
- Accepted limitations / unresolved issues:
- Maintainer decision and publication authorization:
