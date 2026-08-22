/** Owner-only, cross-process-safe pi-ai OAuth credential persistence. */

import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

interface CredentialDocument {
  version: 1
  credentials: Record<string, Credential>
}

const EMPTY_DOCUMENT: CredentialDocument = { version: 1, credentials: {} }
const GROUP_OTHER_BITS = 0o077

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

async function assertOwnerOnly(filename: string): Promise<void> {
  let mode: number
  try {
    mode = (await stat(filename)).mode
  } catch (error: unknown) {
    if (isENOENT(error)) return
    throw error
  }
  /* v8 ignore next -- Windows does not expose POSIX owner/group/other mode semantics. */
  if (process.platform === 'win32') return
  if ((mode & GROUP_OTHER_BITS) !== 0) {
    throw new Error(`llm-openai-codex: OAuth credential file ${filename} must be owner-only; run chmod 600 on it`)
  }
}

function credentialOf(value: unknown, provider: string): Credential {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('type' in value)) {
    throw new TypeError(`llm-openai-codex: credential for "${provider}" is not an object`)
  }
  const input = value as Record<string, unknown>
  if (input.type === 'oauth') {
    if (typeof input.access !== 'string' || input.access.length === 0
      || typeof input.refresh !== 'string' || input.refresh.length === 0
      || typeof input.expires !== 'number' || !Number.isFinite(input.expires)) {
      throw new TypeError(`llm-openai-codex: OAuth credential for "${provider}" is missing required fields`)
    }
    return structuredClone(input) as Credential
  }
  if (input.type === 'api_key') return structuredClone(input) as Credential
  throw new TypeError(`llm-openai-codex: credential for "${provider}" has an unknown type`)
}

function parseDocument(text: string, filename: string): CredentialDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`llm-openai-codex: OAuth credential file ${filename} is not valid JSON`, { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`llm-openai-codex: OAuth credential file ${filename} must contain an object`)
  }
  const input = parsed as { version?: unknown; credentials?: unknown }
  if (input.version !== 1 || typeof input.credentials !== 'object'
    || input.credentials === null || Array.isArray(input.credentials)) {
    throw new TypeError(`llm-openai-codex: OAuth credential file ${filename} has an unsupported format`)
  }
  const credentials: Record<string, Credential> = {}
  for (const [provider, value] of Object.entries(input.credentials as Record<string, unknown>)) {
    credentials[provider] = credentialOf(value, provider)
  }
  return { version: 1, credentials }
}

/** File-backed pi-ai credential store with serialized cross-process refresh writes. */
export class FileCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>()

  constructor(readonly filename: string) {}

  private enqueue<T>(provider: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(provider) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    this.chains.set(provider, next.catch(() => undefined))
    return next
  }

  private async load(): Promise<CredentialDocument> {
    await assertOwnerOnly(this.filename)
    try {
      return parseDocument(await readFile(this.filename, 'utf8'), this.filename)
    } catch (error: unknown) {
      if (isENOENT(error)) return structuredClone(EMPTY_DOCUMENT)
      throw error
    }
  }

  private async write(document: CredentialDocument): Promise<void> {
    await writeFileAtomic(this.filename, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  /** @inheritdoc */
  async read(providerId: string): Promise<Credential | undefined> {
    await this.chains.get(providerId)?.catch(() => undefined)
    const value = (await this.load()).credentials[providerId]
    return value === undefined ? undefined : structuredClone(value)
  }

  /** @inheritdoc */
  async list(): Promise<readonly CredentialInfo[]> {
    await Promise.allSettled(this.chains.values())
    const document = await this.load()
    return Object.entries(document.credentials).map(([providerId, credential]) => ({ providerId, type: credential.type }))
  }

  /** @inheritdoc */
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined> {
    return this.enqueue(providerId, async () => {
      await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
      return withFileLock(this.filename, async () => {
        const document = await this.load()
        const current = document.credentials[providerId]
        const next = await fn(current === undefined ? undefined : structuredClone(current))
        if (next === undefined) return current === undefined ? undefined : structuredClone(current)
        document.credentials[providerId] = credentialOf(next, providerId)
        await this.write(document)
        return structuredClone(document.credentials[providerId])
      })
    })
  }

  /** @inheritdoc */
  delete(providerId: string): Promise<void> {
    return this.enqueue(providerId, async () => {
      await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
      await withFileLock(this.filename, async () => {
        const document = await this.load()
        if (!(providerId in document.credentials)) return
        Reflect.deleteProperty(document.credentials, providerId)
        await this.write(document)
      })
    })
  }
}
