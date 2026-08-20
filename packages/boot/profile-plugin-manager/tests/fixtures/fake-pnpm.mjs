import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [command, ...args] = process.argv.slice(2)
const profileDir = process.cwd()

if (command === 'emit') {
  process.stdout.write('a'.repeat(1024))
  process.stderr.write('b'.repeat(1024))
process.exit(0)
}

if (command === 'fail') {
  process.stderr.write('ordinary pnpm failure\n')
  process.exit(7)
}

if (command === 'hang') {
  process.stdout.write('started\n')
  setInterval(() => {}, 1_000)
} else if (command === 'add') {
  const artifactPath = args.at(-1)
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'))
  if (artifact.failBuild === true) {
    process.stderr.write('pnpm blocked build script; add the package to allowBuilds\n')
    process.exit(1)
  }
  if (artifact.failStdout === true) {
    process.stdout.write('ordinary pnpm failure written to stdout\n')
    process.exit(1)
  }
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies ??= {}
  manifest.dependencies[artifact.name] = `file:${artifactPath}`
  await writeFile(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  const packageDir = join(profileDir, 'node_modules', artifact.name)
  await mkdir(packageDir, { recursive: true })
  const packageManifest = { name: artifact.name, version: artifact.version }
  if (artifact.bundlePatch !== undefined) {
    packageManifest.dsh = { bundle: { patch: artifact.bundlePatch } }
    await writeFile(join(packageDir, artifact.bundlePatch), '[]\n')
  }
  await writeFile(join(packageDir, 'package.json'), JSON.stringify(packageManifest, undefined, 2) + '\n')
  await writeLockfile(manifest.dependencies)
} else if (command === 'remove') {
  const [packageName] = args
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  delete manifest.dependencies?.[packageName]
  await writeFile(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  await rm(join(profileDir, 'node_modules', packageName), { recursive: true, force: true })
  await writeLockfile(manifest.dependencies ?? {})
}

async function writeLockfile(dependencies) {
  const importer = {}
  const packages = {}
  for (const [name, specifier] of Object.entries(dependencies)) {
    const installed = JSON.parse(await readFile(join(profileDir, 'node_modules', name, 'package.json'), 'utf8'))
    importer[name] = { specifier, version: installed.version }
    packages[`${name}@${installed.version}`] = { resolution: { integrity: `sha512-${installed.version}` } }
  }
  await writeFile(join(profileDir, 'pnpm-lock.yaml'), JSON.stringify({
    lockfileVersion: '9.0',
    importers: { '.': { dependencies: importer } },
    packages,
  }, undefined, 2) + '\n')
}
