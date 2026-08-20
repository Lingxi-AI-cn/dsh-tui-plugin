/** Committed Plugin Hub receipts used to project managed installed packages. */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PluginHubError } from '@lingxi-ai-cn/dsh-plugin-hub'
import type { ProfilePluginReceipt } from '@lingxi-ai-cn/dsh-profile-plugin-manager'

const TRANSACTION_ID_PATTERN = /^[0-9a-f]{32}$/u

/** Private receipt bound to one exact managed profile dependency. */
export interface LocalPluginTransactionReceipt extends ProfilePluginReceipt {
  readonly transactionId: string
  readonly operation: 'install' | 'update' | 'remove'
  readonly beforeRevision: string
  readonly afterRevision: string
  readonly committedAt?: string
}

/**
 * Read validated committed receipts in commit order for installed-truth projection.
 * @param dataDir - configured private Plugin Hub data directory.
 * @returns committed receipts; later records for one package take precedence.
 */
export async function readCommittedPluginReceipts(
  dataDir: string,
): Promise<readonly LocalPluginTransactionReceipt[]> {
  let entries
  try {
    entries = await readdir(join(dataDir, 'transactions'), { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const receipts: LocalPluginTransactionReceipt[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !TRANSACTION_ID_PATTERN.test(entry.name)) continue
    const path = join(dataDir, 'transactions', entry.name, 'receipt.json')
    try {
      receipts.push(parseReceipt(JSON.parse(await readFile(path, 'utf8'))))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      if (error instanceof PluginHubError) throw error
      throw new PluginHubError('Committed Plugin Hub receipt is invalid.', 'PROFILE_INVALID', { cause: error })
    }
  }
  receipts.sort((left, right) => {
    const time = Date.parse(requiredCommittedAt(left)) - Date.parse(requiredCommittedAt(right))
    return time === 0 ? left.transactionId.localeCompare(right.transactionId) : time
  })
  return Object.freeze(receipts)
}

function parseReceipt(value: unknown): LocalPluginTransactionReceipt {
  if (!isRecord(value) || typeof value.transactionId !== 'string'
    || !TRANSACTION_ID_PATTERN.test(value.transactionId)
    || (value.operation !== 'install' && value.operation !== 'update' && value.operation !== 'remove')
    || typeof value.packageName !== 'string' || typeof value.version !== 'string'
    || typeof value.beforeRevision !== 'string' || typeof value.afterRevision !== 'string'
    || typeof value.committedAt !== 'string' || !Number.isFinite(Date.parse(value.committedAt))
    || !optionalString(value.pluginId) || !optionalString(value.versionId)
    || !optionalString(value.sourceCommit) || !optionalString(value.artifactDigest)) {
    throw new PluginHubError('Committed Plugin Hub receipt is invalid.', 'PROFILE_INVALID')
  }
  return value as unknown as LocalPluginTransactionReceipt
}

function requiredCommittedAt(receipt: LocalPluginTransactionReceipt): string {
  if (receipt.committedAt === undefined) {
    throw new PluginHubError('Committed Plugin Hub receipt is invalid.', 'PROFILE_INVALID')
  }
  return receipt.committedAt
}

function optionalString(value: unknown): boolean { return value === undefined || typeof value === 'string' }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
