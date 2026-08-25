import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { payloadDigest } from './release-payload.mjs'

const root = resolve(import.meta.dirname, '..')
const artifacts = join(root, 'artifacts')
const publish = process.argv.includes('--publish')
const audit = process.argv.includes('--audit')
const provenance = process.argv.includes('--provenance')
if (publish && audit) throw new Error('--publish and --audit are mutually exclusive')
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

async function publishedPayloadDigest(url, temporary, filename) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`cannot download published tarball: ${response.status} ${response.statusText}`)
  const path = join(temporary, filename)
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  return payloadDigest(path)
}

const temporary = mkdtempSync(join(tmpdir(), 'dsh-tui-published-audit-'))
try {
  for (const entry of release.packages) {
    const tarball = join(artifacts, entry.file)
    const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
    const localPayload = payloadDigest(tarball)
    if (integrity !== entry.integrity || localPayload !== entry.payloadSha512) {
      throw new Error(`${entry.name}: artifact changed after packing`)
    }
    if (publish || audit) {
      const view = spawnSync('npm', ['view', `${entry.name}@${entry.version}`, 'dist', '--json', '--registry=https://registry.npmjs.org/'], { encoding: 'utf8' })
      if (view.status === 0) {
        const value = JSON.parse(view.stdout)
        const dist = Array.isArray(value) ? value[0] : value
        if (dist?.integrity === integrity) {
          process.stdout.write(`publish-release: ${entry.name}@${entry.version} registry tarball matches\n`)
          if (audit) {
            const tags = JSON.parse(execFileSync('npm', [
              'view', entry.name, 'dist-tags', '--json', '--registry=https://registry.npmjs.org/',
            ], { encoding: 'utf8' }))
            if (tags?.next !== entry.version) {
              throw new Error(`${entry.name}: next dist-tag is ${String(tags?.next)}, expected ${entry.version}`)
            }
            process.stdout.write(`publish-release: ${entry.name} next dist-tag matches ${entry.version}\n`)
          }
          continue
        }
        if (typeof dist?.tarball !== 'string') throw new Error(`${entry.name}@${entry.version} has no published tarball URL`)
        const publishedPayload = await publishedPayloadDigest(dist.tarball, temporary, entry.file)
        if (publishedPayload !== localPayload) {
          throw new Error(`${entry.name}@${entry.version} already exists with different package contents`)
        }
        process.stdout.write(`publish-release: ${entry.name}@${entry.version} registry payload matches\n`)
        if (audit) {
          const tags = JSON.parse(execFileSync('npm', [
            'view', entry.name, 'dist-tags', '--json', '--registry=https://registry.npmjs.org/',
          ], { encoding: 'utf8' }))
          if (tags?.next !== entry.version) {
            throw new Error(`${entry.name}: next dist-tag is ${String(tags?.next)}, expected ${entry.version}`)
          }
          process.stdout.write(`publish-release: ${entry.name} next dist-tag matches ${entry.version}\n`)
        }
        continue
      }
      if (audit) throw new Error(`${entry.name}@${entry.version} is not published`)
    }
    const args = ['publish', tarball, '--access', 'public', '--tag', tag, '--registry=https://registry.npmjs.org/']
    if (!publish) args.push('--dry-run')
    if (provenance) args.push('--provenance')
    const result = spawnSync('npm', args, { cwd: root, stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`${entry.name}@${entry.version} ${publish ? 'publish' : 'dry-run'} failed`)
    process.stdout.write(`publish-release: ${entry.name}@${entry.version} ${publish ? 'published' : 'dry-run passed'}\n`)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
