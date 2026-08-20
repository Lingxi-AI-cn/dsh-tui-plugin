import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const artifacts = join(root, 'artifacts')
const packageDirectories = [
  'packages/boot/profile-plugin-manager',
  'packages/interaction/plugin-hub',
  'packages/host/session-export',
  'packages/interaction/plugin-hub-local',
  'packages/ui/tui',
  'packages/bundle/tui-app',
]

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]))
}

function payloadDigest(tarball) {
  const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .split('\n')
    .filter(entry => entry !== '' && !entry.endsWith('/'))
    .sort()
  const hash = createHash('sha512')
  for (const file of files) {
    let bytes = execFileSync('tar', ['-xOzf', tarball, file])
    if (file === 'package/package.json') {
      const manifest = JSON.parse(bytes.toString('utf8'))
      delete manifest.gitHead
      bytes = Buffer.from(`${JSON.stringify(stableJson(manifest))}\n`)
    }
    hash.update(`${file}\0${bytes.byteLength}\0`)
    hash.update(bytes)
  }
  return hash.digest('hex')
}

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
  deepSeekHarness: '0.1.0-rc.8',
  packages: releases,
}, null, 2)}\n`)
writeFileSync(join(artifacts, 'SHA512SUMS'), `${releases.map(entry => `${entry.sha512}  ${entry.file}`).join('\n')}\n`)
process.stdout.write(`pack-release: wrote ${releases.length} audited tarballs to ${artifacts}\n`)
