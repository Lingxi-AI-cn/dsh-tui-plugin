# DeepSeek Harness TUI Plugin

[中文](README.zh.md)

An independently installable native terminal UI for the official DeepSeek Harness. This repository publishes one user-facing bundle, `@lingxi-ai-cn/dsh-tui`, and five exact internal packages under the same npm scope.

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

The clean-room gate installs the unmodified official Harness from npm, installs locally packed TUI packages through `dsh plugin`, composes the profile, boots a PTY, exits through `/quit`, restores terminal state, and confirms that the official installation was not modified.

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
