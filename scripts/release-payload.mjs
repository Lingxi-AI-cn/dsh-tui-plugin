import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const TAR_MAX_BUFFER = 64 * 1024 * 1024

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]))
}

/**
 * Compute the normalized payload digest used to compare locally packed and registry tarballs.
 *
 * @param {string} tarball Path to an npm package tarball.
 * @returns {string} Hexadecimal SHA-512 digest of the normalized entries.
 */
export function payloadDigest(tarball) {
  const files = execFileSync('tar', ['-tzf', tarball], {
    encoding: 'utf8',
    maxBuffer: TAR_MAX_BUFFER,
  })
    .split('\n')
    .filter(entry => entry !== '' && !entry.endsWith('/'))
    .sort()
  const hash = createHash('sha512')
  for (const file of files) {
    let bytes = execFileSync('tar', ['-xOzf', tarball, file], { maxBuffer: TAR_MAX_BUFFER })
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
