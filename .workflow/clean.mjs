#!/usr/bin/env node
/** Remove old milestone compiler output left by pre-cleanup npm scripts. */
import { readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dryRun = process.argv.includes('--dry-run')
if (process.argv.slice(2).some(arg => arg !== '--dry-run')) {
  console.error('Usage: node .workflow/clean.mjs [--dry-run]')
  process.exitCode = 2
} else {
  const names = readdirSync(root).filter(name => /^\.(?:foundation|m\d+)-check$/.test(name))
  for (const name of names) {
    console.log(`${dryRun ? 'Would remove' : 'Removing'} ${name}/`)
    if (!dryRun) rmSync(resolve(root, name), { recursive: true, force: true })
  }
  console.log(`${names.length} generated check folder(s) ${dryRun ? 'found' : 'removed'}. No source, tests, or .internal files touched.`)
}
