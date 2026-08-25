/** Optional-host compatibility adapters used by the post-install TUI. */

import { describe, expect, it, vi } from 'vitest'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  hostAuthentication,
  hostCompletePaths,
  hostLogin,
  hostLogout,
  hostReadSessionPreview,
  hostSessionReferences,
  resolveSessionForkAnchor,
  TuiHostCommandCatalog,
} from '../src/host.ts'
import { commandSuggestionState } from '../src/suggestion.ts'

describe('optional Host compatibility', () => {
  it('degrades legacy LLM runtimes to configured routes without login actions', async () => {
    const llm = {} as LlmRuntime
    await expect(hostAuthentication(llm, 'legacy')).resolves.toEqual({ configured: true, methods: [] })
    await expect(hostLogin(llm, 'legacy', 'oauth', {
      prompt: () => Promise.resolve('unused'),
      notify: () => {},
    })).rejects.toThrow('does not expose interactive provider authentication')
    await expect(hostLogout(llm, 'legacy')).rejects.toThrow('does not expose provider logout')
  })

  it('delegates authentication only when the Host advertises the newer seam', async () => {
    const authentication = vi.fn(() => Promise.resolve({
      configured: false,
      methods: [{ id: 'oauth', name: 'Sign in' }],
    }))
    const login = vi.fn(() => Promise.resolve())
    const logout = vi.fn(() => Promise.resolve())
    const llm = { authentication, login, logout } as unknown as LlmRuntime
    await expect(hostAuthentication(llm, 'codex')).resolves.toMatchObject({ configured: false })
    const interaction = { prompt: () => Promise.resolve('code'), notify: () => {} }
    await expect(hostLogin(llm, 'codex', 'oauth', interaction)).resolves.toBeUndefined()
    expect(authentication).toHaveBeenCalledWith('codex')
    expect(login).toHaveBeenCalledWith('codex', 'oauth', interaction)
    await expect(hostLogout(llm, 'codex')).resolves.toBeUndefined()
    expect(logout).toHaveBeenCalledWith('codex')
  })

  it('normalizes official rc.8 Session reference timestamps and treats preflight as optional', async () => {
    const listCandidates = vi.fn(async () => [{
      sessionId: 'session-one', label: 'Earlier', cwd: '/workspace', createdAt: 42,
    }])
    const references = hostSessionReferences({
      get: (name: string) => name === 'sessionReferenceResolver' ? { listCandidates } : undefined,
    } as never)
    await expect(references.listCandidates({} as never)).resolves.toEqual([{
      sessionId: 'session-one', label: 'Earlier', cwd: '/workspace', createdAt: 42, updatedAt: 42,
    }])
    await expect(references.validateText({} as never, 'plain')).resolves.toEqual([])
  })

  it('uses bounded legacy filesystem primitives when Host completion is absent', async () => {
    const root = { targetKey: 'root', displayPath: '/workspace' } as FsTarget
    const source = { targetKey: 'source', displayPath: '/workspace/src' } as FsTarget
    const index = { targetKey: 'index', displayPath: '/workspace/src/index.ts' } as FsTarget
    const readme = { targetKey: 'readme', displayPath: '/workspace/README.md' } as FsTarget
    const outside = { targetKey: 'outside', displayPath: '/outside.ts' } as FsTarget
    const listings = new Map([
      ['root', [
        { name: 'README.md', type: 'file' as const, target: readme },
        { name: 'src', type: 'directory' as const, target: source },
        { name: 'outside.ts', type: 'file' as const, target: outside },
      ]],
      ['source', [{ name: 'index.ts', type: 'file' as const, target: index }]],
    ])
    const listDir = vi.fn((target: FsTarget) => Promise.resolve(listings.get(String(target.targetKey)) ?? []))
    const fs = {
      listDir,
      contains: (_parent: FsTarget, child: FsTarget) => child !== outside,
    } as unknown as FileSystem

    await expect(hostCompletePaths(fs, root, 'src', {
      maxDepth: 4,
      maxItems: 32,
      maxScannedEntries: 256,
    })).resolves.toEqual({
      entries: [
        { path: 'src/', type: 'directory' },
        { path: 'src/index.ts', type: 'file' },
      ],
      truncated: false,
    })
    expect(listDir).toHaveBeenCalledTimes(2)
  })

  it('delegates path completion to a newer Host', async () => {
    const result = { entries: [{ path: 'src/', type: 'directory' as const }], truncated: false }
    const completePaths = vi.fn(() => Promise.resolve(result))
    const fs = { completePaths } as unknown as FileSystem
    const root = {} as FsTarget
    const options = { maxDepth: 4, maxItems: 32, maxScannedEntries: 256 }
    await expect(hostCompletePaths(fs, root, 'src', options)).resolves.toBe(result)
    expect(completePaths).toHaveBeenCalledWith(root, 'src', options)
  })

  it('retains command completion metadata when a legacy Host omits it from discovery', () => {
    const completion = { descriptions: { en: 'Configure', zh: '配置 TUI' } }
    const hostDispose = vi.fn()
    const register = vi.fn(() => hostDispose)
    const list = vi.fn(() => [{ name: 'config', description: 'Configure' }])
    const commands = { register, list } as unknown as ConstructorParameters<typeof TuiHostCommandCatalog>[0]
    const catalog = new TuiHostCommandCatalog(commands)
    const definition = {
      name: 'config', description: 'Configure', completion, handler: () => ({ kind: 'success' as const }),
    }
    const dispose = catalog.register(definition)
    expect(register).toHaveBeenCalledWith(definition)
    const descriptors = catalog.list({} as never)
    expect(descriptors[0]?.completion).toBe(completion)
    expect(commandSuggestionState('/', 1, descriptors, 'zh')?.items[0]?.description).toBe('配置 TUI')
    dispose()
    expect(hostDispose).toHaveBeenCalledOnce()
    expect(catalog.list({} as never)[0]?.completion).toBeUndefined()
  })

  it('keeps completion-capable Host metadata authoritative', () => {
    const registered = { descriptions: { en: 'Registered' } }
    const discovered = { descriptions: { en: 'Discovered' } }
    const commands = {
      register: vi.fn(() => () => {}),
      list: vi.fn(() => [{ name: 'config', description: 'Configure', completion: discovered }]),
    } as unknown as ConstructorParameters<typeof TuiHostCommandCatalog>[0]
    const catalog = new TuiHostCommandCatalog(commands)
    catalog.register({
      name: 'config', description: 'Configure', completion: registered,
      handler: () => ({ kind: 'success' as const }),
    })
    expect(catalog.list({} as never)[0]?.completion).toBe(discovered)
  })

  it('returns no Session preview when the older Host has no preview reader', async () => {
    const legacy = {} as Parameters<typeof hostReadSessionPreview>[0]
    await expect(hostReadSessionPreview(legacy, 'session-1' as never)).resolves.toBeUndefined()
    const readPreview = vi.fn(() => Promise.resolve({ lines: [], truncated: false }))
    const capable = { readPreview } as unknown as Parameters<typeof hostReadSessionPreview>[0]
    await expect(hostReadSessionPreview(capable, 'session-1' as never)).resolves.toEqual({
      lines: [], truncated: false,
    })
    expect(readPreview).toHaveBeenCalledWith('session-1', undefined)
  })

  it('retains a complete turn without requiring the newer Session helper export', () => {
    const events = [
      { seq: 0, type: 'turn/start' },
      { seq: 1, type: 'user/message' },
      { seq: 2, type: 'turn/end' },
      { seq: 3, type: 'command/executed' },
      { seq: 4, type: 'turn/start' },
    ] as unknown as SessionEvent[]
    expect(resolveSessionForkAnchor(events, 1)).toEqual({
      kind: 'selected',
      boundarySeq: 2,
      seedLength: 4,
    })
    expect(resolveSessionForkAnchor(events, 4)).toEqual({
      kind: 'unavailable',
      reason: 'anchored-turn-open',
    })
  })
})
