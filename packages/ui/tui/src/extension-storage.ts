/** Owner-scoped durable JSON storage for native TUI extensions. */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { withFileLock, writeFileAtomic } from './host.ts'

/** JSON values accepted by plugin-local storage. */
export type TuiStorageJson = null | boolean | number | string | readonly TuiStorageJson[] | {
  readonly [key: string]: TuiStorageJson
}

/** Metadata retained for one plugin-local storage namespace. */
export interface TuiPluginLocalStorageInfo {
  readonly abiVersion: number
  readonly owner: {
    readonly packageName: string
    readonly version: string
    readonly activationId: string
  }
  readonly kind: 'storage'
  readonly namespace: string
  readonly quotaBytes: number
}

/** One bounded, durable namespace owned by a live TUI extension activation. */
export interface TuiPluginLocalStorage {
  readonly info: TuiPluginLocalStorageInfo
  /** Read one value, returning `undefined` when the key has not been written. */
  get<T extends TuiStorageJson = TuiStorageJson>(key: string): Promise<T | undefined>
  /** Replace one value after validating its JSON encoding and namespace quota. */
  set(key: string, value: TuiStorageJson): Promise<void>
  /** Delete one value and report whether it existed. */
  delete(key: string): Promise<boolean>
  /** List keys in stable lexical order. */
  keys(): Promise<readonly string[]>
  /** Replace the namespace with an empty document. */
  clear(): Promise<void>
  /** Close this handle; persisted data remains available to the next activation. */
  dispose(): void
}

/** Current plugin-local storage ABI version. */
export const TUI_STORAGE_ABI_VERSION = 1 as const
/** Smallest supported complete storage document quota. */
export const MIN_TUI_STORAGE_QUOTA_BYTES = 128
/** Largest supported plugin-local storage document quota. */
export const MAX_TUI_STORAGE_QUOTA_BYTES = 1024 * 1024

const STORAGE_KEY = /^[a-z][a-z0-9._-]{0,95}$/u
const DOCUMENT_VERSION = 1
const EMPTY_DOCUMENT: StorageDocument = Object.freeze({ version: DOCUMENT_VERSION, values: Object.freeze({}) })

interface StorageDocument {
  readonly version: typeof DOCUMENT_VERSION
  readonly values: Readonly<Record<string, TuiStorageJson>>
}

/**
 * Create a storage handle rooted below the TUI-owned extension directory.
 * @param root - host-owned extension storage root.
 * @param info - validated owner and namespace metadata.
 * @param options - authorization checks and callback invoked when the handle closes.
 * @returns a durable storage handle.
 */
export function createTuiPluginLocalStorage(
  root: string,
  info: TuiPluginLocalStorageInfo,
  options: {
    readonly assertRead: () => void
    readonly assertWrite: () => void
    readonly onDispose: () => void
  },
): TuiPluginLocalStorage {
  const filename = resolve(root, packageDirectory(info.owner.packageName), `${info.namespace}.json`)
  let disposed = false

  const assertOpen = (): void => {
    if (disposed) throw new Error(`TUI extension storage "${info.namespace}" is disposed`)
  }

  const read = async (): Promise<StorageDocument> => {
    assertOpen()
    await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
    return withFileLock(filename, () => readStorageDocument(filename, info.quotaBytes))
  }

  const storage: TuiPluginLocalStorage = {
    info,
    async get<T extends TuiStorageJson = TuiStorageJson>(key: string): Promise<T | undefined> {
      assertStorageKey(key)
      options.assertRead()
      const document = await read()
      options.assertRead()
      assertOpen()
      return document.values[key] as T | undefined
    },
    async set(key: string, value: TuiStorageJson): Promise<void> {
      assertStorageKey(key)
      assertJsonValue(value)
      assertOpen()
      options.assertWrite()
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
      await withFileLock(filename, async () => {
        const document = await readStorageDocument(filename, info.quotaBytes)
        options.assertWrite()
        assertOpen()
        const next: StorageDocument = {
          version: DOCUMENT_VERSION,
          values: { ...document.values, [key]: value },
        }
        await writeFileAtomic(filename, encodeStorageDocument(next, info.quotaBytes), { mode: 0o600, dirMode: 0o700 })
      })
    },
    async delete(key: string): Promise<boolean> {
      assertStorageKey(key)
      assertOpen()
      options.assertWrite()
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
      return withFileLock(filename, async () => {
        const document = await readStorageDocument(filename, info.quotaBytes)
        options.assertWrite()
        assertOpen()
        if (!Object.hasOwn(document.values, key)) return false
        const { [key]: _removed, ...values } = document.values
        await writeFileAtomic(filename, encodeStorageDocument({ version: DOCUMENT_VERSION, values }, info.quotaBytes), {
          mode: 0o600,
          dirMode: 0o700,
        })
        return true
      })
    },
    async keys(): Promise<readonly string[]> {
      options.assertRead()
      const document = await read()
      options.assertRead()
      return Object.freeze(Object.keys(document.values).sort())
    },
    async clear(): Promise<void> {
      assertOpen()
      options.assertWrite()
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
      await withFileLock(filename, async () => {
        options.assertWrite()
        assertOpen()
        await writeFileAtomic(filename, encodeStorageDocument(EMPTY_DOCUMENT, info.quotaBytes), { mode: 0o600, dirMode: 0o700 })
      })
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      options.onDispose()
    },
  }
  return storage
}

function packageDirectory(packageName: string): string {
  return `package-${Buffer.from(packageName, 'utf8').toString('hex')}`
}

function assertStorageKey(key: string): void {
  if (!STORAGE_KEY.test(key)) throw new TypeError(`invalid TUI extension storage key "${key}"`)
}

function assertJsonValue(value: unknown): asserts value is TuiStorageJson {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError('TUI extension storage values must contain finite numbers')
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item)
    return
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new TypeError(`TUI extension storage object key "${key}" is not allowed`)
      }
      assertJsonValue(item)
    }
    return
  }
  throw new TypeError('TUI extension storage values must be JSON values')
}

function encodeStorageDocument(document: StorageDocument, quotaBytes: number): string {
  const content = `${JSON.stringify(document)}\n`
  if (Buffer.byteLength(content, 'utf8') > quotaBytes) {
    throw new RangeError(`TUI extension storage quota of ${quotaBytes} bytes exceeded`)
  }
  return content
}

async function readStorageDocument(filename: string, quotaBytes: number): Promise<StorageDocument> {
  let content: string
  try {
    content = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_DOCUMENT
    throw error
  }
  if (Buffer.byteLength(content, 'utf8') > quotaBytes) {
    return retainCorruptStorage(filename, `file exceeds the ${quotaBytes}-byte quota`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    return retainCorruptStorage(filename, `invalid JSON (${error instanceof Error ? error.message : 'parse failure'})`)
  }
  if (!isStorageDocument(parsed)) return retainCorruptStorage(filename, 'invalid storage document')
  return parsed
}

function isStorageDocument(value: unknown): value is StorageDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (record.version !== DOCUMENT_VERSION || record.values === null || typeof record.values !== 'object' || Array.isArray(record.values)) return false
  for (const [key, item] of Object.entries(record.values)) {
    if (!STORAGE_KEY.test(key)) return false
    try { assertJsonValue(item) } catch { return false }
  }
  return true
}

async function retainCorruptStorage(filename: string, reason: string): Promise<StorageDocument> {
  const retained = `${filename}.corrupt-${Date.now()}-${randomUUID()}`
  try {
    await rename(filename, retained)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_DOCUMENT
    throw new Error(`TUI extension storage is corrupt and could not be retained (${reason})`, { cause: error })
  }
  return EMPTY_DOCUMENT
}
