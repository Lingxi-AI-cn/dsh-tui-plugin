import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import PluginHubRuntime, { PluginId, PluginVersionId } from '@lingxi-ai-cn/dsh-plugin-hub'
import { apply, createFixturePluginHubProvider, type FixtureCatalog } from '@lingxi-ai-cn/dsh-plugin-hub-local'

const item = {
  id: PluginId('plg_fixture'), packageName: '@example/dsh-fixture', displayName: 'Fixture plugin', summary: 'A bounded fixture',
  repository: { provider: 'github', fullName: 'example/dsh-fixture', url: 'https://github.com/example/dsh-fixture', primaryLanguage: 'TypeScript' },
  categories: ['communication' as const], categorySource: 'author' as const, kind: 'plugin' as const, kindSource: 'author' as const,
  surfaces: { declared: ['tui'], verified: ['tui'] }, compatibility: { dsh: '>=0.1.0', match: 'compatible' as const },
  verification: { level: 'manifest-valid' as const, status: 'passed' as const },
  latestVersion: { id: PluginVersionId('ver_fixture'), version: '1.0.0', installable: true },
}

describe('fixture Plugin Hub provider', () => {
  it('searches and opens a detail without network access', async () => {
    const catalog: FixtureCatalog = { revision: 7, items: [item] }
    const provider = createFixturePluginHubProvider(catalog)
    expect(provider.profileMutations).toBe(false)
    await expect(provider.search({ query: 'fixture' })).resolves.toMatchObject({ catalogRevision: 7, items: [{ packageName: '@example/dsh-fixture' }] })
    await expect(provider.plugin(item.id)).resolves.toMatchObject({ versions: [{ version: '1.0.0' }] })
  })

  it('exposes discovery repositories separately from installable catalog rows', async () => {
    const provider = createFixturePluginHubProvider({
      revision: 7, items: [item], repositories: [{
        id: 'repo_fixture', repository: { provider: 'github', fullName: 'example/discovery', url: 'https://github.com/example/discovery', primaryLanguage: 'TypeScript' },
        stars: 12, forks: 1, topics: ['dsh-plugin'], catalogState: 'candidate', stateReason: null, observedAt: '2026-08-19T00:01:00Z', installable: false,
        sync: { headSha: 'a'.repeat(40), lastSeenAt: '2026-08-19T00:00:00Z', lastSyncedAt: '2026-08-19T00:01:00Z' },
        scan: { status: 'never', scannerVersion: null, sourceCommit: null, packageCount: 0, updatedAt: null, errorCode: null, errorSummary: null, rejectionCodes: [] },
        packages: { total: 0, active: 0, rejected: 0 }, published: { projectionCount: 0, installableCount: 0, revision: null },
      }],
    })
    await expect(provider.searchRepositories({ sort: 'stars' })).resolves.toMatchObject({ items: [{ id: 'repo_fixture', catalogState: 'candidate' }] })
    await expect(provider.search({ sort: 'stars' })).resolves.toMatchObject({ items: [{ id: item.id }] })
  })

  it('defaults Registry providers to catalog-only profile access', async () => {
    const ctx = new Context()
    await ctx.plugin(PluginHubRuntime)
    apply(ctx, { registryUrl: 'http://127.0.0.1:65535', allowLoopbackHttp: true })
    expect(ctx.pluginHub.supportsProfileMutations()).toBe(false)
    await expect(ctx.pluginHub.planInstall(PluginId('plg_fixture'), PluginVersionId('ver_fixture')))
      .rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
    await expect(ctx.pluginHub.markMaintenanceReady()).resolves.toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('sorts fixture pages and binds opaque cursors to the ordering', async () => {
    const catalog: FixtureCatalog = {
      revision: 8,
      items: [
        { ...item, stars: 10, updatedAt: '2026-08-16T00:00:00Z', latestVersion: { ...item.latestVersion, publishedAt: '2026-08-16T00:00:00Z' } },
        { ...item, id: PluginId('plg_new'), packageName: '@example/dsh-new', stars: 60,
          updatedAt: '2026-08-18T00:00:00Z', latestVersion: { ...item.latestVersion, id: PluginVersionId('ver_new'), publishedAt: '2026-08-18T00:00:00Z' } },
      ],
    }
    const provider = createFixturePluginHubProvider(catalog)
    const first = await provider.search({ sort: 'stars', limit: 1 })
    expect(first.items.map(plugin => plugin.id)).toEqual([PluginId('plg_new')])
    expect(first.nextCursor).toBe('fixture:stars:1')
    const second = await provider.search({ sort: 'stars', cursor: first.nextCursor, limit: 1 })
    expect(second.items).toMatchObject([{ id: PluginId('plg_fixture') }])
    expect(second.nextCursor).toBeUndefined()
    await expect(provider.search({ sort: 'updated', cursor: first.nextCursor, limit: 1 }))
      .rejects.toMatchObject({ code: 'INVALID_CURSOR' })
  })

  it('mounts only when explicitly given a fixture provider', async () => {
    const ctx = new Context()
    await ctx.plugin(PluginHubRuntime)
    apply(ctx, { fixture: { items: [item] } })
    expect(ctx.pluginHub.hasProvider()).toBe(true)
    expect(ctx.pluginHub.supportsProfileMutations()).toBe(false)
    await expect(ctx.pluginHub.search({ query: '' })).resolves.toMatchObject({ items: [{ id: 'plg_fixture' }] })
  })

  it('uses Registry discovery metadata for fixture filters without inferring missing values', async () => {
    const provider = createFixturePluginHubProvider({ items: [item, {
      ...item, id: PluginId('plg_other'), packageName: '@example/other', categories: ['development'],
      kind: 'tool', repository: { ...item.repository, primaryLanguage: 'Rust' },
    }] })
    await expect(provider.search({ category: 'communication' })).resolves.toMatchObject({ items: [{ id: item.id }] })
    await expect(provider.search({ kind: 'tool' })).resolves.toMatchObject({ items: [{ id: 'plg_other' }] })
    await expect(provider.search({ language: 'typescript' })).resolves.toMatchObject({ items: [{ id: item.id }] })
    await expect(provider.search({ category: 'vision' })).resolves.toMatchObject({ items: [] })
  })
})

describe('signed Registry snapshot fallback', () => {
  it('accepts a trusted Ed25519 snapshot when live search is unavailable', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const unsigned = {
      apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 9, generatedAt: '2026-08-18T00:00:00Z',
      plugins: [{ ...item, summary: '' }], advisories: [], keyId: 'fixture-key',
    }
    const snapshot = { ...unsigned, signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString('base64url') }
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8')
      if (request.url?.startsWith('/v1/plugins') === true) {
        response.statusCode = 503
        response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', error: { code: 'UPSTREAM_UNAVAILABLE', message: 'offline' } }))
        return
      }
      response.end(JSON.stringify(snapshot))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('fixture server did not bind TCP')
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${address.port}`, allowLoopbackHttp: true,
        trustedKeys: [{ keyId: 'fixture-key', publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() }] })
      await expect(ctx.pluginHub.search({ query: 'fixture' })).resolves.toMatchObject({
        catalogRevision: 9, stale: true, items: [{ id: 'plg_fixture' }],
      })
      await ctx.fiber.dispose()
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      }))
    }
  })
})

describe('Registry request bounds and cache behavior', () => {
  it('honors a caller that is already cancelled without opening a request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end('{}')
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      const controller = new AbortController()
      controller.abort(new Error('cancelled before request'))
      await expect(ctx.pluginHub.search({ query: 'fixture' }, controller.signal)).rejects.toMatchObject({ code: 'OPERATION_ABORTED' })
      expect(requests).toBe(0)
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('uses one timeout budget across redirects and classifies it as unavailable', async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', data: { items: [] } })), 100)
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true, requestTimeoutMs: 20 })
      await expect(ctx.pluginHub.status()).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' })
      await ctx.fiber.dispose()
    } finally {
      server.closeAllConnections()
      await close(server)
    }
  })

  it('rejects a redirect to a different host and oversized response bodies', async () => {
    const redirectServer = createServer((_request, response) => {
      response.statusCode = 302
      response.setHeader('location', 'https://example.com/catalog')
      response.end()
    })
    const redirectPort = await listen(redirectServer)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${redirectPort}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.status()).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' })
      await ctx.fiber.dispose()
    } finally {
      await close(redirectServer)
    }

    const oversizedServer = createServer((_request, response) => {
      response.setHeader('content-length', '100')
      response.end('{"apiVersion":"dsh.plugin-hub/v1"}')
    })
    const oversizedPort = await listen(oversizedServer)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${oversizedPort}`, allowLoopbackHttp: true, maxResponseBytes: 10 })
      await expect(ctx.pluginHub.status()).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
      await ctx.fiber.dispose()
    } finally {
      await close(oversizedServer)
    }
  })

  it('preserves a same-origin redirect target path and query', async () => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(request.url ?? '')
      if (request.url === '/v1/meta') {
        response.statusCode = 302
        response.setHeader('location', '/redirected/meta?source=registry')
        response.end()
        return
      }
      response.end(JSON.stringify({
        apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 4, generatedAt: '2026-08-18T00:00:00Z',
      }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.status()).resolves.toMatchObject({ catalogRevision: 4 })
      expect(requests).toEqual(['/v1/meta', '/redirected/meta?source=registry'])
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('classifies fetch transport failures as Registry unavailability', async () => {
    const server = createServer((request) => { request.socket.destroy() })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.status()).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' })
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('does not let last-good entries hide unsupported responses or missing details', async () => {
    let valid = true
    const server = createServer((request, response) => {
      if (request.url === '/v1/plugins/plg_fixture') {
        if (!valid) {
          response.statusCode = 404
          response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1' }))
          return
        }
        response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', data: { ...item, versions: [item.latestVersion] } }))
        return
      }
      response.end(JSON.stringify(valid
        ? { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: { items: [item] } }
        : { apiVersion: 'dsh.plugin-hub/v2', catalogRevision: 2, data: { items: [item] } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.search({ query: 'fixture' })).resolves.toMatchObject({ catalogRevision: 1 })
      await expect(ctx.pluginHub.plugin(item.id)).resolves.toMatchObject({ id: 'plg_fixture' })
      valid = false
      await expect(ctx.pluginHub.search({ query: 'fixture' })).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
      await expect(ctx.pluginHub.plugin(item.id)).rejects.toMatchObject({ code: 'PLUGIN_NOT_FOUND' })
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('maps the Registry detail validation matrix and quarantine object', async () => {
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8')
      if (request.url === '/v1/plugins/plg_fixture') {
        response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', data: {
          ...item,
          verification: undefined,
          latestVersion: null,
          validationMatrix: [{ level: 'manifest', status: 'passed' }],
          repository: { ...item.repository, archived: true },
          os: { declared: ['darwin', 'linux'], verified: ['darwin'] },
          curation: {
            policyRevision: 'policy-2026-08', notes: 'Review publisher ownership.',
            curatedAt: '2026-08-18T00:00:00.000Z', reviewer: 'not-public',
          },
          advisories: [{ id: 'adv_1', severity: 'high', reason: 'Publisher changed.',
            recommendedAction: 'Confirm ownership before installation.' }],
          quarantine: { active: false, reason: null },
        } }))
        return
      }
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: { items: [item] } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.plugin(item.id)).resolves.toMatchObject({
        verification: { level: 'curated', status: 'passed' }, latestVersion: undefined, quarantined: false,
        repository: { archived: true },
        os: { declared: ['darwin', 'linux'], verified: ['darwin'] },
        curation: {
          policyRevision: 'policy-2026-08', notes: 'Review publisher ownership.',
          curatedAt: '2026-08-18T00:00:00.000Z',
        },
        advisories: [{ id: 'adv_1', severity: 'high', reason: 'Publisher changed.',
          recommendedAction: 'Confirm ownership before installation.' }],
      })
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it.each([
    { label: 'OS', detail: { os: { declared: ['darwin'], verified: [42] } } },
    { label: 'curation', detail: { curation: { policyRevision: 'policy-1', curatedAt: 42 } } },
    { label: 'advisory object', detail: { advisories: ['legacy string advisory'] } },
    { label: 'advisory severity', detail: { advisories: [{ id: 'adv_1', severity: 'urgent', reason: 'bad' }] } },
    { label: 'archived repository', detail: { repository: { ...item.repository, archived: 'yes' } } },
  ])('rejects malformed Registry detail $label fields', async ({ detail }) => {
    const server = createServer((_request, response) => {
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', data: {
        ...item, versions: [item.latestVersion], ...detail,
      } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.plugin(item.id)).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('preserves caller cancellation while requesting a snapshot fallback', async () => {
    let snapshotStarted!: () => void
    const started = new Promise<void>((resolve) => { snapshotStarted = resolve })
    const server = createServer((request, response) => {
      if (request.url?.startsWith('/v1/plugins') === true) {
        response.statusCode = 503
        response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1' }))
        return
      }
      snapshotStarted()
      setTimeout(() => response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1' })), 200)
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      const controller = new AbortController()
      const search = ctx.pluginHub.search({ query: 'fixture' }, controller.signal)
      await started
      controller.abort(new Error('cancel snapshot'))
      await expect(search).rejects.toMatchObject({ code: 'OPERATION_ABORTED' })
      await ctx.fiber.dispose()
    } finally {
      server.closeAllConnections()
      await close(server)
    }
  })

  it('requires the search data.items response field and reuses ETag entries without stale fallback', async () => {
    let requests = 0
    const server = createServer((request, response) => {
      requests += 1
      if (request.headers['if-none-match'] === 'fixture-etag') {
        response.statusCode = 304
        response.end()
        return
      }
      response.setHeader('etag', 'fixture-etag')
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: { items: [item] } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      const first = await ctx.pluginHub.search({ query: 'fixture' })
      const second = await ctx.pluginHub.search({ query: 'fixture' })
      expect(first).toMatchObject({ items: [{ id: 'plg_fixture' }] })
      expect(second).toEqual(first)
      expect(second).not.toHaveProperty('stale')
      expect(requests).toBe(2)
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }

    const malformedServer = createServer((_request, response) => {
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: {} }))
    })
    const malformedPort = await listen(malformedServer)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${malformedPort}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.search({ query: 'fixture' })).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
      await ctx.fiber.dispose()
    } finally {
      await close(malformedServer)
    }
  })

  it('forwards sort and keeps differently ordered pages out of the same cache entry', async () => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(request.url ?? '')
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: { items: [item] } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.search({ query: 'fixture', sort: 'stars' })).resolves.toMatchObject({ items: [{ id: item.id }] })
      await expect(ctx.pluginHub.search({ query: 'fixture', sort: 'stars' })).resolves.toMatchObject({ items: [{ id: item.id }] })
      await expect(ctx.pluginHub.search({ query: 'fixture', sort: 'updated' })).resolves.toMatchObject({ items: [{ id: item.id }] })
      expect(requests).toHaveLength(3)
      expect(requests[0]).toContain('sort=stars')
      expect(requests[1]).toContain('sort=stars')
      expect(requests[2]).toContain('sort=updated')
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('forwards discovery filters and keeps them in the cache identity', async () => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(request.url ?? '')
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: { items: [item] } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await ctx.pluginHub.search({ category: 'communication', kind: 'plugin', language: 'TypeScript' })
      await ctx.pluginHub.search({ category: 'communication', kind: 'plugin', language: 'TypeScript' })
      await ctx.pluginHub.search({ category: 'development', kind: 'tool', language: 'Rust' })
      expect(requests).toHaveLength(3)
      expect(requests[0]).toContain('category=communication')
      expect(requests[0]).toContain('kind=plugin')
      expect(requests[0]).toContain('language=TypeScript')
      expect(requests[2]).toContain('category=development')
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('maps Registry invalid cursors to the provider error taxonomy', async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 400
      response.end(JSON.stringify({ apiVersion: 'dsh.plugin-hub/v1', error: { code: 'INVALID_CURSOR' } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.search({ sort: 'stars', cursor: 'registry-cursor' }))
        .rejects.toMatchObject({ code: 'INVALID_CURSOR' })
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })

  it('requires revision and verification fields in search rows', async () => {
    let includeRevision = false
    const server = createServer((_request, response) => {
      response.end(JSON.stringify(includeRevision
        ? { apiVersion: 'dsh.plugin-hub/v1', catalogRevision: 1, data: { items: [{ ...item, verification: undefined }] } }
        : { apiVersion: 'dsh.plugin-hub/v1', data: { items: [item] } }))
    })
    const port = await listen(server)
    try {
      const ctx = new Context()
      await ctx.plugin(PluginHubRuntime)
      apply(ctx, { registryUrl: `http://127.0.0.1:${port}`, allowLoopbackHttp: true })
      await expect(ctx.pluginHub.search({ query: 'fixture' })).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
      includeRevision = true
      await expect(ctx.pluginHub.search({ query: 'fixture' })).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED' })
      await ctx.fiber.dispose()
    } finally {
      await close(server)
    }
  })
})

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture server did not bind TCP')
  return address.port
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => {
    if (error === undefined) resolve()
    else reject(error)
  }))
}
