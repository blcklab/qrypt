# Qrypt test & publishing workflows

This folder contains executable, dependency-free Node scripts for maintainers. They are **not** part of the npm package.

## Run tests before release

```bash
npm ci                           # requires committed package-lock.json
npm run workflow:test             # complete standard release checks + Vitest coverage
npm run workflow:test -- --full   # additionally run independent Python scanner/reference tests
```

Use `npm run workflow:test -- --ci` for a clean reinstall first. The optional `--full` checks require your local Python tools (`qrcode`, Pillow, OpenCV, NumPy or other tools needed by the existing scripts); none become Qrypt runtime dependencies. Real-device camera/print checks are still required and are not automated here.

The test workflow runs `check:release` (typecheck, docs, architecture, hardening, reliability, Vitest, ESM/CJS builds, bundle graph, package verifier and npm pack review) and then `test:coverage`.

## Inspect a release without publishing

```bash
npm run workflow:publish
```

The default performs release and coverage checks, then **stops without publishing**. It requires a clean Git tree and a committed lockfile.

## Publication — manually approved only

Until publication is approved, `package.json` contains `"private": true`; **do not change it merely to run tests**. When the maintainer has reviewed all tests, real-camera results, package contents, security policies, npm package ownership, and release notes:

1. Confirm the version, scoped package ownership, package contents and clean release commit.
2. Explicitly change `"private"` to `false`, update changelog/status and lockfile if necessary, then commit the change.
3. Configure npm authentication securely; never commit an npm token.
4. Run the guarded command, substituting the approved version:

```bash
QRYPT_PUBLISH_APPROVED=yes npm run workflow:publish -- --publish --confirm=@blcklab/qrypt@0.1.0
```

The workflow publishes with `--tag next`, **not** `latest`, so a preview cannot silently replace a stable release. It performs no tag push or Git mutation. Record the npm URL and commit after successful publication. For a stable release, promote the dist-tag only after independent approval and verification.

## GitHub Actions

- [`.github/workflows/test.yml`](../.github/workflows/test.yml) — runs quality and coverage for pushes and pull requests using Node 22 and 24.
- [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) — **manual** dispatch, requires an npm-release environment and `NPM_TOKEN`; the same `private:false` and explicit-approval gates still apply.

A committed `package-lock.json` is mandatory for reproducible `npm ci`. It was not included in the M20 handoff ZIP; use the lockfile from your locally verified checkout and commit it before enabling CI. Do not regenerate it by hand or bypass `verify:lockfile`.
