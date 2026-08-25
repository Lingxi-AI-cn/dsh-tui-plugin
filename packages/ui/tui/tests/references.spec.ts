import { describe, expect, it, vi } from 'vitest'
import { parseSessionReferenceText } from '@deepseek-ai/dsh-session-reference'
import { SessionId } from '@deepseek-ai/dsh-session'
import { acceptTuiSuggestion } from '../src/suggestion.ts'
import {
  collectTuiReferenceResolution, preflightTuiReferenceText, tuiReferenceQuery, tuiReferenceSuggestionState,
} from '../src/references.ts'

describe('unified reference query', () => {
  it('uses the owner token boundary for email, CJK, quoted paths, and mid-token edits', () => {
    expect(tuiReferenceQuery('mail me@example.com', 19)).toBeUndefined()
    expect(tuiReferenceQuery('前缀 @文档/说明.md 后缀', 12)).toEqual({
      queryStart: 3, queryEnd: 12, query: '文档/说明.md', quoted: false,
    })
    expect(tuiReferenceQuery('open @"my folder/file.txt" now', 16)).toEqual({
      queryStart: 5, queryEnd: 26, query: 'my folder', quoted: true,
    })
    expect(tuiReferenceQuery('see @src/old.ts next', 9)).toEqual({
      queryStart: 4, queryEnd: 15, query: 'src/', quoted: false,
    })
    expect(tuiReferenceQuery('see @[label](dsh-session:eA)', 11)).toBeUndefined()
  })

  it('keeps multiline replacement on the active line and recognizes parent paths', () => {
    expect(tuiReferenceQuery('first @one\nsecond @../资料', 24)).toEqual({
      queryStart: 18, queryEnd: 24, query: '../资料', quoted: false,
    })
  })
})

describe('unified reference suggestion projection', () => {
  it('marks file and Session rows textually and inserts owner-canonical tokens', () => {
    const query = tuiReferenceQuery('compare @sou', 12)
    expect(query).toBeDefined()
    const sessionId = SessionId('session/源')
    const state = tuiReferenceSuggestionState(query!, {
      files: [{ path: 'source.ts', kind: 'file' }, { path: 'source dir', kind: 'directory' }],
      sessions: [{
        sessionId, label: 'Source Session', cwd: '/work', createdAt: 10, updatedAt: 20,
      }],
      errors: [],
    }, 'en', 20)
    expect(state.items.map(item => [item.source, item.referenceKind, item.label.slice(0, 1)])).toEqual([
      ['file', 'file', 'F'],
      ['file', 'directory', 'F'],
      ['session', 'session', 'S'],
    ])
    const accepted = acceptTuiSuggestion('compare @sou', { ...state, selectedIndex: 2 })
    expect(accepted).toBeDefined()
    const parsed = parseSessionReferenceText(accepted!.text)
    expect(parsed.text).toBe('compare @Source Session ')
    expect(parsed.references).toEqual([{ sessionId, label: 'Source Session' }])
  })

  it('retains partial results, reports provider failures, and bounds each group', () => {
    const query = { queryStart: 0, queryEnd: 1, query: '', quoted: false } as const
    const files = Array.from({ length: 14 }, (_, index) => ({ path: `f${index}`, kind: 'file' as const }))
    const partial = tuiReferenceSuggestionState(query, { files, sessions: [], errors: ['session'] }, 'zh', 0)
    expect(partial.status).toBe('truncated')
    expect(partial.items).toHaveLength(12)
    expect(partial.error).toContain('Session')
    const failed = tuiReferenceSuggestionState(query, { files: [], sessions: [], errors: ['file', 'session'] })
    expect(failed.status).toBe('error')
  })

  it('waits for delayed providers, retains partial failure, and rejects stale aborted generations', async () => {
    let releaseSessions: (() => void) | undefined
    const controller = new AbortController()
    const pending = collectTuiReferenceResolution('src', {
      files: vi.fn(async () => [{ path: 'src/index.ts', kind: 'file' as const }]),
      sessions: vi.fn(async () => {
        await new Promise<void>((resolve) => { releaseSessions = resolve })
        return []
      }),
    }, controller.signal)
    await vi.waitFor(() => { expect(releaseSessions).toBeTypeOf('function') })
    releaseSessions?.()
    await expect(pending).resolves.toMatchObject({ files: [{ path: 'src/index.ts' }], errors: [] })

    const aborted = new AbortController()
    const stale = collectTuiReferenceResolution('', {
      files: async () => [],
      sessions: async () => {
        aborted.abort('superseded')
        return []
      },
    }, aborted.signal)
    await expect(stale).rejects.toBe('superseded')

    const partial = await collectTuiReferenceResolution('', {
      files: async () => { throw new Error('index failed') },
      sessions: async () => [],
    }, new AbortController().signal)
    expect(partial.errors).toEqual(['file'])
  })

  it('contains a synchronous owner failure without hiding the other owner', async () => {
    const sessionId = SessionId('session/kept')
    await expect(collectTuiReferenceResolution('keep', {
      files: () => { throw new Error('file owner unavailable') },
      sessions: async () => [{
        sessionId, label: 'Kept Session', createdAt: 1, updatedAt: 2,
      }],
    }, new AbortController().signal)).resolves.toEqual({
      files: [],
      sessions: [{ sessionId, label: 'Kept Session', createdAt: 1, updatedAt: 2 }],
      errors: ['file'],
    })
  })
})

describe('unified reference submission preflight', () => {
  it('validates the exact canonical text without copying referenced content', async () => {
    const text = 'compare @[Earlier](dsh-session:c2Vzc2lvbi8x) with this turn'
    const validate = vi.fn(async () => ({ references: [{ preparedBy: 'owner' }] }))
    const result = await preflightTuiReferenceText(text, validate, new AbortController().signal)
    expect(result).toBe(text)
    expect(validate).toHaveBeenCalledWith(text, expect.any(AbortSignal))
    expect(result).not.toContain('preparedBy')
  })

  it('does not consult the Session owner for ordinary file mentions', async () => {
    const validate = vi.fn(async () => undefined)
    await expect(preflightTuiReferenceText(
      'inspect @src/index.ts', validate, new AbortController().signal,
    )).resolves.toBe('inspect @src/index.ts')
    expect(validate).not.toHaveBeenCalled()
  })

  it('propagates cancellation after owner validation', async () => {
    const controller = new AbortController()
    const pending = preflightTuiReferenceText(
      '@[Earlier](dsh-session:c2Vzc2lvbi8x)',
      async () => { controller.abort('view changed') },
      controller.signal,
    )
    await expect(pending).rejects.toBe('view changed')
  })
})
