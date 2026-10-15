/** Documentation consistency checks; intentionally needs only Node.js built-ins. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const read = (file) => readFileSync(resolve(root, file), 'utf8')
const readme = read('README.md')
const changelog = read('CHANGELOG.md')
const checklist = read('docs/RELEASE-CHECKLIST.md')
const index = read('src/index.ts')
const png = read('src/png.ts')

assert.equal(manifest.name, '@blcklab/qrypt')
assert.equal(manifest.version, '0.1.0')
assert.equal(manifest.license, 'MIT')
assert.equal(manifest.publishConfig?.access, 'public', 'Scoped public npm publishing must be explicit')
assert.equal(typeof manifest.private, 'boolean', 'Package publishing state must be explicit')
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'No runtime dependencies')
assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './png'])

for (const heading of [
  '# Qrypt', '## Installation', '## Quick start', '## Generate a module matrix',
  '## Render SVG', '## Render PNG', '## Browser usage', '## Node.js usage',
  '## Errors and interoperability', '## Development and release checks', '## License',
]) {
  assert.ok(readme.includes(heading), `README is missing heading: ${heading}`)
}
if (manifest.private) {
  assert.match(readme, /\bprivate: true\b/, 'Unpublished README must explain the publishing gate')
} else {
  assert.doesNotMatch(readme, /\bprivate: true\b/, 'README incorrectly describes approved package as private')
}
assert.match(readme, /not published|unpublished|not yet published/i)
assert.match(changelog, /Unreleased/)
assert.match(checklist, /BLOCKED \/ NOT PUBLISHED/)
assert.match(checklist, /npm run check:release/)
assert.match(checklist, /maintainer.*(authoriz|permission)/i)

// Verify documented, named package imports are actually exposed by the source
// entrypoints. Avoid assuming unpublished package imports already resolve.
const sourceExports = new Map([
  ['@blcklab/qrypt', index],
  ['@blcklab/qrypt/png', png],
])
let importCount = 0
for (const match of readme.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](@blcklab\/qrypt(?:\/png)?)['"]/g)) {
  const [, names, path] = match
  for (const item of names.split(',')) {
    const name = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
    assert.match(name, /^[A-Za-z_$][\w$]*$/, `Unexpected documented import name: ${name}`)
    assert.match(sourceExports.get(path), new RegExp(`\\b${name}\\b`), `README imports ${name} but ${path} does not export it`)
  }
  importCount++
}
assert.ok(importCount >= 7, 'Expected multiple real public import examples in README')

// Validate local relative Markdown links. External URLs and fragment-only links
// are outside this repository and intentionally excluded.
for (const doc of ['README.md', 'CHANGELOG.md', 'docs/RELEASE-CHECKLIST.md', 'docs/MILESTONE-09.md']) {
  const contents = read(doc)
  for (const [, target] of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue
    const path = target.split('#')[0]
    const full = resolve(root, dirname(doc), decodeURIComponent(path))
    assert.ok(full.startsWith(root + '/') && existsSync(full), `Broken local link in ${doc}: ${target}`)
  }
}
console.log(`Documentation verified: ${importCount} public import examples, sections, relative links, prepublication state and export metadata.`)
