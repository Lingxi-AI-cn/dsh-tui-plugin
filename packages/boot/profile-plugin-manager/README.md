---
description: "Host-side profile inspection, detached package plans, exact local mutations, locking, and validation for trusted consumers."
kind: "package-reference"
---

# `@lingxi-ai-cn/dsh-profile-plugin-manager`

English | [中文](README.zh.md)

## Summary

Host-side profile plugin management shared by command-line and trusted local consumers. `ProfilePluginManager` accepts an explicit profile directory and shared lock path; it does not select a profile from TUI input, fetch Registry data, verify descriptors, render UI, or activate a generation.

## Table of Contents

- [Operations](#operations)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Operations

- `inspectInstalled()` derives local truth from `package.json.dependencies`, ordered `dsh.profile.bundles`, resolved package manifests, `pnpm-lock.yaml`, and optional local Hub receipts. Remote Catalog state is never installed truth.
- `plan()` returns an expiring detached install, update, or remove plan with the exact profile revision, before state, expected bundle order, restart requirement, and lifecycle-script risks. Planning does not mutate the profile.
- `installExact()` and `updateExact()` accept only an absolute local artifact plus exact package identity. The optional SHA-512 digest and byte size are checked immediately before pnpm receives the path; mutable package specifications are not part of these APIs.
- `removePackage()` accepts one validated package name. Every successful mutation reconciles the bundle list through the same installed-state algorithm used by CLI passthrough.
- `materializeProfile()` copies a complete profile without following symlinks; `validateProfile()` checks dependencies, lockfile facts, bundle entries, bundle patches, and the profile patch layer.
- `runPnpm()` preserves the advanced `dsh plugin` passthrough contract, including optional inherited stdin, while using asynchronous no-shell argv spawning, cancellation, a wall-clock timeout, and bounded stdout/stderr retention.

`withProfilePluginLock()` uses an atomically created directory with owner PID, process-start identity, transaction id, timestamp, and nonce. A contender reclaims only an owner it can prove stale; a live or unverifiable owner fails with `PROFILE_BUSY`. Conventional profile consumers derive the one lock path with `resolveProfilePluginLockPath(profileDir)`.

Every typed mutation checks the detached plan revision again under that lock. A changed profile fails with `PROFILE_CHANGED`, an expired plan with `PLAN_EXPIRED`, and a missing or changed local artifact with `INVALID_ARTIFACT`. Pnpm failures retain independent exit, signal, timeout, cancellation, and output-truncation facts; build-policy diagnostics map to `BUILD_NOT_ALLOWED` without changing `pnpm-workspace.yaml`.

## Model Experience

None, as profile inspection and package-manager execution register no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No Registry trust decisions** - a trusted caller must verify descriptor identity, compatibility, artifact size, and digest before constructing a `ProfilePluginArtifact`; the manager only rechecks the supplied local file facts.
- **No activation transaction** - materialization writes a separate directory, but generation journals, active-profile swaps, maintenance helpers, ready markers, recovery, and rollback remain outside this package stage.
- **Windows requires a no-shell pnpm entry** - `.cmd` shims are not executed through a command shell; a Windows consumer must provide a directly executable pnpm command such as Node plus pnpm's JavaScript entry.

<a id="dev-note"></a>
### Dev Note

None.
