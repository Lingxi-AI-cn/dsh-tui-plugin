# DSH TUI

[![npm](https://img.shields.io/npm/v/@lingxi-ai-cn/dsh-tui?label=npm)](https://www.npmjs.com/package/@lingxi-ai-cn/dsh-tui)
[![CI](https://github.com/Lingxi-AI-cn/dsh-tui-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Lingxi-AI-cn/dsh-tui-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[中文说明](README.zh.md)

**A native, post-install terminal interface for the official DeepSeek Harness.**

DSH TUI brings a focused, full-screen coding-agent experience to the terminal without replacing or forking the official Harness installation. Install it into a dedicated DSH profile, keep the upstream Agent loop and durable Session model, and gain a readable conversation surface, mouse-assisted navigation, Session workflows, runtime diagnostics, and Plugin Hub discovery.

> This is an independent community plugin. It runs inside the DeepSeek Harness Host process and follows the official Harness plugin and profile model.

## Preview

| English | 中文 |
| --- | --- |
| [![English startup screen](screenshots/screenshot_en.jpg)](screenshots/screenshot_en.jpg) | [![中文启动界面](screenshots/screenshot_cn.jpg)](screenshots/screenshot_cn.jpg) |

## Highlights

### Native conversation experience

- Full-screen terminal workspace with a compact live transcript, centered startup screen, model status, permission state, workspace, context pressure, and transcript position.
- Structured rendering for Markdown, reasoning, tool calls and results, diffs, searches, web activity, compaction, delegated Agents, and durable Tasks.
- Physical-row virtualization and Unicode-width layout keep long Sessions responsive and readable on narrow terminals.

### Session-centered workflows

- Resume persisted work with `/resume`, start clean with `/new` or `/clear`, and branch safely from an earlier completed human turn with `/rewind`.
- Browse and search the complete durable transcript, inspect full block details, move between the root and live child Agents, and monitor cancellable background work.
- Export a Session for review or backup with `/export`; prompts, tool activity, and workspace paths remain explicit diagnostic data.

### Fast keyboard and mouse interaction

- Command and path completion, submitted-prompt history, full-transcript search, draft stash, undo/redo, multiline editing, external editor integration, and bounded clipboard operations.
- Negotiated mouse support for transcript scrolling and common selectable UI targets, while `/config` can return selection and scrolling to the outer terminal.
- One configurable interaction registry powers runtime keybindings and the built-in `/help` panel, so available gestures stay discoverable.

### Models, permissions, and human decisions

- `/models` discovers configured providers and models, supports provider-owned authentication flows, and selects the exact reasoning effort when available.
- Approval requests and structured user questions are presented as bounded native dialogs instead of leaking into ordinary transcript state.
- The actionable footer opens model, permission, work, context, workspace, and transcript details without leaving the current Session.

### Bilingual and terminal-aware

- Switch the first-party interface at runtime with `/lang en` or `/lang zh`; menus, hints, dialogs, Plugin Hub chrome, and footer details follow the selected language.
- Automatic, dark, light, and no-color themes preserve semantic status even on limited-color terminals.
- Unicode display-width layout, a real IME cursor anchor, bounded terminal capability negotiation, and idempotent teardown protect CJK input and restore terminal state on exit.

### Plugin Hub and diagnostics

- `/plugins` browses the signed Registry, installed-profile truth, versions, compatibility, verification, advisories, and sanitized README content.
- Profile changes remain on the official `dsh plugin` path; the TUI shows exact install or removal commands rather than creating a second package-management authority.
- `/doctor` reports Host/TUI capabilities and `/context` shows the loaded model, permission, tools, skills, and prompt contributors.

## Command overview

| Command | Purpose |
| --- | --- |
| `/models` | Choose a provider, model, and reasoning effort |
| `/config` | Configure theme, mouse ownership, and keybindings |
| `/lang en\|zh` | Switch the TUI language |
| `/resume` | Search and resume a persisted Session |
| `/new`, `/clear` | Start a fresh Session in the current workspace |
| `/rewind` | Create a child Session from an earlier safe turn |
| `/export` | Export durable Session data |
| `/plugins` | Browse discoverable and installed plugins |
| `/doctor` | Inspect runtime health and capabilities |
| `/context` | Inspect loaded context facts |
| `/help` | List commands and effective interaction bindings |
| `/quit`, `/exit` | Restore the terminal and exit safely |

## Compatibility

The current public release is deliberately pinned to the matching official Harness release.

| DSH TUI | DeepSeek Harness | Node.js | Platforms |
| --- | --- | --- | --- |
| `0.1.0-rc.8` | exactly `0.1.0-rc.8` | `^22.19.0` or `>=24` | macOS 14 and Ubuntu 24.04 CI |

Support for a newer Harness version is added only after exact-package clean-room installation, profile composition, PTY startup/exit, and terminal-restoration verification.

## Install

Install the exact supported official Harness, then add DSH TUI to a dedicated `tui` profile:

```sh
npm install --global @deepseek-ai/dsh@0.1.0-rc.8
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
dsh --profile tui
```

For a project-local Harness installation, run the same profile command through that installation's `dsh` binary.

On first launch:

```text
/models      choose or authenticate a model provider
/lang zh     switch to Chinese
/config      choose theme, mouse behavior, and keybindings
/help        review commands and active shortcuts
```

### Existing or legacy `tui` profiles

The canonical profile contains exactly `@deepseek-ai/dsh-base` followed by `@lingxi-ai-cn/dsh-tui`. If an older profile still includes `@deepseek-ai/dsh-tui-app`, preserve it as a backup and let official DSH create a clean profile:

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
```

Sessions and credentials live outside the profile directory. Reapply only reviewed custom patches; do not copy the old profile back wholesale.

<details>
<summary>Installation notes</summary>

- pnpm may print missing-peer warnings while installing the profile. Official DSH supplies those exact Host packages; installing the suggested `@deepseek-ai/*` peers into the profile can create a duplicate Host graph.
- The bootstrap release uses model adapters supplied by official DSH and does not bundle `openai-codex`. Select an available provider through `/models`.
- npm may ask whether to allow install scripts for official DSH native helpers. Follow npm's printed guidance for the official installation; do not add those packages to the TUI profile.

</details>

## Upgrade or reinstall

Install the exact TUI version that matches the installed official Harness version:

```sh
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
```

Release tags and npm versions are immutable. Do not mix package versions from different release candidates.

## Uninstall

Remove the user-facing bundle through the official plugin command:

```sh
dsh plugin --profile tui remove @lingxi-ai-cn/dsh-tui
```

Uninstalling the bundle does not delete Harness Sessions, credentials, or user-authored profile patches.

## Build from source

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:clean-room
```

The verification pipeline checks public-source hygiene, tests, build output, the exact six-package tarball closure, official-DSH clean-room composition, PTY startup and `/quit`, and terminal restoration. See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before changing package behavior.

## Security

DSH plugins execute inside the Harness Host process with the user's OS permissions; they are not a sandbox. Install only trusted versions and review profile changes. Session exports may contain prompts, tool arguments and results, and workspace paths. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

MIT

## Acknowledgements

DSH TUI is built on the architecture, plugin system, Agent runtime, and durable Session model of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Our thanks to [DeepSeek](https://www.deepseek.com/) and the DeepSeek Harness contributors for making the upstream project available to the community.
