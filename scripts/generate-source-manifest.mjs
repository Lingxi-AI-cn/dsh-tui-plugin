import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = join(root, 'SOURCE_MANIFEST.json')
const packageRoot = join(root, 'packages')

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'lib' || entry.name === 'node_modules') return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

const entries = Object.fromEntries(files(packageRoot).sort().map((path) => {
  const name = relative(root, path).replaceAll('\\', '/')
  return [name, createHash('sha256').update(readFileSync(path)).digest('hex')]
}))
const manifest = `${JSON.stringify({
  format: 1,
  release: '0.1.11-rc.2',
  compatibleDeepSeekHarness: '0.1.5-rc.2',
  files: entries,
}, null, 2)}\n`

if (process.argv.includes('--write')) {
  writeFileSync(output, manifest)
  process.stdout.write(`generate-source-manifest: wrote ${Object.keys(entries).length} file hashes\n`)
} else if (process.argv.includes('--check')) {
  if (existsSync(output) && statSync(output).isFile() && readFileSync(output, 'utf8') === manifest) {
    process.stdout.write(`generate-source-manifest: ${Object.keys(entries).length} file hashes verified\n`)
  } else {
    process.stderr.write('generate-source-manifest: SOURCE_MANIFEST.json is stale; run pnpm run generate:source-manifest\n')
    process.exitCode = 1
  }
} else {
  process.stderr.write('usage: node scripts/generate-source-manifest.mjs --write|--check\n')
  process.exitCode = 2
}
