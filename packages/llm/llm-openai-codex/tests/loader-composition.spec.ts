/** Source Loader regression for official and enhanced Codex coexistence. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Llm from '@deepseek-ai/dsh-llm'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import Authorization from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import * as Codex from '../src/index.ts'
import { DynamicCodexProvider } from '../src/catalog.ts'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

let root: string | undefined
let ctx: Context | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await ctx?.fiber.dispose()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

it('loads both routes and keeps legacy enhanced credentials isolated through logout and unload', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [] }))))
  root = await mkdtemp(join(tmpdir(), 'codex-coexist-'))
  const config = join(root, 'cordis.yml')
  await writeFile(config, [
    '- name: llm',
    '- name: credentials',
    `  config: { dshHome: ${JSON.stringify(root)}, watch: false }`,
    '- name: authorization',
    '- name: pi-ai',
    '  config: { providers: { openai-codex: {} } }',
    '- id: enhanced-codex',
    '  name: enhanced-codex',
    `  config: { dshHome: ${JSON.stringify(root)} }`,
  ].join('\n'))
  ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['llm', Llm], ['credentials', Credentials], ['authorization', Authorization],
    ['pi-ai', PiAi], ['enhanced-codex', Codex],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(name: string) {
      if (!modules.has(name)) throw new Error(`Unexpected module ${name}`)
      return modules.get(name)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  expect(ctx.llm.listProviders().map(provider => provider.id).sort()).toEqual(['lingxi-openai-codex', 'openai-codex'])
  expect(ctx.llm.listProviders()).toContainEqual({ id: 'lingxi-openai-codex', name: 'ChatGPT Codex（Lingxi 增强）' })
  const enhancedKey = credentialKey('llm-openai-codex', 'openai-codex')
  const officialKey = credentialKey('llm-pi-ai', 'openai-codex')
  const grant = { kind: 'grant' as const, payload: {
    type: 'oauth', access: 'test-access', refresh: 'test-refresh', expires: Date.now() + 3600_000, accountId: 'test-account',
  } }
  await ctx.credentials.modifyRecord(enhancedKey, async () => grant)
  await ctx.credentials.modifyRecord(officialKey, async () => grant)
  expect(ctx.authorization.list().map(flow => flow.key)).toEqual(expect.arrayContaining([enhancedKey, officialKey]))
  await expect(ctx.llm.authentication('lingxi-openai-codex')).resolves.toMatchObject({ configured: true })
  const enhanced = await ctx.llm.resolveModelInfo('lingxi-openai-codex', 'gpt-5.6-terra')
  const official = await ctx.llm.resolveModelInfo('openai-codex', 'gpt-5.6-terra')
  expect(enhanced.provider).toBe('lingxi-openai-codex')
  expect(official.provider).toBe('openai-codex')
  const auth = openaiCodexProvider().auth
  if (auth.oauth === undefined) throw new Error('Missing pi-ai OAuth owner')
  const login = vi.fn(async () => ({ ...grant.payload, type: 'oauth' as const, access: 'new-enhanced-access' }))
  vi.spyOn(DynamicCodexProvider.prototype, 'auth', 'get').mockReturnValue({
    ...auth, oauth: { ...auth.oauth, login },
  })
  await ctx.llm.login('lingxi-openai-codex', 'oauth', {
    prompt: async () => 'unused', notify: () => {},
  })
  expect(login).toHaveBeenCalledOnce()
  expect(await ctx.credentials.readRecord(enhancedKey)).toMatchObject({ payload: { access: 'new-enhanced-access' } })
  expect(await ctx.credentials.readRecord(officialKey)).toEqual(grant)
  await ctx.llm.logout('lingxi-openai-codex')
  expect(await ctx.credentials.readRecord(enhancedKey)).toBeUndefined()
  expect(await ctx.credentials.readRecord(officialKey)).toEqual(grant)
  const entry = [...ctx.loader.entries()].find(row => row.options.name === 'enhanced-codex')
  await entry?.fiber?.dispose()
  expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['openai-codex'])
  expect(ctx.authorization.list().map(flow => flow.key)).not.toContain(enhancedKey)
  expect(await ctx.credentials.readRecord(officialKey)).toEqual(grant)
})
