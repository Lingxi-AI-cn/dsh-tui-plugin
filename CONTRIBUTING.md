# Contributing

Open an issue before a large change. Keep changes within the native TUI and its package-owned Host providers; do not duplicate or replace the Harness Agent loop.

Requirements:

- Node.js `^22.19.0` or `>=24`
- pnpm `11.7.0`
- official DeepSeek Harness package APIs at `0.1.0-rc.8`

Run `pnpm run verify` before submitting a pull request. Changes affecting packed installation must also pass `pnpm run verify:clean-room`.
