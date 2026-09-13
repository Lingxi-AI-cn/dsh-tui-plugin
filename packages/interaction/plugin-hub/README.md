---
description: "Provider-neutral Plugin Hub service contract for catalog, installed truth, plans, and maintenance handoff."
kind: "package-reference"
---

# @lingxi-ai-cn/dsh-plugin-hub

English | [中文](README.zh.md)

## Summary

Provider-neutral human Plugin Hub capability exposed as `ctx.pluginHub`. The service owns stable catalog, installed-state, detached-plan, staging, and activation-handoff DTOs plus provider registration, transient progress events, the error taxonomy, and an explicit `supportsProfileMutations()` capability. HTTP, cache, signatures, profile mutation, package-manager work, journals, and maintenance processes belong to providers. A catalog-only provider reports `false`, so a consumer can keep discovery and installed truth active without presenting an in-process mutation action.

## Catalog contract

Catalog detail DTOs preserve repository archive state, declared and verified operating systems, bounded curation notes, and structured advisories with severity and recommended action. These are discovery and risk-display facts; none can establish installability or replace signed descriptor verification.

Catalog rows may also carry Registry-owned categories, package kind, metadata source, and repository primary language. These fields are presentation and optional search filters only; clients do not infer them from README text, descriptions, repository names, or popularity.

Catalog search accepts provider-neutral `relevance`, `stars`, `updated`, and `newest` ordering. Providers keep continuation cursors opaque and bind them to the complete request, including ordering; catalog ordering remains human discovery state and does not affect installability or verification.

Providers may also expose a separate discovered-repository page. Discovery rows carry repository sync, exact-head scan, rejection, package, and published-projection facts; they are browse-only and never imply an installable version. Consumers must keep this view separate from the installable catalog and must not route discovery rows into install planning.

Install planning accepts only opaque `PluginId` and `PluginVersionId` values. Plans expose exact confirmation facts but never artifact URLs, local paths, executables, package-manager arguments, or a signature bypass. Staging and activation accept only provider-issued branded ids, and `markMaintenanceReady()` is a no-op outside an authenticated relaunch handoff.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the service exposes catalog rows, README text, and progress only to human UI consumers and never writes them to the Session log.

#### KV Cache effect

No effect; the service does not add, replace, or retain model-request content.

## Known Limitations and Deferred Work

- **Provider implementation required** - the Service Definition performs no Registry verification or profile mutation by itself; the mounted Host provider owns every trust and transaction decision.
- **No rollback contract** - retained generations, history, rollback planning, and advisory remediation remain outside the initial install lifecycle.

<a id="dev-note"></a>
### Dev Note

None.
