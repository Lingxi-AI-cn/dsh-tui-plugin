/** Install the packed TUI through an unmodified official DSH release and boot it in a PTY. */

import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TUI_VERSION = '0.1.10-rc.2'
const DSH_VERSION = '0.1.5-rc.2'
const TOP_PACKAGE = '@lingxi-ai-cn/dsh-tui'
const PACKAGE_DIRS = Object.freeze([
  'packages/boot/profile-plugin-manager',
  'packages/llm/llm-openai-codex',
  'packages/interaction/plugin-hub',
  'packages/host/session-export',
  'packages/interaction/plugin-hub-local',
  'packages/ui/tui',
  'packages/bundle/tui-app',
])
const TERMINAL_CAPABILITY_QUERY = '\u001b[c'
const TERMINAL_CAPABILITY_REPLY = '\u001b[?1;2c'
const TERMINAL_BACKGROUND_QUERY = '\u001b]11;?\u0007'
const TERMINAL_BACKGROUND_REPLY = '\u001b]11;rgb:0c0c/0c0c/0c0c\u001b\\'

interface PackedRelease {
  readonly name: string
  readonly manifest: Readonly<Record<string, unknown>>
  readonly tarball: string
  readonly bytes: Buffer
}

interface PtyProcess {
  readonly pid: number
  write(data: string): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
}

interface NodePty {
  spawn(file: string, args: string[], options: {
    cwd: string
    cols: number
    rows: number
    env: Record<string, string>
  }): PtyProcess
}

function fail(message: string): never {
  throw new Error(`verify-tui-plugin-clean-room: ${message}`)
}

function run(file: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, timeout = 180_000): string {
  try {
    return execFileSync(file, [...args], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error: unknown) {
    const output = [
      (error as { stdout?: unknown }).stdout,
      (error as { stderr?: unknown }).stderr,
    ].filter((value): value is string => typeof value === 'string').join('\n')
    fail(`${basename(file)} ${args.join(' ')} failed${output === '' ? '' : `:\n${output.slice(-12_000)}`}`)
  }
}

function runAsync(file: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, timeout = 180_000): Promise<{
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], {
      cwd,
      env,
      encoding: 'utf8',
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ stdout, stderr })
        return
      }
      const output = [stdout, stderr].filter(value => value !== '').join('\n')
      reject(new Error(`verify-tui-plugin-clean-room: ${basename(file)} ${args.join(' ')} failed${output === '' ? '' : `:\n${output.slice(-12_000)}`}`))
    })
  })
}

function packedManifest(tarball: string): Readonly<Record<string, unknown>> {
  return JSON.parse(execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })) as Readonly<Record<string, unknown>>
}

function packFamily(destination: string): readonly PackedRelease[] {
  mkdirSync(destination, { recursive: true })
  return PACKAGE_DIRS.map((directory) => {
    const before = new Set(readdirSync(destination))
    run('pnpm', ['pack', '--pack-destination', destination], join(ROOT, directory), process.env)
    const filename = readdirSync(destination).find(entry => entry.endsWith('.tgz') && !before.has(entry))
    if (filename === undefined) fail(`${directory} produced no tarball`)
    const tarball = join(destination, filename)
    const manifest = packedManifest(tarball)
    if (typeof manifest.name !== 'string') fail(`${directory} packed without a name`)
    return { name: manifest.name, manifest, tarball, bytes: readFileSync(tarball) }
  })
}

function registry(releases: readonly PackedRelease[]): Promise<{ readonly server: Server; readonly origin: string }> {
  const byName = new Map(releases.map(release => [release.name, release]))
  const server = createServer((request, response) => {
    const path = request.url === undefined ? '' : new URL(request.url, 'http://registry.invalid').pathname
    if (request.method === 'POST' || path === '/-/ping') {
      response.setHeader('content-type', 'application/json')
      response.end('{}')
      return
    }
    const tarballName = path.startsWith('/tarballs/') ? decodeURIComponent(path.slice('/tarballs/'.length)) : undefined
    const tarball = tarballName === undefined ? undefined : releases.find(release => basename(release.tarball) === tarballName)
    if (tarball !== undefined) {
      response.setHeader('content-type', 'application/octet-stream')
      response.setHeader('content-length', String(tarball.bytes.byteLength))
      response.end(tarball.bytes)
      return
    }
    let packageName = ''
    try { packageName = decodeURIComponent(path.slice(1)) } catch { packageName = '' }
    const release = byName.get(packageName)
    if (release === undefined) {
      response.statusCode = 404
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ error: 'not_found', path }))
      return
    }
    const address = server.address()
    if (address === null || typeof address === 'string') fail('local Registry address is unavailable')
    const digest = createHash('sha512').update(release.bytes).digest('base64')
    const shasum = createHash('sha1').update(release.bytes).digest('hex')
    const manifest = {
      ...release.manifest,
      dist: {
        tarball: `http://127.0.0.1:${address.port}/tarballs/${encodeURIComponent(basename(release.tarball))}`,
        integrity: `sha512-${digest}`,
        shasum,
      },
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      name: release.name,
      'dist-tags': { latest: TUI_VERSION },
      versions: { [TUI_VERSION]: manifest },
    }))
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (address === null || typeof address === 'string') fail('local Registry did not bind TCP')
      resolve({ server, origin: `http://127.0.0.1:${address.port}` })
    })
  })
}

function treeDigest(root: string): string {
  const hash = createHash('sha256')
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      const name = relative(root, path).replaceAll('\\', '/')
      const stat = lstatSync(path)
      hash.update(`${entry.isDirectory() ? 'd' : entry.isSymbolicLink() ? 'l' : 'f'}:${name}:${stat.mode}\0`)
      if (entry.isDirectory()) visit(path)
      else if (entry.isSymbolicLink()) hash.update(readlinkSync(path))
      else hash.update(readFileSync(path))
    }
  }
  visit(root)
  return hash.digest('hex')
}

function stringEnvironment(extra: Readonly<Record<string, string>>): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    ...extra,
  }
}

async function waitFor(read: () => string, expected: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now()
  while (!read().includes(expected)) {
    if (Date.now() - started >= timeoutMs) fail(`timed out waiting for ${JSON.stringify(expected)}:\n${read().slice(-12_000)}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function bootPty(official: string, dshScript: string, home: string, env: Record<string, string>): Promise<void> {
  const store = join(official, 'node_modules/.pnpm')
  const nodePtyEntry = readdirSync(store).find(entry => entry.startsWith('node-pty@'))
  if (nodePtyEntry === undefined) fail('official installation contains no node-pty package for the clean-room PTY')
  const nodePtyRoot = join(store, nodePtyEntry, 'node_modules/node-pty')
  const requireFromOfficial = createRequire(join(nodePtyRoot, 'package.json'))
  const pty = requireFromOfficial(nodePtyRoot) as NodePty
  writeFileSync(join(home, 'clean-room-path.txt'), 'official rc8 workspace fixture\n')
  // Ink intentionally withholds live frames when CI=true. The PTY is the
  // interactive user boundary under test, so make only its child environment
  // advertise an ordinary terminal while the surrounding workflow stays CI.
  const terminalEnv = { ...env, CI: 'false' }
  const child = pty.spawn(process.execPath, [dshScript, '--profile', 'tui'], {
    cwd: home, cols: 100, rows: 30, env: terminalEnv,
  })
  let output = ''
  let probe = ''
  const data = child.onData((chunk) => {
    output += chunk
    probe += chunk
    while (probe.includes(TERMINAL_CAPABILITY_QUERY)) {
      child.write(TERMINAL_CAPABILITY_REPLY)
      probe = probe.slice(probe.indexOf(TERMINAL_CAPABILITY_QUERY) + TERMINAL_CAPABILITY_QUERY.length)
    }
    while (probe.includes(TERMINAL_BACKGROUND_QUERY)) {
      child.write(TERMINAL_BACKGROUND_REPLY)
      probe = probe.slice(probe.indexOf(TERMINAL_BACKGROUND_QUERY) + TERMINAL_BACKGROUND_QUERY.length)
    }
    const retainedProbeLength = Math.max(TERMINAL_CAPABILITY_QUERY.length, TERMINAL_BACKGROUND_QUERY.length) - 1
    probe = probe.slice(-retainedProbeLength)
  })
  try {
    await waitFor(() => output, 'Start a conversation')
    await waitFor(() => output, '/models change model · /plugins browse · /help commands')
    // The banner can render one tick before the input loop has entered raw
    // mode; wait briefly so the first command cannot be consumed by startup.
    await new Promise(resolve => setTimeout(resolve, 50))
    child.write('@clean')
    await waitFor(() => output, '@clean-room-path.txt')
    child.write('\u001b')
    child.write('\u007f'.repeat('@clean'.length))
    child.write('/lang zh')
    await waitFor(() => output, 'prompt › /lang zh')
    child.write('\r')
    await waitFor(() => output, '语言已切换为中文。')
    child.write('/comp')
    await waitFor(() => output, '压缩较早的对话历史')
    child.write('\u001b')
    child.write('\u007f'.repeat('/comp'.length))
    child.write('/lang en')
    await waitFor(() => output, '输入 › /lang en')
    child.write('\r')
    await waitFor(() => output, 'Language set to English.')
    child.write('/models')
    await waitFor(() => output, 'prompt › /models')
    child.write('\r')
    await new Promise(resolve => setTimeout(resolve, 100))
    child.write('\r')
    await waitFor(() => output, 'Sign in with ChatGPT')
    child.write('\u001b')
    await new Promise(resolve => setTimeout(resolve, 100))
    child.write('/doctor')
    await waitFor(() => output, 'prompt › /doctor')
    child.write('\r')
    await new Promise(resolve => setTimeout(resolve, 100))
    child.write('\r')
    await waitFor(() => output, 'Runtime diagnostics')
    await waitFor(() => output, 'background dark')
    const beforeClose = output.length
    child.write('\u001b')
    await waitFor(() => output.slice(beforeClose), 'Ready')
    child.write('/plugins')
    await waitFor(() => output, 'prompt › /plugins')
    child.write('\r')
    await new Promise(resolve => setTimeout(resolve, 100))
    child.write('\r')
    await waitFor(() => output, 'Plugin Hub')
    await waitFor(() => output, 'Installed · Registry · GitHub repositories')
    await waitFor(() => output, 'All Registry entries')
    child.write('\u001b')
    await new Promise(resolve => setTimeout(resolve, 100))
    child.write('/quit')
    await waitFor(() => output, 'prompt › /quit')
    child.write('\r')
    await new Promise(resolve => setTimeout(resolve, 100))
    child.write('\r')
    const exit = await new Promise<{ exitCode: number; signal?: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`PTY did not exit:\n${output.slice(-12_000)}`))
      }, 30_000)
      child.onExit((event) => { clearTimeout(timer); resolve(event) })
    })
    if (exit.exitCode !== 0) fail(`PTY exited ${exit.exitCode}:\n${output.slice(-12_000)}`)
    if (!output.includes('\u001b[?1049h') || !output.includes('\u001b[?1049l')) {
      fail(`PTY did not enter and restore the alternate screen:\n${output.slice(-12_000)}`)
    }
  } finally {
    data.dispose()
    try { process.kill(child.pid, 0); child.kill('SIGKILL') } catch { /* already exited */ }
  }
}

const temporary = mkdtempSync(join(tmpdir(), 'dsh-tui-official-clean-room-'))
let server: Server | undefined
try {
  const releases = packFamily(join(temporary, 'tarballs'))
  const local = await registry(releases)
  server = local.server
  const npmrc = join(temporary, '.npmrc')
  writeFileSync(npmrc, [
    'registry=https://registry.npmjs.org/',
    `@lingxi-ai-cn:registry=${local.origin}/`,
    'strict-peer-dependencies=true',
    '',
  ].join('\n'))
  const official = join(temporary, 'official')
  mkdirSync(official, { recursive: true })
  writeFileSync(join(official, 'package.json'), '{"name":"dsh-official-clean-room","private":true}\n')
  writeFileSync(join(official, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    'allowBuilds:',
    "  '@deepseek-ai/dsh-subprocess-local': true",
    "  '@google/genai': true",
    '  koffi: true',
    '  node-pty: true',
    '  protobufjs: true',
    '',
  ].join('\n'))
  const environment = stringEnvironment({
    NPM_CONFIG_USERCONFIG: npmrc,
    npm_config_userconfig: npmrc,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    DSH_HOME: join(temporary, 'home'),
    DSH_TELEMETRY_DISABLED: '1',
    DEEPSEEK_API_KEY: '',
  })
  run('pnpm', ['add', '--save-exact', `@deepseek-ai/dsh@${DSH_VERSION}`], official, environment, 300_000)
  process.stdout.write(`verify-tui-plugin-clean-room: installed official DSH ${DSH_VERSION}\n`)
  const officialManifest = JSON.parse(readFileSync(join(official, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')) as { version?: unknown }
  if (officialManifest.version !== DSH_VERSION) fail(`official DSH resolved ${String(officialManifest.version)}`)
  const dshHome = environment.DSH_HOME
  if (dshHome === undefined) fail('clean-room DSH_HOME is missing')
  const before = treeDigest(official)
  const dsh = join(official, 'node_modules/.bin/dsh')
  const pluginInstall = await runAsync(
    dsh,
    ['plugin', '--profile', 'tui', 'add', '--save-exact', `${TOP_PACKAGE}@${TUI_VERSION}`],
    official,
    environment,
    300_000,
  )
  const pluginInstallOutput = `${pluginInstall.stdout}\n${pluginInstall.stderr}`
  if (/Issues with peer dependencies found|missing peer/iu.test(pluginInstallOutput)) {
    fail(`top-level TUI install reported missing Host peers:\n${pluginInstallOutput.slice(-12_000)}`)
  }
  process.stdout.write('verify-tui-plugin-clean-room: installed the top-level TUI through dsh plugin\n')

  const profile = join(dshHome, 'profiles/tui')
  const profileManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
    dependencies?: Readonly<Record<string, string>>
    dsh?: { profile?: { bundles?: readonly string[] } }
  }
  if (profileManifest.dependencies?.[TOP_PACKAGE] !== TUI_VERSION) fail('profile does not pin only the exact top-level TUI release')
  if (Object.keys(profileManifest.dependencies ?? {}).some(name => name !== TOP_PACKAGE)) {
    fail(`profile exposes internal TUI packages as direct dependencies: ${Object.keys(profileManifest.dependencies ?? {}).join(', ')}`)
  }
  const profileBundles = profileManifest.dsh?.profile?.bundles ?? []
  const expectedProfileBundles = ['@deepseek-ai/dsh-base', TOP_PACKAGE]
  const hasUnexpectedProfileBundles = profileBundles.length !== expectedProfileBundles.length
    || profileBundles.some((name, index) => name !== expectedProfileBundles[index])
  if (hasUnexpectedProfileBundles) {
    const actualProfileBundles = profileBundles.join(', ')
    fail(`profile bundle list is not the canonical post-install composition: ${actualProfileBundles}`)
  }
  const profileLock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
  if (/\b(?:workspace|file|link):/u.test(profileLock)) fail('profile lockfile retains a local dependency protocol')
  if (existsSync(join(profile, 'node_modules/@deepseek-ai'))) fail('profile materialized duplicate official Host packages')
  if (existsSync(join(profile, 'node_modules/@earendil-works/pi-ai'))) fail('profile materialized a duplicate pi-ai Host library')
  for (const release of releases) {
    if (!existsSync(join(profile, 'node_modules', release.name, 'package.json'))) fail(`${release.name} is absent from the profile graph`)
  }

  const dumped = run(dsh, ['--profile', 'tui', '--dump-default-config'], official, environment)
  if (!dumped.includes('@lingxi-ai-cn/dsh-tui-runtime')
    || !dumped.includes('@lingxi-ai-cn/dsh-llm-openai-codex')
    || !dumped.includes('profileMutations: false')) {
    fail('official DSH did not compose the packed TUI patch')
  }
  const help = run(dsh, ['--profile', 'tui', '--help'], official, environment)
  if (!help.includes('Usage: dsh --profile tui') || !help.includes('--resume <session-id>')) {
    fail('packed startup provider did not own profile help')
  }
  await bootPty(official, join(official, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), dshHome, environment)
  const after = treeDigest(official)
  if (before !== after) fail('TUI installation or boot mutated the official DSH installation tree')
  process.stdout.write(`verify-tui-plugin-clean-room: official DSH ${DSH_VERSION} with TUI ${TUI_VERSION}, exact install, composition, and PTY passed\n`)
} finally {
  const activeServer = server
  if (activeServer !== undefined) {
    await new Promise<void>((resolve) => {
      activeServer.close(() => { resolve() })
    })
  }
  if (process.env.DSH_TUI_KEEP_CLEAN_ROOM === '1') {
    process.stderr.write(`verify-tui-plugin-clean-room: retained ${temporary}\n`)
  } else {
    rmSync(temporary, { recursive: true, force: true })
  }
}
