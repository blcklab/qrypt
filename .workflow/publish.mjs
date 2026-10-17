#!/usr/bin/env node
/** Explicit, fail-closed npm publication gate. Never auto-flips private:true. */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
process.chdir(root)
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const approval = `${manifest.name}@${manifest.version}`
const args = process.argv.slice(2)
const usage = 'Usage: node .workflow/publish.mjs [--dry-run] | --publish --confirm=@blcklab/qrypt@VERSION'
if (args.includes('--help')) { console.log(usage); process.exit(0) }
const publish = args.includes('--publish')
const allowed = new Set(['--dry-run', '--publish', `--confirm=${approval}`])
if (args.some(arg => !allowed.has(arg)) || (publish && (args.includes('--dry-run') || !args.includes(`--confirm=${approval}`))) || (!publish && args.some(arg => arg.startsWith('--confirm=')))) {
  console.error(usage)
  process.exit(2)
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, params, { capture = false } = {}) {
  console.log(`> ${command} ${params.join(' ')}`)
  const result = spawnSync(command, params, { cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: process.platform === 'win32' })
  if (result.error) { console.error(result.error.message); process.exit(1) }
  if (result.status !== 0) {
    if (capture) console.error(result.stderr?.trim() || result.stdout?.trim() || 'Command failed')
    process.exit(result.status ?? 1)
  }
  return result.stdout?.trim() ?? ''
}
if (manifest.name !== '@blcklab/qrypt' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) {
  console.error('Unexpected npm package identity or version.'); process.exit(1)
}
if (manifest.publishConfig?.access !== 'public') {
  console.error('Scoped npm package must explicitly set publishConfig.access=public.'); process.exit(1)
}
if (publish && manifest.private !== false) {
  console.error('BLOCKED: package.json is private:true. Publication requires separate maintainer approval and an intentional manifest update.')
  process.exit(1)
}
if (!existsSync('package-lock.json')) {
  console.error('Commit a verified package-lock.json before packaging or publishing.'); process.exit(1)
}
const status = run('git', ['status', '--porcelain', '--untracked-files=normal'], { capture: true })
if (status) { console.error('Publish workflow requires a clean Git working tree.'); process.exit(1) }
run(npm, ['run', 'check:release'])
run(npm, ['run', 'test:coverage'])
if (!publish) {
  console.log(`\nDry run complete for ${approval}. No package was published.`)
  console.log('Publishing requires maintainer approval, private:false, reviewed release version and --publish --confirm=...')
  process.exit(0)
}
if (process.env.QRYPT_PUBLISH_APPROVED !== 'yes') {
  console.error('BLOCKED: QRYPT_PUBLISH_APPROVED=yes is required for publication.'); process.exit(1)
}
// A human-authorized, explicit npm command only. No tag creation, git push or version mutation.
run(npm, ['publish', '--access', 'public', '--tag', 'next'])
console.log(`Published ${approval} to npm with dist-tag next. Review the npm release before changing the latest tag.`)
