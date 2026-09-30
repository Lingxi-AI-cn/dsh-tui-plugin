import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tuiVersion = '0.1.12-rc.2'
const dshVersion = '0.1.7-rc.2'
const repository = 'git+https://github.com/Lingxi-AI-cn/dsh-tui-plugin.git'
const packages = [
  'packages/boot/profile-plugin-manager',
  'packages/llm/llm-openai-codex',
  'packages/interaction/plugin-hub',
  'packages/host/session-export',
  'packages/interaction/plugin-hub-local',
  'packages/ui/tui',
  'packages/bundle/tui-app',
]
const externalVersions = new Map([
  ['@deepseek-ai/cordis', '4.0.4'],
  ['@deepseek-ai/cordis-plugin-loader', '1.0.5'],
  ['@deepseek-ai/cordis-plugin-include', '1.0.9'],
  ['@deepseek-ai/schemastery', '3.18.4'],
  ['@earendil-works/pi-ai', '0.85.1'],
])
const violations = []

const dshPrerelease = dshVersion.split('-', 2)[1]
const tuiPrerelease = tuiVersion.split('-', 2)[1]
if (dshPrerelease !== tuiPrerelease) {
  violations.push(`TUI version ${tuiVersion} must end with official DSH suffix ${dshPrerelease ?? '(none)'}`)
}

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'lib', 'artifacts'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    const rel = relative(root, path).replaceAll('\\', '/')
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      violations.push(`${rel}: symbolic links are not allowed in the public source export`)
      continue
    }
    if (entry.isDirectory()) visit(path)
    else inspect(rel, readFileSync(path, 'utf8'))
  }
}

function inspect(path, content) {
  const forbidden = [
    [['/Us', 'ers/'].join(''), 'absolute macOS user path'],
    [['/Workspace', '/Projects/'].join(''), 'private workspace path'],
    [['downstream', '-tui/'].join(''), 'private maintenance control plane'],
    [['github', '-downstream'].join(''), 'private downstream remote'],
    [['backup', '/tui'].join(''), 'private backup branch'],
    [['UPSTREAM', '_BASE='].join(''), 'private synchronization state'],
    [['VERIFIED', '_TIP='].join(''), 'private synchronization state'],
    [['-----BEGIN PRIVATE', ' KEY-----'].join(''), 'private key material'],
    [['@redshell', '-ai/'].join(''), 'retired npm scope'],
  ]
  for (const [needle, label] of forbidden) {
    if (content.includes(needle)) violations.push(`${path}: contains ${label}`)
  }
  if (/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})\b/u.test(content)) {
    violations.push(`${path}: resembles an access token`)
  }
  if (/^\.env(?:\.|$)/u.test(path.split('/').at(-1) ?? '')) violations.push(`${path}: environment file is not allowed`)
}

visit(root)

for (const directory of packages) {
  const path = join(root, directory, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (manifest.version !== tuiVersion) violations.push(`${directory}: version must be ${tuiVersion}`)
  if (!manifest.name?.startsWith('@lingxi-ai-cn/dsh-')) violations.push(`${directory}: package is outside @lingxi-ai-cn`)
  if (manifest.publishConfig?.access !== 'public') violations.push(`${directory}: package must publish publicly`)
  if (manifest.repository?.url !== repository) violations.push(`${directory}: repository URL is not the public repository`)
  if (manifest.scripts !== undefined || manifest.bin !== undefined) violations.push(`${directory}: published package exposes scripts or a bin`)
  if ((manifest.files ?? []).some((entry) => entry.startsWith('src/') || entry.endsWith('.map'))) {
    violations.push(`${directory}: published payload includes source or source maps`)
  }
  for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.devDependencies })) {
    if (name.startsWith('@lingxi-ai-cn/dsh-') && spec !== 'workspace:*') {
      violations.push(`${directory}: ${name} must use workspace:* in public source`)
    }
    if (name.startsWith('@deepseek-ai/')) {
      const expected = externalVersions.get(name) ?? dshVersion
      if (spec !== expected) violations.push(`${directory}: ${name} must be pinned to ${expected}`)
    }
    if (externalVersions.has(name) && spec !== externalVersions.get(name)) {
      violations.push(`${directory}: ${name} must be pinned to ${externalVersions.get(name)}`)
    }
  }
}

try {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim()
  const normalizedRemote = remote
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/\.git$/u, '')
  if (normalizedRemote !== 'https://github.com/Lingxi-AI-cn/dsh-tui-plugin') {
    violations.push(`origin points to ${remote}`)
  }
} catch {
  violations.push('public repository has no readable origin remote')
}

if (violations.length > 0) {
  process.stderr.write(`verify-public-source: ${violations.length} violation(s)\n${violations.map(value => `- ${value}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`verify-public-source: ${packages.length} package source trees passed\n`)
}
