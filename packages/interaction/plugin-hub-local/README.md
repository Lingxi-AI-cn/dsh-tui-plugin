# @lingxi-ai-cn/dsh-plugin-hub-local

English | [中文](README.zh.md)

Trusted local Plugin Hub provider. A deployment explicitly supplies an HTTPS `registryUrl` and locally pinned Ed25519 keys; absent configuration leaves the optional provider unmounted. Catalog responses are runtime-parsed, API-version checked, redirected at most three times within the configured Registry origin, bounded by bytes, cancelled by caller signal, and retained as an in-memory last-good view when the Registry is temporarily unavailable. Registry detail responses normalize `validationMatrix` rows (`manifest`, `install`, and `tui-boot`) and strictly project quarantine, repository archive, operating-system, curation, and structured advisory facts into provider-neutral DTOs; malformed detail metadata fails closed.

`profileMutations` defaults to `false`. In that post-install-safe mode, Registry browsing and active-profile `installed()` truth remain available, mutation methods fail with `CONTRACT_UNSUPPORTED`, and startup readiness is a no-op. The published TUI bundle uses this mode because official DSH `0.1.0-rc.8` has no generic recovery hook before profile composition; users make changes with `dsh plugin --profile tui ...`. Setting `profileMutations: true` enables the downstream maintenance lifecycle described below and is reserved for compositions that install its matching pre-composition recovery hook.

Catalog search forwards provider-neutral `relevance`, `stars`, `updated`, or `newest` ordering to the Registry, includes the ordering in its request cache key, and applies the same ordering and cursor binding to signed snapshot fallback. A Registry `INVALID_CURSOR` response remains a typed provider error rather than being silently restarted.

The provider parses Registry-owned categories, package kind, metadata source, and repository primary language with bounded fail-closed validation. Category, kind, and language filters are forwarded to live Registry requests, included in cache identity, and applied identically to fixture and signed-snapshot fallback; these fields never affect installability or descriptor verification.

When profile mutation is enabled, `planInstall()` accepts only opaque plugin and version ids, then fetches a fresh signed descriptor itself. The provider checks the selected ids, key validity, descriptor time interval, exact `tui` surface, DSH semver range, npm-tarball policy, compressed size, package identity, lifecycle-script inventory, and SHA-512 digest. Artifact redirects are checked at every hop and production artifacts are restricted to `https://registry.npmjs.org`; explicit loopback HTTP remains fixture-only. Verified bytes are atomically linked as `$DSH_HOME/plugin-hub/artifacts/sha512/<digest>.tgz`; the tarball suffix preserves pnpm's local-package interpretation while the digest retains content-addressed identity. The public detached plan omits URLs and filesystem paths. `installed()` always derives from the active profile manager; `planRemove()` does the same when mutation is enabled.

`stage()` writes and fsyncs a private transaction journal before it copies the active profile without following symlinks. It rechecks the copied baseline revision, applies the exact cached artifact through the shared manager in the inactive directory, reconciles bundle order, validates installed manifests and lockfile facts, parses every bundle/profile patch, and composes the resulting entry list. Pnpm, cancellation, revision, or validation failures mark the journal and remove only the staging generation. `discard()` is available until activation handoff begins.

`createMaintenanceHandoff()` starts the package-owned helper and returns only after that helper holds the shared profile lock. The helper waits for the old DSH process to exit, swaps the staged generation into the fixed `tui` profile, relaunches the captured DSH invocation with a restricted environment, and commits only after the new process writes a nonce-, PID-, and revision-bound ready marker. A failed boot is terminated before the old generation is restored and relaunched. Startup recovery resolves crashes at either rename, rolls an exact ready marker forward, and fails loud on ambiguous disk state. Committed receipts are the local source for managed installation identity; the remote Catalog never contributes installed truth.

## Model Experience

None, as provider requests and responses remain human-only TUI data and never enter a model request or Session history.

#### KV Cache effect

No effect; catalog refreshes and cached records do not alter model-request content.

## Known Limitations and Deferred Work

- **Catalog cache remains in memory** - signed artifacts use a persistent content-addressed cache, but Catalog query/detail ETags and last-good snapshots are process-local.
- **No user-selected rollback yet** - automatic failed-boot restoration retains the old and failed generations, but history retention, pruning, and an explicit rollback action remain deferred.
