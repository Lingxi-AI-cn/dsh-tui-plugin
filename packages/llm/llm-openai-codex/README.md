---
description: "Provider-owned ChatGPT OAuth, dynamic account model discovery, and streaming for the openai-codex route."
kind: "package-reference"
---

# `@lingxi-ai-cn/dsh-llm-openai-codex`

English | [中文](README.zh.md)

## Summary

Provider-owned ChatGPT OAuth and dynamic account model discovery for the `openai-codex` LLM route. The package reuses pi-ai's OpenAI Codex login, refresh, auth conversion, and streaming implementation while keeping credentials, catalog caching, and the provider-neutral interactive-auth seam owned by DeepSeek Harness.

## Table of Contents

- [Configuration](#configuration)
- [Dynamic model catalog](#dynamic-model-catalog)
- [Credential safety](#credential-safety)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

```yaml
- id: llm-openai-codex
  name: '@lingxi-ai-cn/dsh-llm-openai-codex'
  config:
    dshHome: /path/to/dsh-home
    credentialsPath: /path/to/legacy-openai-codex.json
    modelCachePath: /path/to/openai-codex-models.json
    clientVersion: '0.146.0'
    streamIdleTimeoutMs: 300000
    maxRequestImageBytes: 20971520
```

The normal Host composition stores the OAuth grant through the official scoped credential-record owner at `llm-openai-codex/openai-codex`; only the derivative last-good catalog defaults to `$DSH_HOME/model-catalogs/openai-codex.json`. `credentialsPath` retains the legacy file-store fallback used by direct adapter construction, tests, and older Hosts, but it is not the production credential owner when `ctx.credentials` is available. `clientVersion` is a pinned compatibility header and query value, not a model allowlist; deployments can override it without rebuilding. `streamIdleTimeoutMs` bounds one stalled provider read, while `maxRequestImageBytes` bounds encoded image history passed through the official pi-ai adapter.

The plugin resolves the active Host's durable attachment service at request time and passes it to `PiAiAdapter`. Image-capable Codex routes can therefore read the exact `ImageAttachmentRef` bytes retained by the Session log; a missing service or unavailable object fails before provider I/O instead of silently dropping image content.

The public TUI bundle mounts this route without signing a user in. On current Hosts, the adapter registers an `oauth` flow with `ctx.authorization`, runs provider login through the official authorization-session vocabulary, and reads or removes the grant only through `ctx.credentials`; the TUI exposes that owner through `/models` and `/provider`. The older `ctx.llm.authentication()`, `login()`, and `logout()` bridge remains a bounded compatibility fallback when the authorization owner is absent. API keys and pasted access tokens are deliberately not accepted by this adapter.

## Dynamic model catalog

Each authenticated `listModels('openai-codex')` call queries `https://chatgpt.com/backend-api/codex/models` with the account access token, account id, and compatibility headers, retains rows whose `visibility` is `list`, sorts by account priority, and maps advertised context, input modalities, and supported reasoning levels into the LLM seam. An unknown model resolution also refreshes once before returning `UNKNOWN_MODEL`.

This URL and response shape are implementation compatibility facts observed in the current Codex clients and the referenced `pa_mac` implementation; they are **not** a public OpenAI API contract. OpenAI's public product documentation confirms ChatGPT sign-in and interactive model selection, but does not document this catalog endpoint. The adapter therefore validates an untrusted bounded response, retries exactly once after a 401 credential refresh, writes only validated data, and retains its last-good cache or pi-ai baseline on discovery failure.

## Credential safety

`HarnessCredentialStore` maps pi-ai credentials losslessly onto the official scoped credential-record owner and uses its atomic `modifyRecord()` transaction for refresh. `FileCredentialStore` remains the direct-construction and older-Host fallback; it serializes read-modify-write operations in-process and under a cross-process file lock, uses atomic replacement, creates parent directories owner-only, and rejects an existing POSIX credential file with group/other permission bits. Catalog files never contain tokens. Login notifications may expose the provider authorization URL and device code in the live terminal but never append them to the durable Session transcript.

## Model Experience

### OpenAI Codex request

#### What the model sees

The chosen account model receives the ordinary Harness prompt, `GenerateOptions.messages`, tool schemas, and call configuration through pi-ai's OpenAI Codex Responses adapter. Authentication and catalog discovery add no prompt prose.

#### Token effect

No extra model-input tokens are added by login or discovery. The selected model and reasoning effort govern provider tokenization and output.

#### KV Cache effect

Changing the selected provider or model changes the provider cache domain; otherwise this package does not alter the assembled prefix.

### OpenAI Codex response

#### What the model sees

Nothing additional. pi-ai translates the provider stream into the Harness chunk vocabulary.

#### Token effect

Only response blocks retained by the Agent loop enter later requests.

#### KV Cache effect

Retained blocks append after the existing prefix in the usual Agent path.

## Known Limitations and Deferred Work

- The first user-facing login and model picker is TUI-only; Web's Models page still owns API-key profile configuration and does not run this native OAuth flow.
- Reasoning capabilities are discovered and exposed through `resolveModelInfo`, but the first `/models` selector chooses only provider and model; it does not present a separate reasoning-effort step.
- The compatibility endpoint may change independently of public OpenAI APIs. A failed refresh is visible in Host logs and leaves the last-good catalog active.

<a id="dev-note"></a>
### Dev Note

None.
