/** Exercise the real pi-ai WebSocket cache with a local, account-free transport. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { FileCredentialStore, OpenAICodexAdapter, resolveSpec } from '../src/index.ts'

class Socket extends EventTarget {
  static instances: Socket[] = []
  static onCreate: (() => void) | undefined
  readyState = 0
  constructor() {
    super()
    Socket.instances.push(this)
    if (Socket.onCreate === undefined) queueMicrotask(() => { this.open() })
    else Socket.onCreate()
  }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')) }
  send() {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
      type: 'response.completed', response: { id: 'response-test', status: 'completed', output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
    }) })))
  }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
}

const adapters: OpenAICodexAdapter[] = []
let root: string | undefined
afterEach(async () => {
  await Promise.all(adapters.splice(0).map(adapter => adapter.dispose()))
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Socket.instances = []
  Socket.onCreate = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

it('reuses sockets within an adapter and closes only owned cached sessions on disposal', async () => {
  vi.stubGlobal('WebSocket', Socket)
  root = await mkdtemp(join(tmpdir(), 'codex-transport-'))
  const spec = resolveSpec({ dshHome: root })
  const jwt = `test.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } })).toString('base64url')}.test`
  await new FileCredentialStore(spec.credentialsPath).modify('openai-codex', async () => ({
    type: 'oauth', access: jwt, refresh: 'test-refresh', expires: Date.now() + 3600_000, accountId: 'test-account',
  }))
  const catalog = async () => new Response(JSON.stringify({ models: [] }))
  const first = new OpenAICodexAdapter(spec, catalog)
  const second = new OpenAICodexAdapter(spec, catalog)
  adapters.push(first, second)
  const options: GenerateOptions = { provider: 'lingxi-openai-codex', model: 'gpt-5.6-terra', messages: [],
    sessionId: 'same-session' as NonNullable<GenerateOptions['sessionId']> }
  const drain = async (stream: AsyncIterable<unknown>) => { for await (const _chunk of stream) { /* drain */ } }
  let bothCreated!: () => void
  const connecting = new Promise<void>((resolve) => { bothCreated = resolve })
  Socket.onCreate = () => { if (Socket.instances.length === 2) bothCreated() }
  const concurrent = Promise.all([drain(first.stream(options)), drain(first.stream(options))])
  await connecting
  Socket.onCreate = undefined
  for (const socket of Socket.instances) socket.open()
  await concurrent
  const prepared = await first.prepareCall(options.provider, options.model)
  await drain(prepared.stream(options))
  expect(Socket.instances).toHaveLength(2)
  expect(Socket.instances[0]?.readyState).toBe(1)
  await drain(second.stream(options))
  expect(Socket.instances).toHaveLength(3)
  await first.dispose()
  expect(Socket.instances.map(socket => socket.readyState)).toEqual([3, 3, 1])
  await second.dispose()
  expect(Socket.instances.map(socket => socket.readyState)).toEqual([3, 3, 3])
  await expect(drain(first.stream(options))).rejects.toThrow('Codex adapter disposed')
})
