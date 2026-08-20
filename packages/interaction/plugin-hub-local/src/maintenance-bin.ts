#!/usr/bin/env node
/** Package-owned maintenance process for one authenticated profile transaction. */

import { runMaintenanceHandoff } from './maintenance.ts'

function parseRequest(args: readonly string[]): {
  readonly journal: string
  readonly nonce: string
  readonly parentPid: number
} {
  if (args.length !== 6 || args[0] !== '--journal' || args[2] !== '--nonce' || args[4] !== '--parent-pid') {
    throw new Error('invalid maintenance arguments')
  }
  const journal = args[1]
  const nonce = args[3]
  const parentPid = Number(args[5])
  if (journal === undefined || nonce === undefined || !Number.isSafeInteger(parentPid) || parentPid <= 0) {
    throw new Error('invalid maintenance arguments')
  }
  return { journal, nonce, parentPid }
}

try {
  await runMaintenanceHandoff(parseRequest(process.argv.slice(2)))
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`dsh plugin maintenance: ${message.slice(0, 2048)}\n`)
  process.exitCode = 1
}
