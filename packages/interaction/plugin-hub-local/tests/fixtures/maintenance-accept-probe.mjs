import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'

const args = process.argv.slice(2)
const journalPath = args[args.indexOf('--journal') + 1]
const expected = JSON.parse(await fs.readFile(journalPath, 'utf8'))
const originalOpen = fs.open
const originalWriteFile = fs.writeFile

// Observe the live journal after opening the helper's output, before writing.
// A direct overwrite has already truncated it; a temporary output leaves it intact.
fs.open = async (...args) => {
  const file = await originalOpen(...args)
  try {
    assert.deepEqual(JSON.parse(await fs.readFile(journalPath, 'utf8')), expected)
    return file
  } catch (error) {
    await file.close()
    throw error
  }
}
// Preserve the observation if the fixture regresses to direct writeFile again.
fs.writeFile = async (path, data, options) => {
  const file = await fs.open(path, options.flag ?? 'w', options.mode)
  try {
    await file.writeFile(data)
  } finally {
    await file.close()
  }
}
syncBuiltinESMExports()

try {
  await import('./maintenance-accept.mjs')
} finally {
  fs.open = originalOpen
  fs.writeFile = originalWriteFile
  syncBuiltinESMExports()
}
