import { readFile, writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const journalPath = args[args.indexOf('--journal') + 1]
const nonce = args[args.indexOf('--nonce') + 1]
const journal = JSON.parse(await readFile(journalPath, 'utf8'))
if (journal.handoffNonce !== nonce) process.exit(9)
await writeFile(journalPath, `${JSON.stringify({
  ...journal,
  state: 'waiting-for-old-process',
  updatedAt: new Date().toISOString(),
}, undefined, 2)}\n`, { mode: 0o600 })
