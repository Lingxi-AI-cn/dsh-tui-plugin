# DeepSeek Harness TUI Plugin

[中文](README.zh.md)

An independently installable native terminal UI for the official DeepSeek Harness. This repository publishes one user-facing bundle, `@lingxi-ai-cn/dsh-tui`, and five exact internal packages under the same npm scope.

## Published release

| Surface | Current public artifact |
| --- | --- |
| Source | [`Lingxi-AI-cn/dsh-tui-plugin`](https://github.com/Lingxi-AI-cn/dsh-tui-plugin), default branch `main` |
| Release | [`v0.1.0-rc.8`](https://github.com/Lingxi-AI-cn/dsh-tui-plugin/releases/tag/v0.1.0-rc.8), pre-release |
| npm entry | [`@lingxi-ai-cn/dsh-tui@0.1.0-rc.8`](https://www.npmjs.com/package/@lingxi-ai-cn/dsh-tui/v/0.1.0-rc.8) |
| Automated matrix | Ubuntu 24.04 and macOS 14: source verification, tests, build, package audit, official-DSH clean room, and PTY exit |

At publication, both npm `next` and `latest` resolve the user-facing package to `0.1.0-rc.8`. This release is intentionally pinned to the matching official Harness release rather than claiming compatibility with later candidates.

## Compatibility

| TUI | DeepSeek Harness | Node.js | Release level |
| --- | --- | --- | --- |
| `0.1.0-rc.8` | exactly `0.1.0-rc.8` | `^22.19.0` or `>=24` | bootstrap |

The bootstrap release provides the native conversation surface, Session navigation, approvals and questions, tool presentation, durable Tasks, Session archive export, and read-only Plugin Hub discovery. Plugin installation, update, and removal use the official external `dsh plugin` command.

## Install

Install the official Harness first, then add the exact TUI release to a dedicated profile:

```sh
npm install --global @deepseek-ai/dsh@0.1.0-rc.8
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
dsh --profile tui
```

For a project-local Harness installation, run the same commands through that installation's `dsh` binary.

### Existing `tui` profiles

The profile must contain exactly the official base bundle and the Lingxi TUI bundle. If `$DSH_HOME/profiles/tui/package.json` still lists the older `@deepseek-ai/dsh-tui-app`, adding this package leaves both patches active and startup fails with `duplicate loader entry id: storage`. Preserve the old profile as a backup, then let official DSH create a clean one:

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
```

Sessions and credentials remain outside the profile directory. Reapply only reviewed custom profile patches; do not copy the old profile back wholesale.

The missing-peer list printed by pnpm during profile installation is expected. Official DSH supplies those exact Host packages from its own installation, so installing the suggested `@deepseek-ai/*` peers into the profile would create a duplicate Host graph.

The bootstrap release does not include an `openai-codex` adapter. If an existing `$DSH_HOME/settings.yaml` selects that provider, back up the file and change the default to an adapter supplied by official DSH before starting the TUI, for example:

```yaml
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash
```

The npm `install-scripts` warning shown while installing official DSH is separate from the plugin-profile warnings. Follow npm's printed `--allow-scripts` command if you choose to enable those official native helpers; do not install their packages into the TUI profile.

## Operations

```sh
# Inspect the assembled profile
dsh --profile tui --dump-default-config

# Reinstall the exact supported release
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8

# Remove the TUI package from the profile
dsh plugin --profile tui remove @lingxi-ai-cn/dsh-tui
```

Removing the package does not delete Harness Sessions, credentials, or user-authored profile patches.

## Build and verify

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:clean-room
```

The clean-room gate installs the unmodified official Harness from npm, installs locally packed TUI packages through `dsh plugin`, asserts the exact two-bundle profile composition, boots a PTY, exits through `/quit`, restores terminal state, and confirms that the official installation was not modified.

This repository is the sanitized public release surface. Package-source changes must keep all six versions and exact internal dependencies aligned, regenerate `SOURCE_MANIFEST.json`, and follow [AGENTS.md](AGENTS.md). Public release tags and npm versions are immutable.

## Security

DSH plugins execute inside the Harness Host process with the user's OS permissions; they are not confined by the model tool sandbox. Install only versions and sources you trust. Session archives can contain prompts, tool arguments and results, and workspace paths. See [SECURITY.md](SECURITY.md) for reporting instructions.

## Packages

- `@lingxi-ai-cn/dsh-tui` — post-install bundle and profile patch
- `@lingxi-ai-cn/dsh-tui-runtime` — native terminal runtime
- `@lingxi-ai-cn/dsh-session-export` — durable Session ZIP exporter
- `@lingxi-ai-cn/dsh-plugin-hub` — provider-neutral Plugin Hub service
- `@lingxi-ai-cn/dsh-plugin-hub-local` — signed Registry provider
- `@lingxi-ai-cn/dsh-profile-plugin-manager` — profile mutation primitives used by the optional maintenance implementation

## License

MIT
