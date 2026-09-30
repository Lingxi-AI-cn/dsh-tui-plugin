/** Redacted Provider Center snapshot collection. */

import { describe, expect, it, vi } from 'vitest'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsDescriptor } from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'
import {
  collectTuiProviderCenter,
  canRemoveTuiProvider,
  createTuiCustomProvider,
  discoverTuiCustomProviderModels,
  formatTuiProviderModelDrafts,
  parseTuiProviderModelDrafts,
  saveTuiProviderApiKey,
  saveTuiProviderEndpoint,
  saveTuiProviderProfile,
  removeTuiProviderProfile,
  TuiCustomProviderError,
  TuiProviderApiKeyError,
  TuiProviderProfileError,
  TuiProviderRemoveError,
  tuiProviderOnboardingReadiness,
  validateTuiProviderApiKey,
  validateTuiProviderEndpoint,
  type TuiProviderCenterCollectOptions,
} from '../src/index.ts'

const ns = 'llm-pi-ai' as SettingsDescriptor['ns']
const providerSchema = Schema.object({
  providers: Schema.dict(Schema.object({
    apiKeyEnv: Schema.string(),
    displayName: Schema.string(),
    api: Schema.union([
      Schema.const('openai-completions'),
      Schema.const('openai-responses'),
    ]).required(),
    baseURL: Schema.string().required(),
    models: Schema.array(Schema.object({
      id: Schema.string().required(),
      name: Schema.string(),
      contextWindow: Schema.natural(),
      maxTokens: Schema.natural(),
    })).required(),
  })),
})

function options(
  overrides: Partial<TuiProviderCenterCollectOptions> = {},
): TuiProviderCenterCollectOptions {
  return {
    llm: {
      listProviders: () => [{ id: 'openai', name: 'OpenAI' }, { id: 'codex', name: 'Codex' }],
      listConfigurableProviders: () => [{
        provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai',
        settingsPath: ['providers', 'openai'], declared: false,
      }, {
        provider: 'gateway', displayName: 'Gateway', settingsNs: 'llm-pi-ai',
        settingsPath: ['providers', 'gateway'], declared: true,
      }],
      authentication: provider => Promise.resolve(provider === 'openai'
        ? { configured: true, source: 'file', methods: [] }
        : { configured: false, methods: [{ id: 'oauth', name: 'Sign in' }] }),
      listModels: provider => Promise.resolve(provider === 'openai' ? [{ id: 'gpt' }] : [{ id: 'codex' }]),
    },
    settings: {
      writable: true,
      describe: () => [{
        ns,
        autoGenerate: true,
        schema: providerSchema.toJSON(),
        value: {
          providers: {
            openai: {
              apiKeyEnv: 'OPENAI_API_KEY',
              baseURL: 'https://user:secret@example.test/v1?token=secret#private',
              models: [{ id: 'gpt' }],
            },
            gateway: { apiKeyEnv: 'GATEWAY_API_KEY', models: [{ id: 'one' }, { id: 'two' }] },
          },
        },
        user: { providers: { gateway: { apiKeyEnv: 'GATEWAY_API_KEY' } } },
        revision: 3,
        applies: 'live',
      }],
    },
    credentials: {
      describe: ref => Promise.resolve({
        configured: ref === 'OPENAI_API_KEY',
        ...(ref === 'OPENAI_API_KEY' ? { source: 'file' } : {}),
        writable: true,
      }),
    },
    credentialRef: value => value as CredentialRef,
    ...overrides,
  }
}

describe('native TUI Provider Center snapshot', () => {
  it('joins live routes, configurable directory, redacted settings, and value-free credentials', async () => {
    const snapshot = await collectTuiProviderCenter(options())

    expect(snapshot.capabilities).toEqual({ settings: true, settingsWritable: true, credentials: true })
    expect(snapshot.creationTargets).toEqual([{
      namespace: 'llm-pi-ai',
      path: ['providers'],
      revision: 3,
      writable: true,
      protocols: ['openai-completions', 'openai-responses'],
      existingProviderIds: ['openai', 'gateway'],
    }])
    expect(snapshot.providers.map(provider => provider.id)).toEqual(['openai', 'gateway', 'codex'])
    expect(snapshot.providers[0]).toMatchObject({
      active: true,
      authentication: 'configured',
      authenticationSource: 'file',
      modelCount: 1,
      settings: {
        namespace: 'llm-pi-ai',
        path: ['providers', 'openai'],
        registered: true,
        writable: true,
        applies: 'live',
        revision: 3,
        userOverride: false,
        endpoint: 'https://example.test/v1',
        configuredModelCount: 1,
        credentialReferenceStored: true,
        credential: { ref: 'OPENAI_API_KEY', configured: true, writable: true, source: 'file' },
        editable: {
          displayNameSupported: false,
          protocolSupported: false,
          modelsSupported: true,
          protocols: [],
          models: [{ id: 'gpt' }],
        },
      },
    })
    expect(JSON.stringify(snapshot)).not.toContain('secret')
    expect(snapshot.providers[1]).toMatchObject({
      active: false,
      declared: true,
      authentication: 'dormant',
      settings: {
        userOverride: true,
        configuredModelCount: 2,
        credentialReferenceStored: true,
        credential: { ref: 'GATEWAY_API_KEY', configured: false, writable: true },
      },
    })
    expect(snapshot.providers[2]).toMatchObject({
      active: true,
      authentication: 'sign-in-required',
      authenticationMethods: [{ id: 'oauth', name: 'Sign in' }],
    })
  })

  it('contains owner failures as stable issue ids without retaining their messages', async () => {
    const secret = 'sk-owner-error-secret'
    const snapshot = await collectTuiProviderCenter(options({
      llm: {
        listProviders: () => [{ id: 'broken', name: `Broken\u001B]52;c;${secret}\u0007` }],
        listConfigurableProviders: () => [{
          provider: 'broken', displayName: 'Broken', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'broken'],
        }],
        authentication: () => Promise.reject(new Error(secret)),
        listModels: () => Promise.reject(new Error(secret)),
      },
      settings: {
        writable: false,
        describe: () => { throw new Error(secret) },
      },
      credentials: {
        describe: () => Promise.reject(new Error(secret)),
      },
    }))

    expect(snapshot.providers[0]).toMatchObject({
      id: 'broken',
      authentication: 'unavailable',
      issues: ['settings-unavailable', 'credential-unavailable', 'authentication-unavailable', 'models-unavailable'],
    })
    expect(JSON.stringify(snapshot)).not.toContain(secret)
    expect(JSON.stringify(snapshot)).not.toContain('\u001b')
  })

  it('preserves cancellation and bounds an untrusted provider directory', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(collectTuiProviderCenter(options({ signal: controller.signal }))).rejects.toThrow('cancelled')

    const list = Array.from({ length: 140 }, (_, index) => ({
      provider: `p-${index}`, displayName: `Provider ${index}`, settingsNs: 'llm-pi-ai', settingsPath: ['providers', `p-${index}`],
    }))
    const { settings: _s, credentials: _c, ...base } = options()
    const snapshot = await collectTuiProviderCenter({
      ...base,
      llm: {
        listProviders: () => [],
        listConfigurableProviders: () => list,
        authentication: vi.fn(),
        listModels: vi.fn(),
      },
    })
    expect(snapshot.providers).toHaveLength(128)
    expect(snapshot.omittedProviders).toBe(12)
    expect(snapshot.capabilities).toEqual({ settings: false, settingsWritable: false, credentials: false })
  })

  it('validates masked API-key drafts without retaining rejected values', () => {
    expect(validateTuiProviderApiKey('  sk-valid_123  ')).toBe('sk-valid_123')
    const secrets = [' ', 'OPENAI_API_KEY=sk-secret', '"sk-secret"', '含中文的密钥']
    for (const secret of secrets) {
      let failure: unknown
      try {
        validateTuiProviderApiKey(secret)
      } catch (error: unknown) {
        failure = error
      }
      expect(failure).toBeInstanceOf(TuiProviderApiKeyError)
      if (secret.trim().length > 2) expect(String(failure)).not.toContain(secret.trim())
    }
  })

  it('stores an existing credential without rewriting settings', async () => {
    const snapshot = await collectTuiProviderCenter(options())
    const row = snapshot.providers[0]!
    const mutate = vi.fn()
    const set = vi.fn(() => Promise.resolve())
    await expect(saveTuiProviderApiKey(row, '  sk-next  ', {
      settings: { mutate }, credentials: { set },
    })).resolves.toEqual({ ref: 'OPENAI_API_KEY' })
    expect(mutate).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith('OPENAI_API_KEY', 'sk-next')
  })

  it('records a derived reference before storing a new key and contains partial failures', async () => {
    const snapshot = await collectTuiProviderCenter(options({
      settings: {
        writable: true,
        describe: () => [{
          ns,
          autoGenerate: true,
          schema: providerSchema.toJSON(),
          value: { providers: { gateway: { models: [{ id: 'one' }] } } },
          revision: 8,
          applies: 'live',
        }],
      },
    }))
    const row = snapshot.providers.find(provider => provider.id === 'gateway')!
    expect(row.settings).toMatchObject({
      credentialReferenceStored: false,
      credential: { ref: 'GATEWAY_API_KEY', configured: false, writable: true },
    })
    const mutate = vi.fn(() => Promise.resolve())
    const secret = 'sk-partial-secret'
    const set = vi.fn(() => Promise.reject(new Error(secret)))
    let failure: unknown
    try {
      await saveTuiProviderApiKey(row, secret, { settings: { mutate }, credentials: { set } })
    } catch (error: unknown) {
      failure = error
    }
    expect(mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'set', path: ['providers', 'gateway', 'apiKeyEnv'], value: 'GATEWAY_API_KEY',
    }], 8)
    expect(set).toHaveBeenCalledWith('GATEWAY_API_KEY', secret)
    expect(failure).toMatchObject({ code: 'credential-write-failed' })
    expect(String(failure)).not.toContain(secret)
  })

  it('sets and resets an absolute provider endpoint with the snapshot revision', async () => {
    const snapshot = await collectTuiProviderCenter(options())
    const row = snapshot.providers[0]!
    const mutate = vi.fn(() => Promise.resolve())
    expect(validateTuiProviderEndpoint(' https://gateway.example/v1 ')).toBe('https://gateway.example/v1')
    await saveTuiProviderEndpoint(row, ' https://gateway.example/v1 ', { mutate })
    expect(mutate).toHaveBeenLastCalledWith('llm-pi-ai', [{
      op: 'set', path: ['providers', 'openai', 'baseURL'], value: 'https://gateway.example/v1',
    }], 3)
    await saveTuiProviderEndpoint(row, undefined, { mutate })
    expect(mutate).toHaveBeenLastCalledWith('llm-pi-ai', [{
      op: 'unset', path: ['providers', 'openai', 'baseURL'],
    }], 3)
  })

  it('edits the reviewed existing-profile fields at one revision and preserves hidden model fields', async () => {
    const fixtureOptions = options({
      settings: {
        writable: true,
        describe: () => [{
          ns,
          autoGenerate: true,
          schema: providerSchema.toJSON(),
          value: { providers: { gateway: {
            apiKeyEnv: 'GATEWAY_API_KEY', displayName: 'Before', api: 'openai-completions',
            models: [{ id: 'one', name: 'One', input: ['image'] }, { id: 'two' }],
          } } },
          user: { providers: { gateway: { displayName: 'Before' } } },
          revision: 11,
          applies: 'live',
        }],
      },
    })
    const snapshot = await collectTuiProviderCenter(fixtureOptions)
    const row = snapshot.providers.find(provider => provider.id === 'gateway')!
    const mutate = vi.fn(() => Promise.resolve())
    const settings = fixtureOptions.settings
    if (settings === undefined) throw new Error('settings fixture missing')
    await saveTuiProviderProfile(row, {
      displayName: 'After',
      protocol: 'openai-responses',
      models: [{ id: 'one', name: 'One renamed', contextWindow: 64_000 }, { id: 'three' }],
    }, { describe: namespace => settings.describe(namespace), mutate })
    expect(mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'set', path: ['providers', 'gateway', 'displayName'], value: 'After',
    }, {
      op: 'set', path: ['providers', 'gateway', 'api'], value: 'openai-responses',
    }, {
      op: 'set', path: ['providers', 'gateway', 'models'], value: [
        { id: 'one', name: 'One renamed', input: ['image'], contextWindow: 64_000 },
        { id: 'three' },
      ],
    }], 11)
  })

  it('round-trips the terminal model-table syntax including optional capacities', () => {
    const models = [
      { id: 'model-a', name: 'Model A', contextWindow: 128_000, maxTokens: 8_192 },
      { id: 'model-b', maxTokens: 4_096 },
    ]
    expect(parseTuiProviderModelDrafts(formatTuiProviderModelDrafts(models))).toEqual(models)
    expect(() => parseTuiProviderModelDrafts('model-a|||0')).toThrow(TuiProviderProfileError)
    expect(() => parseTuiProviderModelDrafts('model-a; model-a')).toThrow(TuiProviderProfileError)
  })

  it('retains the profile draft boundary when the owner revision changed', async () => {
    const fixtureOptions = options()
    const row = (await collectTuiProviderCenter(fixtureOptions)).providers[0]!
    await expect(saveTuiProviderProfile(row, {
      displayName: 'Retained in UI', protocol: 'openai-responses', models: [{ id: 'gpt' }],
    }, {
      describe: () => fixtureOptions.settings!.describe({ redactSecrets: true }).map(descriptor => ({
        ...descriptor, revision: descriptor.revision + 1,
      })),
      mutate: vi.fn(),
    })).rejects.toBeInstanceOf(TuiProviderProfileError)
  })

  it('removes only hand-declared user profiles and their exact conventional writable credential', async () => {
    const fixtureOptions = options({
      credentials: {
        describe: ref => Promise.resolve({
          configured: ref === 'GATEWAY_API_KEY', source: 'file', writable: true,
        }),
      },
    })
    const row = (await collectTuiProviderCenter(fixtureOptions)).providers.find(provider => provider.id === 'gateway')!
    expect(canRemoveTuiProvider(row)).toBe(true)
    const calls: string[] = []
    const unset = vi.fn(() => { calls.push('credential'); return Promise.resolve() })
    const mutate = vi.fn(() => { calls.push('settings'); return Promise.resolve() })
    await removeTuiProviderProfile(row, { credentials: { set: vi.fn(), unset }, settings: { mutate } })
    expect(unset).toHaveBeenCalledWith('GATEWAY_API_KEY')
    expect(mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'unset', path: ['providers', 'gateway'],
    }], 3)
    expect(calls).toEqual(['settings', 'credential'])
    expect(canRemoveTuiProvider((await collectTuiProviderCenter(fixtureOptions)).providers[0]!)).toBe(false)
  })

  it('does not delete an environment or custom credential while removing a profile', async () => {
    const fixtureOptions = options({
      settings: {
        writable: true,
        describe: () => [{
          ns, autoGenerate: true, schema: providerSchema.toJSON(),
          value: { providers: { gateway: { apiKeyEnv: 'SHARED_API_KEY', models: [{ id: 'one' }] } } },
          user: { providers: { gateway: { apiKeyEnv: 'SHARED_API_KEY' } } }, revision: 14, applies: 'live',
        }],
      },
      credentials: { describe: () => Promise.resolve({ configured: true, source: 'env', writable: false }) },
    })
    const row = (await collectTuiProviderCenter(fixtureOptions)).providers.find(provider => provider.id === 'gateway')!
    const unset = vi.fn()
    const mutate = vi.fn(() => Promise.resolve())
    await removeTuiProviderProfile(row, { credentials: { set: vi.fn(), unset }, settings: { mutate } })
    expect(unset).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('never deletes a still-referenced credential when the profile revision conflicts', async () => {
    const fixtureOptions = options({
      credentials: { describe: () => Promise.resolve({ configured: true, source: 'file', writable: true }) },
    })
    const row = (await collectTuiProviderCenter(fixtureOptions)).providers.find(provider => provider.id === 'gateway')!
    const unset = vi.fn()
    await expect(removeTuiProviderProfile(row, {
      settings: { mutate: () => Promise.reject(Object.assign(new Error('stale'), { code: 'SETTINGS_CONFLICT' })) },
      credentials: { set: vi.fn(), unset },
    })).rejects.toMatchObject({ code: 'settings-conflict' })
    expect(unset).not.toHaveBeenCalled()
  })

  it('contains provider write and removal owner failures without retaining their secret messages', async () => {
    const secret = 'sk-owner-failure-secret'
    const fixtureOptions = options({
      credentials: { describe: () => Promise.resolve({ configured: true, writable: true }) },
    })
    const rows = (await collectTuiProviderCenter(fixtureOptions)).providers
    const openai = rows.find(provider => provider.id === 'openai')!
    const gateway = rows.find(provider => provider.id === 'gateway')!
    let keyFailure: unknown
    try {
      await saveTuiProviderApiKey(openai, secret, {
        credentials: { set: () => Promise.reject(new Error(secret)) },
      })
    } catch (error: unknown) { keyFailure = error }
    expect(String(keyFailure)).not.toContain(secret)

    let removeFailure: unknown
    try {
      await removeTuiProviderProfile(gateway, {
        settings: { mutate: vi.fn() },
        credentials: { set: vi.fn(), unset: () => Promise.reject(new Error(secret)) },
      })
    } catch (error: unknown) { removeFailure = error }
    expect(removeFailure).toBeInstanceOf(TuiProviderRemoveError)
    expect(String(removeFailure)).not.toContain(secret)
  })

  it('rejects an invalid endpoint without retaining it in the error', () => {
    const invalid = 'file:///secret-provider-path'
    expect(() => validateTuiProviderEndpoint(invalid)).toThrow(/invalid-endpoint/u)
    try {
      validateTuiProviderEndpoint(invalid)
    } catch (error: unknown) {
      expect(String(error)).not.toContain(invalid)
    }
  })

  it('creates a schema-targeted custom provider and stores an optional key separately', async () => {
    const snapshot = await collectTuiProviderCenter(options())
    const target = snapshot.creationTargets[0]!
    const mutate = vi.fn(() => Promise.resolve())
    const set = vi.fn(() => Promise.resolve())
    const secret = 'sk-custom-secret'
    await expect(createTuiCustomProvider(target, {
      id: 'acme-gateway',
      displayName: 'Acme Gateway',
      baseURL: ' https://gateway.example/v1 ',
      protocol: 'openai-responses',
      apiKey: secret,
      models: [{ id: 'acme-1', name: 'Acme One', contextWindow: 128_000, maxTokens: 8_192 }],
    }, { settings: { mutate }, credentials: { set } })).resolves.toEqual({
      id: 'acme-gateway', credentialStored: true,
    })
    expect(mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'acme-gateway'],
      value: {
        displayName: 'Acme Gateway',
        apiKeyEnv: 'ACME_GATEWAY_API_KEY',
        api: 'openai-responses',
        baseURL: 'https://gateway.example/v1',
        models: [{ id: 'acme-1', name: 'Acme One', contextWindow: 128_000, maxTokens: 8_192 }],
      },
    }], 3)
    expect(set).toHaveBeenCalledWith('ACME_GATEWAY_API_KEY', secret)
  })

  it('can create a provider-native route without materializing a credential reference', async () => {
    const target = (await collectTuiProviderCenter(options())).creationTargets[0]!
    const mutate = vi.fn(() => Promise.resolve())
    const set = vi.fn(() => Promise.resolve())
    await expect(createTuiCustomProvider(target, {
      id: 'ambient-auth', displayName: 'Ambient Auth', baseURL: 'https://ambient.example/v1',
      protocol: 'openai-completions', models: [{ id: 'ambient-1' }],
    }, { settings: { mutate }, credentials: { set } })).resolves.toEqual({
      id: 'ambient-auth', credentialStored: false,
    })
    const ops = (mutate.mock.calls as unknown[][])[0]?.[1] as readonly { value?: unknown }[]
    expect(ops?.[0]?.value).not.toHaveProperty('apiKeyEnv')
    expect(set).not.toHaveBeenCalled()
  })

  it('interrogates a staged endpoint without persistence and bounds valid candidates', async () => {
    const target = (await collectTuiProviderCenter(options())).creationTargets[0]!
    const discoverModels = vi.fn(() => Promise.resolve([
      { id: 'model-a', name: 'Model A', contextWindow: 32_000 },
      { id: 'model-a', name: 'duplicate' },
      { id: 'bad model' },
      { id: 'model-b', maxTokens: 4_096 },
    ]))
    const secret = 'sk-discovery-secret'
    await expect(discoverTuiCustomProviderModels(target, {
      id: 'acme-discovery', displayName: 'Acme Discovery', baseURL: 'https://discover.example/v1',
      protocol: 'openai-completions', apiKey: secret, models: [],
    }, { discoverModels })).resolves.toEqual([
      { id: 'model-a', name: 'Model A', contextWindow: 32_000 },
      { id: 'model-b', maxTokens: 4_096 },
    ])
    expect(discoverModels).toHaveBeenCalledWith('llm-pi-ai', {
      baseURL: 'https://discover.example/v1', api: 'openai-completions', apiKey: secret,
    })
  })

  it('contains custom-provider validation and owner failures without retaining secrets', async () => {
    const target = (await collectTuiProviderCenter(options())).creationTargets[0]!
    await expect(createTuiCustomProvider(target, {
      id: 'gateway', displayName: 'Taken', baseURL: 'https://taken.example/v1',
      protocol: 'openai-completions', models: [{ id: 'one' }],
    }, { settings: { mutate: vi.fn() } })).rejects.toMatchObject({ code: 'id-taken' })

    const secret = 'sk-owner-discovery-secret'
    let failure: unknown
    try {
      await discoverTuiCustomProviderModels(target, {
        id: 'broken-route', displayName: 'Broken Route', baseURL: 'https://broken.example/v1',
        protocol: 'openai-completions', apiKey: secret, models: [],
      }, { discoverModels: () => Promise.reject(new Error(secret)) })
    } catch (error: unknown) {
      failure = error
    }
    expect(failure).toBeInstanceOf(TuiCustomProviderError)
    expect(failure).toMatchObject({ code: 'discovery-failed' })
    expect(String(failure)).not.toContain(secret)
  })

  it('opens onboarding only when complete facts prove every provider is unreachable', async () => {
    const ready = await collectTuiProviderCenter(options())
    expect(tuiProviderOnboardingReadiness(ready)).toBe('skip')

    const defaultOptions = options()
    const dormant = await collectTuiProviderCenter(options({
      llm: {
        listProviders: () => [],
        listConfigurableProviders: () => defaultOptions.llm.listConfigurableProviders(),
        authentication: vi.fn(),
        listModels: vi.fn(),
      },
    }))
    expect(tuiProviderOnboardingReadiness(dormant)).toBe('needed')

    const providerOwnedAuth = await collectTuiProviderCenter(options({
      llm: {
        listProviders: () => [{ id: 'codex', name: 'Codex' }],
        listConfigurableProviders: () => [],
        authentication: () => Promise.resolve({
          configured: false, methods: [{ id: 'oauth', name: 'Sign in' }],
        }),
        listModels: () => Promise.resolve([]),
      },
    }))
    expect(tuiProviderOnboardingReadiness(providerOwnedAuth)).toBe('skip')

    const credentialRequired = await collectTuiProviderCenter(options({
      llm: {
        listProviders: () => [{ id: 'openai', name: 'OpenAI' }],
        listConfigurableProviders: () => [{
          provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', 'openai'], declared: false,
        }],
        authentication: () => Promise.resolve({ configured: false, methods: [] }),
        listModels: () => Promise.resolve([]),
      },
      settings: {
        writable: true,
        describe: () => [{
          ns,
          autoGenerate: true,
          schema: providerSchema.toJSON(),
          value: { providers: { openai: { models: [] } } },
          revision: 4,
          applies: 'live',
        }],
      },
      credentials: {
        describe: () => Promise.resolve({ configured: false, writable: true }),
      },
    }))
    expect(credentialRequired.providers[0]).toMatchObject({
      active: true,
      authentication: 'credential-required',
      settings: { credentialReferenceStored: false },
    })
    expect(tuiProviderOnboardingReadiness(credentialRequired)).toBe('needed')

    const unknown = await collectTuiProviderCenter(options({
      llm: {
        listProviders: () => [{ id: 'broken', name: 'Broken' }],
        listConfigurableProviders: () => [],
        authentication: () => Promise.reject(new Error('unavailable')),
        listModels: () => Promise.resolve([]),
      },
    }))
    expect(tuiProviderOnboardingReadiness(unknown)).toBe('unknown')
  })
})
