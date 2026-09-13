---
description: "Installable native terminal profile bundle for the official DeepSeek Harness Host."
kind: "package-bundle"
---

# `@lingxi-ai-cn/dsh-tui`

English | [中文](README.zh.md)

## Summary

The post-install native terminal bundle over the official [`dsh-base`](../base/README.md) profile.

## Composition

Its patch removes the base process-wide Agent plane, mounts the official preset roster plus the Host-side Code Mode and Cordis runners, and keeps terminal-neutral owners such as Workspace, Session/file references, durable projection cache, Schedule, bounded directory picker, message feedback, Host plugin inventory, native Session archive writer, provider-neutral Plugin Hub service, and trusted local [`@lingxi-ai-cn/dsh-plugin-hub-local`](../../interaction/plugin-hub-local/README.md) provider on the Host plane. It parses `dsh --profile tui [--resume <session-id>]` and activates [`@lingxi-ai-cn/dsh-tui-runtime`](../../ui/tui/README.md). It mounts no Web server, API Proxy, browser runtime, Workspace UI, or Agent installation tool. The package provides no global binary and does not modify the installed DSH application.

## Table of Contents

- [Install and run](#install-and-run)
- [Agent modes](#agent-modes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Install and run

Install the exact TUI release into a profile owned by an already installed matching DSH release, then launch that profile through the existing `dsh` binary:

```sh
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.11-rc.2
dsh --profile tui
```

This install contract assumes that official DSH initializes a fresh `tui` profile. Its active bundle list must be exactly `@deepseek-ai/dsh-base` followed by `@lingxi-ai-cn/dsh-tui`. A `tui` profile created by an older downstream build can still list `@deepseek-ai/dsh-tui-app`; adding the public bundle does not remove that legacy entry, and both patches register loader ids such as `storage`. Back up and recreate that profile before installing the public bundle:

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.11-rc.2
```

Sessions and credentials are stored outside the profile directory and are not removed by this migration. Review and reapply any user-authored profile patch instead of copying the old profile directory back wholesale.

The package checks every declared official Host peer before command parsing and terminal negotiation. The official `@deepseek-ai/dsh-agent-presets` package owns and validates its bundled preset root; the TUI does not guess an application-relative path. The packed package requires exact DSH package versions, rejects Host packages resolved from the `tui` profile, and prints the installed DSH version, supported DSH version, TUI version, profile, and exact recovery command on mismatch. Upgrade DSH and the TUI as a tested pair.

The published manifests retain exact Host peer ranges but mark those peers optional for package-manager resolution because the official launcher supplies the complete Host graph from outside the isolated profile. A normal `dsh plugin` install therefore does not report those external packages as missing or duplicate them inside `$DSH_HOME/profiles/tui`; startup still requires and validates their exact external versions and paths.

The public bundle includes [`@lingxi-ai-cn/dsh-llm-openai-codex`](../../llm/llm-openai-codex/README.md). `/models` offers ChatGPT sign-in before the provider has credentials and lists the signed-in account catalog afterward. Current Hosts store the OAuth grant through the official scoped credential-record owner at `llm-openai-codex/openai-codex`; `$DSH_HOME/oauth/openai-codex.json` remains only the direct-construction and older-Host fallback. Installation and upgrades never sign a user in or rewrite either credential store.

The Plugin Hub provider reads `https://redshell-ai.com:9000` and verifies signed installation descriptors with the deployment-owned `registry-2026-08` Ed25519 key embedded in [`cordis.patch.yml`](cordis.patch.yml). The provider does not trust signing keys announced by `/v1/meta`, and ordinary TUI settings cannot replace this trust root; a fixture or another deployment must supply its own explicit patch. The published bundle keeps `profileMutations: false`: discovery and installed-profile truth remain native, while its detail and installed footers show exact `dsh plugin --profile tui ...` commands and Enter never mutates the running profile. The downstream-only staged maintenance lifecycle remains available to compositions that explicitly enable it and install the matching pre-composition recovery hook; it is not part of the official `0.1.5-rc.2` post-install contract.

The startup provider owns application flags, the validated official preset root, and the successful Host compatibility snapshot, then publishes them through `tuiStartup`. The TUI row reads its optional resume id through lazy Loader config and injects the same startup service into the runtime for process-local `/doctor` reporting. Fresh Sessions use the invocation working directory and the roster default. Startup resume resolves the effective preset from the Session header plus the latest durable `agent-preset/selected` event, refuses subagent, missing, broken, or legacy rosterless targets before Ink enters the alternate screen, and mounts the resolved preset before publishing the Agent. The in-process `/resume` picker applies the same checks while preserving the current Agent until a replacement publishes. The projection cache uses the same `$DSH_HOME/storages` JSON backend as the Web bundle, so either surface can seed identity-bound title checkpoints for the other. The archive writer streams durable raw artifacts to a private temporary file and publishes only a complete ZIP in the operator-selected directory.

## Agent modes

The TUI consumes the same dynamic `ctx.agentPresets` roster and durable Session identity as Web. The four official modes are:

| Display name | Preset id | Composition |
|---|---|---|
| Standard | `standard` | Full coding Agent with native tools, skills, planning, goals, subagents, and workflows. |
| PTC | `ptc` | Standard capabilities presented to the model through the TypeScript Code Mode SDK and `run_code`. |
| Minimal | `minimal` | The official fixed prompt with exactly persistent `bash` and `str_replace_editor`. |
| Creator | `cordis` | Standard capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance. |

Against official DSH `0.1.5-rc.2`, the TUI keeps the Host-owned Web registry plus DeepSeek search and HTTP fetch providers process-wide, while the preset owns model visibility of `tool-web`. Standard, PTC, and Creator therefore expose the official search/fetch capability without leaking it into Minimal. The PTC preset also keeps the workflow worker and Ralph active but disables the duplicate model-facing `tool-workflow` entry, so workflow execution remains available through Code Mode without presenting two competing interfaces.

`/mode` and the actionable footer list these system presets plus healthy user presets from `$DSH_HOME/.agent-presets`. A blank Session switches in place through the official recompose transaction and records `agent-preset/selected` only after the new composition commits. Once a `turn/start` exists, selecting another mode opens the existing fresh-Session confirmation; cancellation keeps the current Agent, transcript, draft, and footer unchanged, while confirmation creates a new Session under the selected preset and leaves the old Session resumable. `/new`, `/clear`, and `/rewind` inherit the current Session's effective preset. `/presets` adds structured owner-supplied composition rows, atomic copy, inspection, Host-open, user-owned deletion, and future-default selection when the preset owner exposes its settings compare-and-set seam; missing or broken presets remain visible but disabled. The Schedule owner supplies model-facing create/list/delete tools, while `/schedules` and the footer expose its active projection as a read-only terminal panel.

## Model Experience

### Harness-source and TUI-surface context

#### What the model sees

The shared `harness:source` section identifies the on-disk Harness implementation, and one static `app:tui-surface` paragraph states that the user is interacting through the native terminal UI, terminal/pasted content is untrusted, and the surface supports follow-up, steering, slash commands, approvals, and structured questions.

#### Token effect

One source line and one fixed prompt paragraph per Session; constant for the life of the process.

#### KV Cache effect

The static section sits near the system prompt head and remains unchanged across turns, so it stays in the reusable prefix.

## Known Limitations and Deferred Work

- **Preset source editing uses the Host** — the manager handles default selection, copy, inspection, and deletion but opens composition files through the Host instead of embedding a YAML editor.
- **TUI-only Codex login** — the public bundle adds native ChatGPT OAuth and account model discovery; the Web Models page does not run this login flow.
- **Plugin changes use the external CLI** — official DSH `0.1.5-rc.2` has no generic pre-composition recovery hook, so the published TUI does not activate its downstream-only in-process profile swap.
- **TTY-only application** — redirected stdin or stdout fails before activation; unattended automation uses the headless profile.

<a id="dev-note"></a>
### Dev Note

None.
