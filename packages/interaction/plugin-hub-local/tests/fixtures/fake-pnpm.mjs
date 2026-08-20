import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { list as listTar } from 'tar'

const raw = process.argv.slice(2)
const fail = raw[0] === '--fail'
const [command, ...args] = fail ? raw.slice(1) : raw
const profileDir = process.cwd()

if (fail) {
  process.stderr.write('pnpm blocked build script; add the package to allowBuilds\n')
  process.exit(1)
}

if (command === 'add') {
  const artifactPath = args.at(-1)
  const artifact = await packageManifest(artifactPath)
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies ??= {}
  manifest.dependencies[artifact.name] = `file:${artifactPath}`
  await writeFile(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  const packageDir = join(profileDir, 'node_modules', artifact.name)
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), JSON.stringify(artifact, undefined, 2) + '\n')
  if (artifact.dsh?.bundle?.patch !== undefined) {
    await writeFile(join(packageDir, artifact.dsh.bundle.patch), '[]\n')
  }
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

async function packageManifest(path) {
  let read
  await listTar({
    file: path,
    filter: entryPath => entryPath === 'package/package.json',
    onReadEntry: (entry) => {
      read = new Promise((resolve, reject) => {
        const chunks = []
        entry.on('data', chunk => chunks.push(chunk))
        entry.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
        entry.on('error', reject)
      })
    },
  })
  if (read === undefined) throw new Error('artifact package manifest is missing')
  return read
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
