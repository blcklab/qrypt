import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('public exports include core and optional PNG/payloads/render/secure/styled/logo entries', () => {
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './advanced', './decode', './logo', './payloads', './png', './render', './secure', './styled'])
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [])
  assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}), [])
  assert.deepEqual(Object.keys(manifest.optionalDependencies ?? {}), [])
  assert.equal(manifest.sideEffects, false)
  assert.deepEqual(manifest.files, ['dist', 'docs', 'README.md', 'LICENSE'])
})

test('ESM and CommonJS declarations are mapped explicitly for all entries', () => {
  for (const [entry, name] of [['.', 'index'], ['./advanced','advanced'], ['./decode','decode'], ['./logo', 'logo'], ['./png', 'png'], ['./payloads', 'payloads'], ['./render', 'render'], ['./secure', 'secure'], ['./styled', 'styled']]) {
    const exports = manifest.exports[entry]
    assert.equal(exports.import.default, `./dist/${name}.js`)
    assert.equal(exports.require.default, `./dist/${name}.cjs`)
    assert.equal(exports.import.types, `./dist/${name}.d.ts`)
    assert.equal(exports.require.types, `./dist/${name}.d.cts`)
  }
  assert.equal(manifest.main, './dist/index.cjs')
  assert.equal(manifest.module, './dist/index.js')
  assert.equal(manifest.types, './dist/index.d.ts')
})

test('release has explicit pack, lockfile, and consumer install gates', () => {
  assert.equal(manifest.scripts.prepack, 'npm run build')
  assert.match(manifest.scripts['verify:package'], /verify-package/)
  assert.match(manifest.scripts['check:release'], /verify:lockfile/)
  assert.equal(typeof manifest.private, 'boolean')
})
