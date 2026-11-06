import { randomUUID } from 'node:crypto'
import { open, readFile, rename, rm } from 'node:fs/promises'

const args = process.argv.slice(2)
const journalPath = args[args.indexOf('--journal') + 1]
const nonce = args[args.indexOf('--nonce') + 1]
const journal = JSON.parse(await readFile(journalPath, 'utf8'))
if (journal.handoffNonce !== nonce) process.exit(9)
const temporary = `${journalPath}.${randomUUID()}.tmp`
const file = await open(temporary, 'wx', 0o600)
try {
  try {
    await file.writeFile(`${JSON.stringify({
      ...journal,
      state: 'waiting-for-old-process',
      updatedAt: new Date().toISOString(),
    }, undefined, 2)}\n`)
  } finally {
    await file.close()
  }
  await rename(temporary, journalPath)
} finally {
  await rm(temporary, { force: true })
}
