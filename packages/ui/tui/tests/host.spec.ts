/** Optional-host compatibility adapters used by the post-install TUI. */

import { describe, expect, it, vi } from 'vitest'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  hostAuthentication,
  hostCompletePaths,
  hostLogin,
  resolveSessionForkAnchor,
} from '../src/host.ts'

describe('optional Host compatibility', () => {
  it('degrades legacy LLM runtimes to configured routes without login actions', async () => {
    const llm = {} as LlmRuntime
    await expect(hostAuthentication(llm, 'legacy')).resolves.toEqual({ configured: true, methods: [] })
    await expect(hostLogin(llm, 'legacy', 'oauth', {
      prompt: () => Promise.resolve('unused'),
      notify: () => {},
    })).rejects.toThrow('does not expose interactive provider authentication')
  })

  it('delegates authentication only when the Host advertises the newer seam', async () => {
    const authentication = vi.fn(() => Promise.resolve({
      configured: false,
      methods: [{ id: 'oauth', name: 'Sign in' }],
    }))
    const login = vi.fn(() => Promise.resolve())
    const llm = { authentication, login } as unknown as LlmRuntime
    await expect(hostAuthentication(llm, 'codex')).resolves.toMatchObject({ configured: false })
    const interaction = { prompt: () => Promise.resolve('code'), notify: () => {} }
    await expect(hostLogin(llm, 'codex', 'oauth', interaction)).resolves.toBeUndefined()
    expect(authentication).toHaveBeenCalledWith('codex')
    expect(login).toHaveBeenCalledWith('codex', 'oauth', interaction)
  })

  it('returns no path suggestions when bounded Host completion is absent', async () => {
    const fs = {} as FileSystem
    await expect(hostCompletePaths(fs, {} as never, 'src', {
      maxDepth: 4,
      maxItems: 32,
      maxScannedEntries: 256,
    })).resolves.toEqual({ entries: [], truncated: false })
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
