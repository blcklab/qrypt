/** Check reader-friendly public docs, documented imports and package docs isolation. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = name => readFileSync(resolve(root, name), 'utf8')
const manifest = JSON.parse(read('package.json'))
const publicDocs = [
  'README.md', 'CHANGELOG.md', 'docs/README.md', 'docs/GETTING-STARTED.md',
  'docs/GENERATING.md', 'docs/EXPORTING.md', 'docs/STYLING-AND-LOGOS.md',
  'docs/PAYLOADS.md', 'docs/DECODING.md', 'docs/ADVANCED.md',
  'docs/SECURE-QR.md', 'docs/API.md', 'docs/TROUBLESHOOTING.md',
]
const publicSource = new Map([
  ['@blcklab/qrypt', 'src/index.ts'],
  ...['png', 'render', 'styled', 'logo', 'payloads', 'decode', 'advanced', 'secure']
    .map(name => [`@blcklab/qrypt/${name}`, `src/${name}.ts`]),
])

assert.equal(manifest.name, '@blcklab/qrypt')
assert.equal(manifest.license, 'MIT')
assert.equal(manifest.publishConfig?.access, 'public')
assert.ok(manifest.private === undefined || typeof manifest.private === 'boolean', 'private must be a boolean when set')
assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE'])
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [])
assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './advanced', './decode', './logo', './payloads', './png', './render', './secure', './styled'])
assert.equal(manifest.scripts['workflow:test'], 'node .workflow/test.mjs')
assert.ok(existsSync(resolve(root, '.workflow/test.mjs')))
assert.match(read('.gitignore'), /^\.internal\/$/m, 'Local .internal/ notes must be Git-ignored')
assert.ok(readdirSync(resolve(root, 'docs')).every(name => !/^MILESTONE-|RELEASE-|^M\d+-|^SECURE-QR-ROADMAP/.test(name)), 'Development notes must not appear in public docs')

const readme = read('README.md')
assert.match(readme, /# Qrypt/)
assert.match(readme, /## Installation/)
assert.match(readme, /## Quick start/)
assert.match(readme, /## Documentation/)
let imports = 0
let links = 0
for (const doc of publicDocs) {
  const contents = read(doc)
  assert.match(contents, /^# /, `Missing page title: ${doc}`)
  for (const match of contents.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](@blcklab\/qrypt(?:\/(?:png|render|styled|logo|payloads|decode|advanced|secure))?)['"]/g)) {
    const [, names, packageName] = match
    const entry = publicSource.get(packageName)
    assert.ok(entry, `Unknown documented entrypoint ${packageName} in ${doc}`)
    const source = read(entry)
    for (const item of names.split(',')) {
      const name = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      assert.match(name, /^[A-Za-z_$][\w$]*$/, `Invalid import name ${name} in ${doc}`)
      assert.match(source, new RegExp(`\\b${name}\\b`), `Unexported symbol ${packageName}/${name} in ${doc}`)
    }
    imports++
  }
  for (const [, href] of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/i.test(href)) continue
    const file = href.split('#')[0]
    const destination = resolve(root, dirname(doc), decodeURIComponent(file))
    assert.ok(destination.startsWith(root + sep), `External path in public documentation: ${href}`)
    assert.ok(existsSync(destination), `Broken documentation link: ${doc} → ${href}`)
    links++
  }
}
assert.ok(imports >= 15, `Not enough tested import examples: ${imports}`)
assert.ok(links >= 25, `Expected connected documentation, saw ${links} links`)
console.log(`Documentation verified: ${publicDocs.length} public pages, ${imports} API imports, ${links} local links; development notes isolated.`)
