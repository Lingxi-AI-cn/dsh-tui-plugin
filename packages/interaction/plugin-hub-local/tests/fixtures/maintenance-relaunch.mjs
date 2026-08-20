import { appendFile, readFile, writeFile } from 'node:fs/promises'

const journalPath = process.env.DSH_PLUGIN_MAINTENANCE_JOURNAL
if (journalPath === undefined) {
  if (process.env.FIXTURE_RESTORE_LOG !== undefined) {
    await appendFile(process.env.FIXTURE_RESTORE_LOG, 'restored\n')
  }
  process.exit(0)
}
if (process.env.FIXTURE_MODE === 'fail') process.exit(7)

const nonce = process.env.DSH_PLUGIN_MAINTENANCE_NONCE
const deadline = Date.now() + 5_000
for (;;) {
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  if (journal.state === 'boot-pending') {
    await writeFile(journal.readyMarker, `${JSON.stringify({
      transactionId: journal.transactionId,
      nonce,
      pid: process.pid,
      profileRevision: journal.afterRevision,
      readyAt: new Date().toISOString(),
    })}\n`, { mode: 0o600 })
    setTimeout(() => { process.exit(0) }, 100)
    break
  }
  if (Date.now() >= deadline) process.exit(8)
  await new Promise(resolve => setTimeout(resolve, 10))
}
