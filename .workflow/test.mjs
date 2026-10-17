#!/usr/bin/env node
/** Qrypt local/CI quality workflow; no third-party runtime dependencies. */
import { spawnSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
if ([...args].some(arg => !['--ci', '--full', '--help'].includes(arg))) {
  console.error('Usage: node .workflow/test.mjs [--ci] [--full]')
  process.exit(2)
}
if (args.has('--help')) {
  console.log('Run Qrypt release checks and coverage. --ci performs npm ci first. --full adds Python reference suites (requires Python extras).')
  process.exit(0)
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(...command) {
  console.log(`\n> npm ${command.join(' ')}`)
  const result = spawnSync(npm, command, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) { console.error(result.error.message); process.exit(1) }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
if (args.has('--ci')) run('ci')
run('run', 'check:release') // lockfile, docs, architecture, tests, build, bundle, isolated consumer
run('run', 'test:coverage')
if (args.has('--full')) {
  for (const profile of ['conformance-reference-full', 'matrix-decoding-reference', 'reliability-reference', 'svg-decode', 'png-decode', 'pixels-decode', 'styled-decode', 'logo-decode']) {
    console.log(`\n> node .workflow/check.mjs ${profile}`)
    const result = spawnSync(process.execPath, ['.workflow/check.mjs', profile], { stdio: 'inherit' })
    if (result.error || result.status !== 0) process.exit(result.status ?? 1)
  }
}
console.log('\nQrypt workflow checks passed. Real-device scanning and security review remain manual gates.')
