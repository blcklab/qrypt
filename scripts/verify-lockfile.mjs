/** Fail closed when the release lockfile has not been generated and committed. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const location = new URL('../package-lock.json', import.meta.url)
if (!existsSync(location)) {
  console.error('Release blocked: package-lock.json is absent. Run npm install with registry access, review and commit the lockfile.')
  process.exit(1)
}
const lock = JSON.parse(readFileSync(location, 'utf8'))
assert.equal(lock.name, manifest.name)
assert.equal(lock.version, manifest.version)
assert.ok(lock.lockfileVersion >= 3, 'Expected a modern npm lockfile')
assert.deepEqual(lock.packages?.['']?.devDependencies ?? {}, manifest.devDependencies ?? {}, 'Lockfile development dependencies differ from the manifest')
assert.deepEqual(lock.packages?.['']?.dependencies ?? {}, manifest.dependencies ?? {}, 'Lockfile runtime dependencies differ from the manifest')
console.log('Release lockfile metadata matches package.json.')
