/** M20 built-ESM dependency reachability audit; not a full tree-shaking proof.
 * Works without esbuild or new npm dependencies. Execute after `npm run build`.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const exports = Object.entries(manifest.exports)
const graphs = new Map()

function dependencies(file) {
  if (graphs.has(file)) return graphs.get(file)
  assert.ok(file.startsWith(dist + sep) && file.endsWith('.js'), `Unexpected built ESM path ${file}`)
  assert.ok(existsSync(file), `Missing ESM chunk ${file}: run npm run build first`)
  const source = readFileSync(file, 'utf8')
  const result = []
  graphs.set(file, result)
  // Rolldown/tsdown output uses static ESM imports and re-exports.
  // Detect dynamic imports explicitly rather than undercounting the graph.
  assert.doesNotMatch(source, /\bimport\s*\(/, `Dynamic import found in ${file}; update bundle audit`)
  const pattern = /\b(?:from\s*|import\s*)(['"])(\.[^'"\n]+)\1/g
  for (const match of source.matchAll(pattern)) {
    const dep = resolve(dirname(file), match[2])
    assert.ok(dep.startsWith(dist + sep), `Unexpected external/escaped ESM import in ${file}`)
    assert.ok(dep.endsWith('.js'), `Unexpected ESM dependency extension ${match[2]}`)
    result.push(dep)
    dependencies(dep)
  }
  return result
}
function reachable(entry, result = new Set()) {
  if (result.has(entry)) return result
  result.add(entry)
  for (const dep of dependencies(entry)) reachable(dep,result)
  return result
}
function size(files) {
  const bytes = [...files].map(file => readFileSync(file))
  return { raw:bytes.reduce((sum,x)=>sum+x.length,0),
    // Sum per-module gzip sizes; not the compression size of a final browser bundle.
    gzip:bytes.reduce((sum,x)=>sum+gzipSync(x).length,0) }
}

const entries = []
for (const [key,conditions] of exports) {
  const target = conditions?.import?.default
  assert.ok(typeof target === 'string' && target.startsWith('./dist/') && target.endsWith('.js'),
    `No ESM export for ${key}`)
  const file = resolve(root,target)
  const modules = reachable(file)
  entries.push({name:key, file,modules,...size(modules)})
}
const core = entries.find(x=>x.name==='.')
assert.ok(core,'Missing core entry')
for (const feature of entries.filter(x=>x!==core)) {
  assert.ok(!core.modules.has(feature.file), `Core entry imports optional entry ${feature.name}`)
}
const coreText = [...core.modules].map(file=>readFileSync(file,'utf8')).join('\n')
for (const api of ['decodePixels','verifyQRPayload','toLogoPNG','toStyledPNG','qryptStructuredAppend']) {
  assert.ok(!new RegExp(`\\b${api}\\b`).test(coreText), `Optional ${api} was included in core ESM dependency graph`)
}
console.log('M20 built ESM reachability (includes shared chunks; not final consumer tree-shaken size):')
for (const item of entries) {
  console.log(`  ${item.name.padEnd(11)} ${String(item.modules.size).padStart(2)} files  ${String(item.raw).padStart(7)} bytes raw  ${String(item.gzip).padStart(6)} bytes per-file gzip`)
}
console.log(`Verified ${entries.length} ESM entries, ${graphs.size} unique JS chunks, and optional-feature isolation from the core.`)
