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
  assert.ok(manifest.private === undefined || typeof manifest.private === 'boolean', 'private must be a boolean when set')
  assert.equal(manifest.sideEffects, false)
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'Core must have zero runtime dependencies')
  assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}), [], 'No framework peer dependencies are allowed')
  assert.deepEqual(Object.keys(manifest.optionalDependencies ?? {}), [], 'No optional runtime dependencies are allowed')
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './advanced', './decode', './logo', './payloads', './png', './render', './secure', './styled'])
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
    manifest.exports['./payloads'].import.types,
    manifest.exports['./payloads'].import.default,
    manifest.exports['./payloads'].require.types,
    manifest.exports['./payloads'].require.default,
    manifest.exports['./render'].import.types,
    manifest.exports['./render'].import.default,
    manifest.exports['./render'].require.types,
    manifest.exports['./render'].require.default,
    manifest.exports['./secure'].import.types,
    manifest.exports['./secure'].import.default,
    manifest.exports['./secure'].require.types,
    manifest.exports['./secure'].require.default,
    manifest.exports['./styled'].import.types,
    manifest.exports['./styled'].import.default,
    manifest.exports['./styled'].require.types,
    manifest.exports['./styled'].require.default,
    manifest.exports['./logo'].import.types,
    manifest.exports['./logo'].import.default,
    manifest.exports['./logo'].require.types,
    manifest.exports['./logo'].require.default,
    manifest.exports['./advanced'].import.types,
    manifest.exports['./advanced'].import.default,
    manifest.exports['./advanced'].require.types,
    manifest.exports['./advanced'].require.default,
    manifest.exports['./decode'].import.types,
    manifest.exports['./decode'].import.default,
    manifest.exports['./decode'].require.types,
    manifest.exports['./decode'].require.default,
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
    const allowed = ['package.json', 'README.md', 'LICENSE'].includes(filename) || (filename.startsWith('dist/') && !filename.split('/').includes('..') && /\.(?:js|mjs|cjs|ts|cts|mts|map)$/.test(filename)) || (filename.startsWith('docs/') && !filename.split('/').includes('..') && /^[A-Za-z0-9-]+\.md$/.test(filename.slice(5)))
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
  const jsTest = `import assert from 'node:assert/strict';\nimport { qrypt, toSVG } from '@blcklab/qrypt';\nimport { toPNG, toPNGDataURL } from '@blcklab/qrypt/png';\nimport { wifi } from '@blcklab/qrypt/payloads';\nimport { toPixels } from '@blcklab/qrypt/render';\nimport { signQRPayload, verifyQRPayload, secureRedemptionKey } from '@blcklab/qrypt/secure';\nimport { toStyledSVG, toStyledPNG, toStyledPixels } from '@blcklab/qrypt/styled';\nimport { toLogoSVG, toLogoPNG, toLogoPixels } from '@blcklab/qrypt/logo';\nimport { decodeMatrix, decodePixels, assembleStructuredAppend } from '@blcklab/qrypt/decode';\nimport { qryptBytes, qryptKanji, qryptGS1, qryptStructuredAppend } from '@blcklab/qrypt/advanced';\nassert.equal(wifi({ssid:'QA', security:'nopass'}), 'WIFI:T:nopass;S:QA;;');\nconst qr = qrypt('Hello, Qrypt!');\nassert.equal(qr.size, qr.version * 4 + 17);\nassert.deepEqual([...decodeMatrix(qryptBytes(new Uint8Array([0,255])).matrix()).bytes], [0,255]);\nassert.equal(decodeMatrix(qryptGS1('0101234567890123').matrix()).fnc1,'gs1');\nassert.equal(decodeMatrix(qryptKanji(new Uint8Array([0x89,0xd7])).matrix()).text,'荷');\nassert.equal(assembleStructuredAppend(qryptStructuredAppend([new Uint8Array([1]),new Uint8Array([2])]).map(q=>decodeMatrix(q.matrix()))).length,2);\nassert.equal(decodeMatrix(qr.matrix()).text, 'Hello, Qrypt!');\nassert.equal(decodePixels(toPixels(qr,{scale:8}))?.text, 'Hello, Qrypt!');\nassert.equal(qr.matrix().length, qr.size);\nassert.match(toSVG(qr), /<svg/);\nassert.deepEqual([...toPNG(qr).subarray(0, 8)], [137,80,78,71,13,10,26,10]);\nassert.equal(toPixels(qr, {scale:1}).width, qr.size + 8);\nassert.ok(toPNGDataURL(qr).startsWith('data:image/png;base64,'));\nassert.equal(typeof signQRPayload, 'function');\nassert.equal(typeof verifyQRPayload, 'function');
assert.equal(typeof secureRedemptionKey, 'function');\nassert.match(toStyledSVG(qr, { moduleShape:'dot' }), /<svg/);\nassert.equal(toStyledPNG(qr)[25], 6);\nassert.equal(toStyledPixels(qr).width, (qr.size + 8) * 8);\nconst logo = {width:1,height:1,data:new Uint8Array([0,0,0,255])};\nconst hqr = qrypt('Hello', {errorCorrectionLevel:'H'});\nassert.ok(toLogoSVG(hqr,logo).includes('data:image/png;base64,'));\nassert.equal(toLogoPNG(hqr,logo)[25],6);\nassert.equal(toLogoPixels(hqr,logo).width,hqr.size*8+64);\nassert.equal((await import('@blcklab/qrypt')).toPNG, undefined);\n`
  const cjsTest = `const assert = require('node:assert/strict');\nconst { qrypt, toSVG } = require('@blcklab/qrypt');\nconst { toPNG, toPNGDataURL } = require('@blcklab/qrypt/png');\nconst { wifi } = require('@blcklab/qrypt/payloads');\nconst { toPixels } = require('@blcklab/qrypt/render');\nconst { signQRPayload, verifyQRPayload, secureRedemptionKey } = require('@blcklab/qrypt/secure');\nconst { toStyledSVG, toStyledPNG, toStyledPixels } = require('@blcklab/qrypt/styled');\nconst { toLogoSVG, toLogoPNG, toLogoPixels } = require('@blcklab/qrypt/logo');\nconst { decodeMatrix, decodePixels, assembleStructuredAppend } = require('@blcklab/qrypt/decode');\nconst { qryptBytes, qryptKanji, qryptGS1, qryptStructuredAppend } = require('@blcklab/qrypt/advanced');\nassert.equal(wifi({ssid:'QA', security:'nopass'}), 'WIFI:T:nopass;S:QA;;');\nconst qr = qrypt('Hello, Qrypt!');\nassert.equal(qr.size, qr.version * 4 + 17);\nassert.deepEqual([...decodeMatrix(qryptBytes(new Uint8Array([0,255])).matrix()).bytes], [0,255]);\nassert.equal(decodeMatrix(qryptGS1('0101234567890123').matrix()).fnc1,'gs1');\nassert.equal(decodeMatrix(qryptKanji(new Uint8Array([0x89,0xd7])).matrix()).text,'荷');\nassert.equal(assembleStructuredAppend(qryptStructuredAppend([new Uint8Array([1]),new Uint8Array([2])]).map(q=>decodeMatrix(q.matrix()))).length,2);\nassert.equal(decodeMatrix(qr.matrix()).text, 'Hello, Qrypt!');\nassert.equal(decodePixels(toPixels(qr,{scale:8}))?.text, 'Hello, Qrypt!');\nassert.match(toSVG(qr), /<svg/);\nassert.deepEqual([...toPNG(qr).subarray(0, 8)], [137,80,78,71,13,10,26,10]);\nassert.equal(toPixels(qr, {scale:1}).width, qr.size + 8);\nassert.ok(toPNGDataURL(qr).startsWith('data:image/png;base64,'));\nassert.equal(typeof signQRPayload, 'function');\nassert.equal(typeof verifyQRPayload, 'function');
assert.equal(typeof secureRedemptionKey, 'function');\nassert.match(toStyledSVG(qr, { moduleShape:'dot' }), /<svg/);\nassert.equal(toStyledPNG(qr)[25], 6);\nassert.equal(toStyledPixels(qr).width, (qr.size + 8) * 8);\nconst logo = {width:1,height:1,data:new Uint8Array([0,0,0,255])};\nconst hqr = qrypt('Hello', {errorCorrectionLevel:'H'});\nassert.ok(toLogoSVG(hqr,logo).includes('data:image/png;base64,'));\nassert.equal(toLogoPNG(hqr,logo)[25],6);\nassert.equal(toLogoPixels(hqr,logo).width,hqr.size*8+64);\nassert.equal(require('@blcklab/qrypt').toPNG, undefined);\n`
  writeFileSync(join(consumer, 'esm.mjs'), jsTest)
  writeFileSync(join(consumer, 'cjs.cjs'), cjsTest)
  run(process.execPath, ['esm.mjs'], consumer)
  run(process.execPath, ['cjs.cjs'], consumer)

  // Check ESM and CommonJS declarations using the actual consumer's installed package.
  const typeScriptCLI = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  assert.ok(existsSync(typeScriptCLI), 'Local TypeScript compiler unavailable; run npm install before checking consumers')
  writeFileSync(join(consumer, 'consumer.mts'), `import { qrypt, toSVG, type QryptOptions } from '@blcklab/qrypt';\nimport { toPNG, toPNGDataURL, type PNGOptions } from '@blcklab/qrypt/png';\nimport { toPixels, type PixelOptions } from '@blcklab/qrypt/render';\nimport { wifi, type WifiPayload } from '@blcklab/qrypt/payloads';\nimport { signQRPayload, verifyQRPayload, secureRedemptionKey, type SecureQRClaims } from '@blcklab/qrypt/secure';\nimport { toStyledSVG, toStyledPNG, toStyledPixels, type StyledOptions } from '@blcklab/qrypt/styled';\nimport { toLogoSVG, toLogoPNG, toLogoPixels, type LogoOptions, type LogoImage } from '@blcklab/qrypt/logo';\nimport { decodeMatrix, decodePixels, assembleStructuredAppend, type DecodedQR } from '@blcklab/qrypt/decode';\nimport { qryptBytes, qryptKanji, qryptGS1, qryptStructuredAppend } from '@blcklab/qrypt/advanced';\nvoid [signQRPayload, verifyQRPayload, secureRedemptionKey];\nconst initialClaims: SecureQRClaims | null = null;\nvoid initialClaims;\nconst wifiOptions: WifiPayload = { ssid: 'QA', security: 'nopass' };\nconst wifiText: string = wifi(wifiOptions);\nvoid wifiText;\nconst options: QryptOptions = { errorCorrectionLevel: 'H', version: 'auto' };\nconst qr = qrypt('typecheck', options);\nconst decoded: DecodedQR = decodeMatrix(qr.matrix());\nvoid [qryptBytes(new Uint8Array([1])),qryptKanji(new Uint8Array([0x89,0xd7])),qryptGS1('123'),qryptStructuredAppend,assembleStructuredAppend];\nvoid decodePixels(toPixels(qr,{scale:8}));\nvoid decoded;\nconst size: number = qr.size;\nconst mask: number = qr.mask;\nconst svg: string = toSVG(qr);\nconst pngOptions: PNGOptions = { margin: 4, scale: 8 };\nconst png: Uint8Array = toPNG(qr, pngOptions);\nconst pixels = toPixels(qr, { lightAlpha: 0 } satisfies PixelOptions);\nconst styledOptions: StyledOptions = { moduleShape: 'rounded', finderStyle: 'square' };\nconst styledPNG: Uint8Array = toStyledPNG(qr, styledOptions);\nconst styledSVG: string = toStyledSVG(qr, styledOptions);\nconst styledPixels = toStyledPixels(qr, styledOptions);\nconst img: LogoImage={width:1,height:1,data:new Uint8Array([0,0,0,255])};\nconst logoOptions: LogoOptions={logoSize:3};\nvoid [toLogoSVG(qrypt('Hi', {errorCorrectionLevel:'H'}),img,logoOptions),toLogoPNG,toLogoPixels];\nvoid [styledPNG, styledSVG, styledPixels];\nconst url: string = toPNGDataURL(qr, pngOptions);\nvoid [pixels, url];\nvoid [size, mask, svg, png];\n`)
  writeFileSync(join(consumer, 'consumer.cts'), `import { qrypt, toSVG, type QryptOptions } from '@blcklab/qrypt';\nimport { toPNG, toPNGDataURL } from '@blcklab/qrypt/png';\nimport { toPixels } from '@blcklab/qrypt/render';\nimport { vcard } from '@blcklab/qrypt/payloads';\nimport { signQRPayload, verifyQRPayload, secureRedemptionKey } from '@blcklab/qrypt/secure';\nimport { toStyledSVG, toStyledPNG, toStyledPixels } from '@blcklab/qrypt/styled';\nimport { toLogoSVG, toLogoPNG, toLogoPixels } from '@blcklab/qrypt/logo';\nimport { decodeMatrix, decodePixels, assembleStructuredAppend } from '@blcklab/qrypt/decode';\nimport { qryptBytes, qryptKanji, qryptGS1, qryptStructuredAppend } from '@blcklab/qrypt/advanced';\nvoid [signQRPayload, verifyQRPayload, secureRedemptionKey];\nconst card: string = vcard({ fullName: 'QA' });\nvoid card;\nconst options: QryptOptions = { version: 1 };\nconst qr = qrypt('CJS', options);\nvoid decodeMatrix(qr.matrix());\nvoid [qryptBytes(new Uint8Array([1])),qryptKanji(new Uint8Array([0x89,0xd7])),qryptGS1('123'),qryptStructuredAppend,assembleStructuredAppend];\nvoid decodePixels(toPixels(qr,{scale:8}));\nconst size: number = qr.size;\nconst svg: string = toSVG(qr);\nconst bytes: Uint8Array = toPNG(qr);\nconst pixels = toPixels(qr);\nvoid [toStyledSVG(qr), toStyledPNG(qr), toStyledPixels(qr)];\nvoid [toLogoSVG, toLogoPNG, toLogoPixels];\nvoid pixels;\nvoid [size, svg, bytes];\n`)
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    target: 'ES2020', module: 'NodeNext', moduleResolution: 'NodeNext',
    strict: true, noEmit: true, skipLibCheck: false, types: [],
  }, files: ['consumer.mts', 'consumer.cts']}, null, 2))
  run(process.execPath, [typeScriptCLI, '-p', 'tsconfig.json'], consumer)

  console.log(`Verified npm tarball: ${item.filename}`)
  console.log(`Files: ${entries.size}; tarball: ${statSync(tarball).size} bytes`)
  for (const file of readdirSync(join(root, 'dist')).filter(file => /^(index|png|payloads|render|secure|styled|logo|decode)\.(js|cjs)$/.test(file))) {
    const bytes = readFileSync(join(root, 'dist', file))
    console.log(`dist/${file}: ${bytes.length} bytes (${gzipSync(bytes).length} gzip)`)
  }
  console.log('Packed-package ESM, CJS, TypeScript (NodeNext), and isolated PNG/render/payloads/secure/styled/decode imports: PASS')
} catch (error) {
  console.error(`Package verification failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(temp, { recursive: true, force: true })
}
