import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const artifacts = join(root, 'artifacts')
const publish = process.argv.includes('--publish')
const provenance = process.argv.includes('--provenance')
const tagAt = process.argv.indexOf('--tag')
const tag = tagAt === -1 ? 'next' : process.argv[tagAt + 1]
if (tag === undefined || !/^[a-z][a-z0-9._-]*$/u.test(tag)) throw new Error(`invalid npm tag ${String(tag)}`)
const manifestPath = join(artifacts, 'release-manifest.json')
if (!existsSync(manifestPath)) throw new Error('artifacts are missing; run pnpm run pack:release first')
const release = JSON.parse(readFileSync(manifestPath, 'utf8'))
const trustedPublishing = publish && provenance
  && process.env.CI === 'true'
  && process.env.ACTIONS_ID_TOKEN_REQUEST_URL !== undefined
if (publish && !trustedPublishing) {
  const who = execFileSync('npm', ['whoami', '--registry=https://registry.npmjs.org/'], { encoding: 'utf8' }).trim()
  if (who !== 'lingxi-ai-cn') throw new Error(`npm is authenticated as ${who}, expected lingxi-ai-cn`)
}

for (const entry of release.packages) {
  const tarball = join(artifacts, entry.file)
  const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
  if (integrity !== entry.integrity) throw new Error(`${entry.name}: artifact integrity changed after packing`)
  if (publish) {
    const view = spawnSync('npm', ['view', `${entry.name}@${entry.version}`, 'dist.integrity', '--json', '--registry=https://registry.npmjs.org/'], { encoding: 'utf8' })
    if (view.status === 0) {
      const published = JSON.parse(view.stdout)
      if (published !== integrity) throw new Error(`${entry.name}@${entry.version} already exists with different integrity`)
      process.stdout.write(`publish-release: ${entry.name}@${entry.version} already matches; skipped\n`)
      continue
    }
  }
  const args = ['publish', tarball, '--access', 'public', '--tag', tag, '--registry=https://registry.npmjs.org/']
  if (!publish) args.push('--dry-run')
  if (provenance) args.push('--provenance')
  const result = spawnSync('npm', args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${entry.name}@${entry.version} ${publish ? 'publish' : 'dry-run'} failed`)
  process.stdout.write(`publish-release: ${entry.name}@${entry.version} ${publish ? 'published' : 'dry-run passed'}\n`)
}
