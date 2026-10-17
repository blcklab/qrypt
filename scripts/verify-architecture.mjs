/** Enforce optional-subpath isolation and dependency-free portable source. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const src = join(root, 'src')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'Source must have no npm runtime dependencies')
assert.deepEqual(Object.keys(manifest.optionalDependencies ?? {}), [], 'Source must have no optional dependencies')
assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}), [], 'Source must have no required framework peer dependencies')

const graph = new Map()
function walk(file) {
  if (graph.has(file)) return
  assert.ok(file.startsWith(src + '/') && file.endsWith('.ts'), `Invalid source path: ${file}`)
  assert.ok(existsSync(file), `Missing imported source: ${file}`)
  const contents = readFileSync(file, 'utf8')
  const dependencies = []
  graph.set(file, dependencies)
  // Intentional constraint: all production imports are static. A new dynamic
  // import must receive an explicit architecture review instead of being missed.
  assert.doesNotMatch(contents.replace(/\breadonly\s+import\s*\(/g, ''), /\bimport\s*\(/, `Dynamic import in ${file}`)
  for (const match of contents.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"\n]+)['"]/g)) {
    const specifier = match[1]
    assert.ok(specifier.startsWith('.'), `Non-relative runtime/declaration import in ${file}: ${specifier}`)
    assert.ok(specifier.endsWith('.js'), `Source imports must use JS resolution: ${specifier}`)
    const target = resolve(dirname(file), specifier.slice(0, -3) + '.ts')
    assert.ok(target.startsWith(src + '/'), `Unexpected source escape: ${specifier}`)
    dependencies.push(target)
    walk(target)
  }
}
for (const entry of Object.keys(manifest.exports)) {
  const path = entry === '.' ? 'index' : entry.slice(2)
  walk(join(src, path + '.ts'))
}
const collect = (entry, visited = new Set()) => {
  if (visited.has(entry)) return visited
  visited.add(entry)
  for (const dep of graph.get(entry) ?? []) collect(dep, visited)
  return visited
}
const core = collect(join(src, 'index.ts'))
for (const forbidden of ['/secure.ts', '/decode.ts', '/advanced.ts', '/logo.ts', '/styled.ts', '/png.ts', '/render.ts', '/payloads.ts']) {
  assert.ok(![...core].some(file => file.endsWith(forbidden)), `Core imports an optional feature: ${forbidden}`)
}
const audited = [...graph.keys()].length
console.log(`Architecture verified: ${audited} source modules, ${core.size} in core import graph, no external package imports or optional feature leakage.`)
