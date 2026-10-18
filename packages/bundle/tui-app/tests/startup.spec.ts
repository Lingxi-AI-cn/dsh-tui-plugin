/** TUI app flag parsing through the ordinary launcher command-line provider. */

import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk, type SystemPromptUpdate } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { tuiHostDiagnosticsFromStartup } from '@lingxi-ai-cn/dsh-tui-runtime'
import * as tuiApp from '../src/index.ts'
import { apply as applyStartup, TUI_STARTUP_SERVICE, type TuiStartupValues } from '../src/startup.ts'

const originalInternals = { ...internals }
afterEach(() => { Object.assign(internals, originalInternals) })

const SOURCE_PROMPT = 'The runtime context names the DeepSeek Harness implementation checkout. The checkout location and current working directory are separate values and may differ; never infer the working directory from the checkout path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.'
// Frozen as the earlier TUI release rendered it, independent of current guidance.
const LEGACY_SOURCE = 'The DeepSeek Harness implementation checkout is at /old/checkout/. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.'
const ROUTE = { provider: 'tui-test', model: 'model' }

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly systemPromptUpdate: SystemPromptUpdate | undefined) { super() }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider, id: model, name: model,
      ...this.systemPromptUpdate === undefined ? {} : { systemPromptUpdate: this.systemPromptUpdate },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function send(agent: Agent): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

function systemPrompts(session: Session): string[] {
  return session.snapshotEvents().flatMap(event => event.type === 'system/message'
    ? [event.data.message.content.map(block => block.type === 'text' ? block.text : '').join('')]
    : [])
}

function requestSystemPrompts(request: GenerateOptions | undefined): string[] {
  return (request?.messages ?? []).filter(message => message.role === 'system')
    .flatMap(message => message.content.map(block => block.type === 'text' ? block.text : ''))
}

function latestRuntimeContext(session: Session): string | undefined {
  const event = session.snapshotEvents().findLast(entry => entry.type === 'user/message'
    && entry.data.source.kind === 'runtime-context')
  const block = event?.type === 'user/message' ? event.data.content[0] : undefined
  return block?.type === 'text' ? block.text : undefined
}

/** Production prompt admission, with only the model's external stream replaced. */
async function promptLoop(systemPromptUpdate: SystemPromptUpdate | undefined) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  const adapter = new RecordingAdapter(systemPromptUpdate)
  ctx.llm.registerAdapter([ROUTE.provider], adapter)
  await ctx.plugin(tuiApp)
  const harness = await mountAgentLoopTestHarness(ctx)
  const resume = async (session: Session, id: string): Promise<Agent> => (await ctx.agents.create({
    sessionId: SessionId(id), agentOptions: ROUTE, seed: [...session.snapshotEvents()],
  })).agent
  const earlierSession = async (source = LEGACY_SOURCE): Promise<Agent> => {
    const earlierRelease = ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembly = await next()
      return {
        ...assembly,
        sections: assembly.sections.map(section => section.name === 'harness:source' ? { ...section, text: source } : section),
        contexts: assembly.contexts.filter(entry => entry.name !== 'harness:source'),
      }
    })
    const agent = await harness.create(SessionId('earlier'), ROUTE)
    await send(agent)
    earlierRelease()
    return agent
  }
  return { ctx, adapter, harness, resume, earlierSession }
}

function isStartupValues(value: unknown): value is TuiStartupValues {
  return typeof value === 'object' && value !== null
    && tuiHostDiagnosticsFromStartup(value) !== undefined
    && (!('resume' in value) || typeof value.resume === 'string')
}

async function parse(args: string[]): Promise<{ value?: TuiStartupValues; exits: number[]; output: string }> {
  const exits: number[] = []
  let output = ''
  const sink = { write: (chunk: string) => { output += chunk; return true } }
  internals.stdout = sink
  internals.stderr = sink
  const ctx = new Context()
  provideCmdline(ctx, { args, exit: (code) => { exits.push(code) } })
  const originalEntrypoint = process.argv[1]
  process.argv[1] = fileURLToPath(new URL('../../../../apps/cli/src/bin.ts', import.meta.url))
  try {
    applyStartup(ctx)
  } finally {
    if (originalEntrypoint === undefined) process.argv.splice(1, 1)
    else process.argv[1] = originalEntrypoint
  }
  const value: unknown = ctx.get(TUI_STARTUP_SERVICE)
  await ctx.fiber.dispose()
  if (value !== undefined && !isStartupValues(value)) throw new Error('tuiStartup published an invalid test value')
  return { ...value === undefined ? {} : { value }, exits, output }
}

describe('TUI command-line provider', () => {
  it('provides a fresh or resumed startup value', async () => {
    const fresh = await parse([])
    expect(fresh).toMatchObject({
      value: {
        diagnostics: {
          compatibility: 'compatible', profile: 'tui',
          agentPresetIds: ['standard', 'ptc', 'minimal', 'cordis'],
        },
      },
      exits: [],
    })
    const resumed = await parse(['--resume', 'session-a'])
    expect(resumed).toMatchObject({
      value: {
        diagnostics: { compatibility: 'compatible', profile: 'tui' },
        resume: 'session-a',
      },
      exits: [],
    })
  })

  it('prints app-owned help without publishing startup', async () => {
    const result = await parse(['--help'])
    expect(result.output).toContain('dsh --profile tui')
    expect(result.value).toBeUndefined()
    expect(result.exits).toEqual([0])
  })
})

describe('TUI bundle plugin', () => {
  it('ships the verified read-only Plugin Hub registry and trust root', () => {
    const patches = loadOverlayPatches('tui-app test', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
    const rows = patches.flatMap(patch => patch.insert ?? [])
    expect(rows.find(row => row.id === 'message-feedback')).toMatchObject({
      name: '@deepseek-ai/dsh-message-feedback', config: { maxNoteBytes: 4096 },
    })
    expect(rows.find(row => row.id === 'directory-picker')).toMatchObject({
      name: '@deepseek-ai/dsh-host-directory-picker-browse', config: { maxEntries: 1000 },
    })
    expect(rows.find(row => row.id === 'host-plugin-inventory')?.name)
      .toBe('@deepseek-ai/dsh-host-plugin-inventory')
    expect(rows.find(row => row.id === 'plugin-hub')?.name).toBe('@lingxi-ai-cn/dsh-plugin-hub')
    const local = rows.find(row => row.id === 'plugin-hub-local')
    expect(local?.name).toBe('@lingxi-ai-cn/dsh-plugin-hub-local')
    const config = local?.config as { profile?: unknown; profileMutations?: unknown; registryUrl?: unknown; trustedKeys?: unknown }
    expect(config.profile).toBe('tui')
    expect(config.profileMutations).toBe(false)
    expect(config.registryUrl).toBe('https://redshell-ai.com:9000')
    expect(Array.isArray(config.trustedKeys)).toBe(true)
    const trustedKey = (config.trustedKeys as unknown[] | undefined)?.[0]
    expect(trustedKey).toMatchObject({ keyId: 'registry-2026-08' })
    const publicKey = (trustedKey as { publicKey?: unknown } | undefined)?.publicKey
    expect(typeof publicKey).toBe('string')
    expect(publicKey as string).toContain('MCowBQYDK2VwAyEA')
  })

  it('survives Loader namespace unwrapping and registers its model-visible surface section', async () => {
    expect('default' in tuiApp).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(tuiApp)).toBe(tuiApp)

    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountAgentLoopTestDependencies(ctx, { systemPrompt: { personaPrefix: '' } })
    const fiber = ctx.plugin(tuiApp)
    await fiber
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(section => section.name === 'harness:source')?.text)
      .toContain('DeepSeek Harness implementation checkout')
    expect(assembly.contexts.find(section => section.name === 'harness:source')?.text)
      .toContain('Current DeepSeek Harness implementation checkout:')
    expect(assembly.sections.find(section => section.name === 'harness:source')?.text)
      .not.toContain(fileURLToPath(new URL('../../../../', import.meta.url)))
    expect(assembly.sections.find(section => section.name === 'app:tui-surface')?.text)
      .toContain('native DeepSeek Harness terminal UI')
    await fiber.dispose()
    const disposed = await ctx.systemPrompt.assemble()
    expect(disposed.sections.some(section => section.name === 'harness:source' || section.name === 'app:tui-surface')).toBe(false)
    expect(disposed.contexts).toEqual([])
    const session = ctx.sessions.create(SessionId('disposed'))
    expect(ctx.sessionProjections.stateOf(session, 'tuiHarnessSourceLegacyPrompt')).toBeUndefined()
  })

  it.each([
    { route: 'replace-only', systemPromptUpdate: undefined },
    { route: 'in-history', systemPromptUpdate: 'in-history' as const },
  ])('resumes the admitted source paragraph verbatim on a different checkout ($route)', async ({ systemPromptUpdate }) => {
    const h = await promptLoop(systemPromptUpdate)
    let session = (await h.earlierSession()).session
    const logged = systemPrompts(session)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toContain(LEGACY_SOURCE)
    for (const id of ['resumed-once', 'resumed-twice']) {
      const resumed = await h.resume(session, id)
      await send(resumed)
      expect(systemPrompts(resumed.session)).toEqual(logged)
      expect(requestSystemPrompts(h.adapter.requests.at(-1))).toEqual(logged)
      expect(latestRuntimeContext(resumed.session)).toContain('Current DeepSeek Harness implementation checkout: "')
      expect(latestRuntimeContext(resumed.session)).not.toContain('/old/checkout/')
      session = resumed.session
    }
  })

  it('keeps the admitted source paragraph when series consolidation empties a later prompt version', async () => {
    const h = await promptLoop('in-history')
    const resumed = await h.resume((await h.earlierSession()).session, 'consolidated')
    const [earlier] = systemPrompts(resumed.session)
    const update = h.ctx.systemPrompt.section({ name: 'test:update', order: 0, text: 'Updated instruction.' })
    await send(resumed)
    update()
    h.ctx.on('agent/pre-step', async (_payload, next) => {
      const decision = await next()
      return decision.kind === 'enter' ? { ...decision, startsRequestSeries: true } : decision
    })
    await send(resumed)
    expect(systemPrompts(resumed.session)).toEqual([earlier, expect.stringContaining('Updated instruction.'), ''])
    await send(resumed)
    expect(systemPrompts(resumed.session)).toHaveLength(3)
    expect(requestSystemPrompts(h.adapter.requests.at(-1))).toEqual([earlier])
  })

  it.each([
    { variant: 'missing frozen ending', source: 'The DeepSeek Harness implementation checkout is at /old/checkout/.' },
    { variant: 'multiline value', source: LEGACY_SOURCE.replace('/old/checkout/', '/old/\ncheckout/') },
  ])('does not preserve a lookalike source paragraph: $variant', async ({ source }) => {
    const h = await promptLoop(undefined)
    const resumed = await h.resume((await h.earlierSession(source)).session, 'lookalike')
    await send(resumed)
    expect(systemPrompts(resumed.session).at(-1)).toContain(SOURCE_PROMPT)
    expect(systemPrompts(resumed.session).at(-1)).not.toContain('/old/')
  })

  it('keeps a fresh Session prompt stable and the current checkout in logged runtime context', async () => {
    const h = await promptLoop(undefined)
    const agent = await h.harness.create(SessionId('fresh'), ROUTE)
    await send(agent)
    const logged = systemPrompts(agent.session)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toContain(SOURCE_PROMPT)
    expect(logged[0]).not.toContain(fileURLToPath(new URL('../../../../', import.meta.url)))
    const resumed = await h.resume(agent.session, 'fresh-resumed')
    await send(resumed)
    expect(systemPrompts(resumed.session)).toEqual(logged)
    expect(requestSystemPrompts(h.adapter.requests.at(-1))).toEqual(logged)
    expect(latestRuntimeContext(resumed.session)).toContain('Current DeepSeek Harness implementation checkout: "')
  })
})
