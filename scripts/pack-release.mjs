import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { payloadDigest } from './release-payload.mjs'

const root = resolve(import.meta.dirname, '..')
const artifacts = join(root, 'artifacts')
const packageDirectories = [
  'packages/boot/profile-plugin-manager',
  'packages/llm/llm-openai-codex',
  'packages/interaction/plugin-hub',
  'packages/host/session-export',
  'packages/interaction/plugin-hub-local',
  'packages/ui/tui',
  'packages/bundle/tui-app',
]

// Release archives must never inherit declarations or bundles left behind by
// an earlier source layout.  A regular incremental build can consider its
// tsbuildinfo current even after an obsolete file remains in lib/, so clear the
// exported package outputs and force TypeScript to emit them again before pack.
for (const directory of packageDirectories) {
  rmSync(join(root, directory, 'lib'), { recursive: true, force: true })
}
execFileSync('pnpm', ['exec', 'tsc', '-b', '--force'], { cwd: root, stdio: 'inherit' })
execFileSync('pnpm', ['exec', 'tsdown'], { cwd: root, stdio: 'inherit' })

rmSync(artifacts, { recursive: true, force: true })
mkdirSync(artifacts, { recursive: true })
const releases = []
for (const directory of packageDirectories) {
  const before = new Set(readdirSync(artifacts))
  execFileSync('pnpm', ['pack', '--pack-destination', artifacts], {
    cwd: join(root, directory),
    stdio: 'inherit',
  })
  const filename = readdirSync(artifacts).find(entry => entry.endsWith('.tgz') && !before.has(entry))
  if (filename === undefined) throw new Error(`${directory} produced no tarball`)
  const tarball = join(artifacts, filename)
  const bytes = readFileSync(tarball)
  const manifest = JSON.parse(execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }))
  releases.push({
    name: manifest.name,
    version: manifest.version,
    file: basename(tarball),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    sha512: createHash('sha512').update(bytes).digest('hex'),
    payloadSha512: payloadDigest(tarball),
  })
}
writeFileSync(join(artifacts, 'release-manifest.json'), `${JSON.stringify({
  format: 1,
  deepSeekHarness: '0.1.2-rc.1',
  packages: releases,
}, null, 2)}\n`)
writeFileSync(join(artifacts, 'SHA512SUMS'), `${releases.map(entry => `${entry.sha512}  ${entry.file}`).join('\n')}\n`)
process.stdout.write(`pack-release: wrote ${releases.length} audited tarballs to ${artifacts}\n`)
