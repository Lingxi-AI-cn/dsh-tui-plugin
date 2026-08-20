# `@lingxi-ai-cn/dsh-tui`

English | [中文](README.zh.md)

The post-install native terminal bundle over the official `dsh-base` profile. Its patch keeps the base process-wide agent plane, disables HMR, selects the process-wide tool mode, mounts the shared durable Session projection cache, native Session archive writer, provider-neutral Plugin Hub service, and trusted local [`@lingxi-ai-cn/dsh-plugin-hub-local`](../../interaction/plugin-hub-local/README.md) provider, parses `dsh --profile tui [--resume <session-id>]`, and activates [`@lingxi-ai-cn/dsh-tui-runtime`](../../ui/tui/README.md). It mounts no Web server, API Proxy, browser runtime, Workspace UI, preset roster, or Agent installation tool. The package provides no global binary and does not modify the installed DSH application.

## Install and run

Install the exact TUI release into a profile owned by an already installed matching DSH release, then launch that profile through the existing `dsh` binary:

```sh
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
dsh --profile tui
```

The package checks every declared official Host peer before command parsing and terminal negotiation. The packed package requires exact DSH package versions, rejects Host packages resolved from the `tui` profile, and prints the installed DSH version, supported DSH version, TUI version, profile, and exact recovery command on mismatch. Upgrade DSH and the TUI as a tested pair.

The Plugin Hub provider reads `https://redshell-ai.com:9000` and verifies signed installation descriptors with the deployment-owned `registry-2026-08` Ed25519 key embedded in [`cordis.patch.yml`](cordis.patch.yml). The provider does not trust signing keys announced by `/v1/meta`, and ordinary TUI settings cannot replace this trust root; a fixture or another deployment must supply its own explicit patch. The published bundle keeps `profileMutations: false`: discovery and installed-profile truth remain native, while its detail and installed footers show exact `dsh plugin --profile tui ...` commands and Enter never mutates the running profile. The optional staged maintenance lifecycle remains available to compatible compositions that explicitly enable it and install the matching pre-composition recovery hook; it is not part of the official `0.1.0-rc.8` post-install contract.

The startup provider owns only application flags and publishes `tuiStartup`. The TUI row reads its optional resume id through lazy Loader config. Fresh Sessions use the invocation working directory. Startup resume accepts only non-subagent Sessions with no recorded preset and refuses an incompatible target before Ink enters the alternate screen; the in-process `/resume` picker applies the same checks while preserving the current Agent until a replacement publishes. The projection cache uses the same `$DSH_HOME/storages` JSON backend as the Web bundle, so either surface can seed identity-bound title checkpoints for the other. The archive writer streams durable raw artifacts to a private temporary file and publishes only a complete ZIP in the operator-selected directory.

## Model Experience

### Harness-source and TUI-surface context

#### What the model sees

The shared `harness:source` section identifies the on-disk Harness implementation, and one static `app:tui-surface` paragraph states that the user is interacting through the native terminal UI, terminal/pasted content is untrusted, and the surface supports follow-up, steering, slash commands, approvals, and structured questions.

#### Token effect

One source line and one fixed prompt paragraph per Session; constant for the life of the process.

#### KV Cache effect

The static section sits near the system prompt head and remains unchanged across turns, so it stays in the reusable prefix.

## Known Limitations and Deferred Work

- **No Web/preset composition** — the bundle deliberately keeps the base process-wide agent rows, so preset-aware cross-surface Session resume is unavailable.
- **Plugin changes use the external CLI** — official DSH `0.1.0-rc.8` has no generic pre-composition recovery hook, so the published TUI does not activate its optional in-process profile swap.
- **TTY-only application** — redirected stdin or stdout fails before activation; unattended automation uses the headless profile.
