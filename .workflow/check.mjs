#!/usr/bin/env node
/**
 * Run a legacy/independent QR conformance check without leaving .m*-check/
 * compiler output in the repository. Vitest is the main unit-test runner;
 * these checks preserve the additional independent Node/Python suites.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tscModule = resolve(root, 'node_modules/typescript/bin/tsc')

const stages = {
  foundation: ['foundation', 'foundation'],
  encoding: ['m2', 'encoding'],
  ecc: ['m3', 'ecc'],
  matrix: ['m4', 'matrix'],
  decode: ['m4', 'matrix', 'verify-independent-decode.py'],
  svg: ['m5', 'svg'],
  'svg-decode': ['m5', 'svg', 'verify-svg-render.py'],
  png: ['m6', 'png'],
  'png-decode': ['m6', 'png', 'verify-png-render.py'],
  'eci-zbar': ['m6', 'png', 'verify-eci-zbar.py'],
  conformance: ['m7', 'conformance'],
  'conformance-reference': ['m7', 'conformance', 'verify-conformance.py'],
  'conformance-reference-full': ['m7', 'conformance', 'verify-conformance.py', '--full'],
  payloads: ['m10', 'payloads'],
  pixels: ['m11', 'pixels'],
  'pixels-decode': ['m11', 'pixels', 'verify-rgba-png.py'],
  'secure-basic': ['m12', 'secure'],
  'secure-trust': ['m13', 'secure-trust'],
  styled: ['m14', 'styled'],
  'styled-decode': ['m14', 'styled', 'verify-styled-render.py'],
  logo: ['m15', 'logo'],
  'logo-decode': ['m15', 'logo', 'verify-logo-render.py'],
  'matrix-decoding': ['m16', 'decode'],
  'matrix-decoding-reference': ['m16', 'decode', 'verify-matrix-decoder-reference.py'],
  'image-decoding': ['m17', 'image'],
  'image-decoding-reference': ['m17', 'image', 'verify-image-decoder-reference.py'],
  advanced: ['m18', 'advanced'],
  'advanced-reference': ['m18', 'advanced', 'verify-advanced-reference.py'],
  hardening: ['m19', 'hardening'],
  benchmark: ['m19', null, null, null, 'benchmark-qr.mjs'],
  reliability: ['m20', 'reliability'],
  'reliability-reference': ['m20', 'reliability', 'verify-reliability-images.py'],
}

const selection = process.argv[2]
if (selection === '--help' || selection === '--list' || !selection) {
  console.log('Usage: node .workflow/check.mjs <profile>')
  console.log('Profiles: ' + [...Object.keys(stages), 'secure'].join(', '))
  process.exitCode = selection ? 0 : 2
} else {
  function exec(file, args) {
    const label = [file, ...args].join(' ')
    console.log(`\n> ${label}`)
    const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', shell: false })
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
    if (result.status !== 0) throw new Error(`${label}: exit ${result.status ?? 'unknown'}`)
  }
  function python(file, extra) {
    const args = [`scripts/${file}`, ...extra]
    const binaries = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']
    for (const binary of binaries) {
      const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit', shell: false })
      if (result.error?.code === 'ENOENT') continue
      if (result.error) throw result.error
      if (result.status !== 0) throw new Error(`${binary} ${args.join(' ')}: exit ${result.status}`)
      return
    }
    throw new Error('Python was not found. Install Python to run optional reference checks.')
  }
  function stage(profile) {
    const [dirName, nodeTest, pythonScript, pythonFlag, nodeScript] = stages[profile]
    const output = `.${dirName}-check`
    const outputPath = resolve(root, output)
    if (existsSync(outputPath)) {
      throw new Error(`Stale ${output}/ exists. Run npm run clean:checks before starting ${profile}.`)
    }
    try {
      const compilerArgs = ['-p', 'tsconfig.json', '--noEmit', 'false', '--outDir', output]
      if (existsSync(tscModule)) exec(process.execPath, [tscModule, ...compilerArgs])
      else exec(process.platform === 'win32' ? 'tsc.cmd' : 'tsc', compilerArgs)
      if (nodeTest) exec(process.execPath, ['--test', `test/${nodeTest}.node.test.mjs`])
      if (nodeScript) exec(process.execPath, [`scripts/${nodeScript}`])
      if (pythonScript) python(pythonScript, pythonFlag ? [pythonFlag] : [])
    } finally {
      // Generated JS and declaration artifacts are never a source-of-truth.
      rmSync(outputPath, { recursive: true, force: true })
    }
  }
  try {
    if (selection === 'secure') {
      stage('secure-basic')
      stage('secure-trust')
    } else if (Object.hasOwn(stages, selection)) {
      stage(selection)
    } else {
      throw new Error(`Unknown profile ${selection}. Run --list for supported checks.`)
    }
    console.log(`\nCheck '${selection}' passed; temporary compiler files removed.`)
  } catch (error) {
    console.error(`\nCheck '${selection}' failed: ${error.message}`)
    process.exitCode = 1
  }
}
