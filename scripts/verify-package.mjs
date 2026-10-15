/** Validate the actual packed tarball, then install and exercise it as a consumer. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}).\n${result.stdout ?? ''}${result.stderr ?? ''}`)
  }
  return result.stdout.trim()
}

function checkManifest() {
  assert.equal(manifest.name, '@blcklab/qrypt')
  assert.equal(typeof manifest.private, 'boolean', 'Explicitly set package publishing status')
  assert.equal(manifest.sideEffects, false)
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'Core must have zero runtime dependencies')
  assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}), [], 'No framework peer dependencies are allowed')
  assert.deepEqual(Object.keys(manifest.optionalDependencies ?? {}), [], 'No optional runtime dependencies are allowed')
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './png'])
  assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE'])
  const expected = new Set([
    manifest.main,
    manifest.module,
    manifest.types,
    manifest.exports['.'].import.types,
    manifest.exports['.'].import.default,
    manifest.exports['.'].require.types,
    manifest.exports['.'].require.default,
    manifest.exports['./png'].import.types,
    manifest.exports['./png'].import.default,
    manifest.exports['./png'].require.types,
    manifest.exports['./png'].require.default,
  ])
  for (const target of expected) {
    assert.match(target, /^\.\/dist\/[\w.-]+$/, `Invalid export path: ${target}`)
    const location = resolve(root, target)
    assert.ok(existsSync(location), `Missing production build output: ${target}. Run npm run build first.`)
    assert.ok(statSync(location).size > 0, `Empty production build output: ${target}`)
  }
  return expected
}

const temp = mkdtempSync(join(tmpdir(), 'qrypt-package-'))
try {
  const required = checkManifest()
  const packInfo = JSON.parse(run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root))
  assert.equal(packInfo.length, 1, 'Expected one npm tarball')
  const item = packInfo[0]
  assert.equal(item.name, manifest.name)
  assert.equal(item.version, manifest.version)
  const entries = new Set(item.files.map(file => file.path))
  for (const filename of ['package.json', 'README.md', 'LICENSE']) {
    assert.ok(entries.has(filename), `Missing from npm tarball: ${filename}`)
  }
  for (const target of required) {
    assert.ok(entries.has(target.slice(2)), `Export not present in npm tarball: ${target}`)
  }
  for (const filename of entries) {
    const allowed = ['package.json', 'README.md', 'LICENSE'].includes(filename) || (filename.startsWith('dist/') && !filename.split('/').includes('..') && /\.(?:js|mjs|cjs|ts|cts|mts|map)$/.test(filename))
    assert.ok(allowed, `Unexpected file in package: ${filename}`)
    assert.ok(!/\.(?:env|pem|key)$/.test(filename), `Sensitive file in package: ${filename}`)
  }
  const tarball = join(temp, item.filename)
  assert.ok(existsSync(tarball), 'npm pack did not create the reported tarball')

  const consumer = join(temp, 'consumer')
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'package.json'), '{"name":"qrypt-distribution-consumer","private":true,"type":"module"}\n')
  // Install from tarball in offline mode: this must not fetch anything from the registry.
  run(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], consumer)
  const jsTest = `import assert from 'node:assert/strict';\nimport { qrypt, toSVG } from '@blcklab/qrypt';\nimport { toPNG } from '@blcklab/qrypt/png';\nconst qr = qrypt('Hello, Qrypt!');\nassert.equal(qr.size, qr.version * 4 + 17);\nassert.equal(qr.matrix().length, qr.size);\nassert.match(toSVG(qr), /<svg/);\nassert.deepEqual([...toPNG(qr).subarray(0, 8)], [137,80,78,71,13,10,26,10]);\nassert.equal((await import('@blcklab/qrypt')).toPNG, undefined);\n`
  const cjsTest = `const assert = require('node:assert/strict');\nconst { qrypt, toSVG } = require('@blcklab/qrypt');\nconst { toPNG } = require('@blcklab/qrypt/png');\nconst qr = qrypt('Hello, Qrypt!');\nassert.equal(qr.size, qr.version * 4 + 17);\nassert.match(toSVG(qr), /<svg/);\nassert.deepEqual([...toPNG(qr).subarray(0, 8)], [137,80,78,71,13,10,26,10]);\nassert.equal(require('@blcklab/qrypt').toPNG, undefined);\n`
  writeFileSync(join(consumer, 'esm.mjs'), jsTest)
  writeFileSync(join(consumer, 'cjs.cjs'), cjsTest)
  run(process.execPath, ['esm.mjs'], consumer)
  run(process.execPath, ['cjs.cjs'], consumer)

  // Check ESM and CommonJS declarations using the actual consumer's installed package.
  const typeScriptCLI = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  assert.ok(existsSync(typeScriptCLI), 'Local TypeScript compiler unavailable; run npm install before checking consumers')
  writeFileSync(join(consumer, 'consumer.mts'), `import { qrypt, toSVG, type QryptOptions } from '@blcklab/qrypt';\nimport { toPNG, type PNGOptions } from '@blcklab/qrypt/png';\nconst options: QryptOptions = { errorCorrectionLevel: 'H', version: 'auto' };\nconst qr = qrypt('typecheck', options);\nconst size: number = qr.size;\nconst mask: number = qr.mask;\nconst svg: string = toSVG(qr);\nconst pngOptions: PNGOptions = { margin: 4, scale: 8 };\nconst png: Uint8Array = toPNG(qr, pngOptions);\nvoid [size, mask, svg, png];\n`)
  writeFileSync(join(consumer, 'consumer.cts'), `import { qrypt, toSVG, type QryptOptions } from '@blcklab/qrypt';\nimport { toPNG } from '@blcklab/qrypt/png';\nconst options: QryptOptions = { version: 1 };\nconst qr = qrypt('CJS', options);\nconst size: number = qr.size;\nconst svg: string = toSVG(qr);\nconst bytes: Uint8Array = toPNG(qr);\nvoid [size, svg, bytes];\n`)
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    target: 'ES2020', module: 'NodeNext', moduleResolution: 'NodeNext',
    strict: true, noEmit: true, skipLibCheck: false, types: [],
  }, files: ['consumer.mts', 'consumer.cts']}, null, 2))
  run(process.execPath, [typeScriptCLI, '-p', 'tsconfig.json'], consumer)

  console.log(`Verified npm tarball: ${item.filename}`)
  console.log(`Files: ${entries.size}; tarball: ${statSync(tarball).size} bytes`)
  for (const file of readdirSync(join(root, 'dist')).filter(file => /^(index|png)\.(js|cjs)$/.test(file))) {
    const bytes = readFileSync(join(root, 'dist', file))
    console.log(`dist/${file}: ${bytes.length} bytes (${gzipSync(bytes).length} gzip)`)
  }
  console.log('Packed-package ESM, CJS, TypeScript (NodeNext), and isolated PNG imports: PASS')
} catch (error) {
  console.error(`Package verification failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(temp, { recursive: true, force: true })
}
