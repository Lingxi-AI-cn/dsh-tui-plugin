# AGENTS.md

This repository is the sanitized public source and release surface for the independently installable DeepSeek Harness TUI plugin.

## Current release contract

- The current TUI release is `0.1.13-rc.2`, supporting exactly official `@deepseek-ai/dsh@0.2.0-rc.2`; previously published versions, including `0.1.12-rc.2`, `0.1.11-rc.2`, `0.1.10-rc.2`, `0.1.9-rc.1`, `0.1.8-rc.1`, `0.1.7-alpha.2`, `0.1.6-rc.8`, `0.1.5-rc.8`, `0.1.4-rc.8`, `0.1.3-rc.8`, `0.1.2-rc.8`, `0.1.1-rc.8`, and `0.1.0-rc.9`, remain immutable.
- `@lingxi-ai-cn/dsh-tui` is the only user-facing install package. The six internal packages `dsh-tui-runtime`, `dsh-llm-openai-codex`, `dsh-session-export`, `dsh-plugin-hub`, `dsh-plugin-hub-local`, and `dsh-profile-plugin-manager` use the same npm scope and exact release version.
- The public default branch is `main`. Public release tags and npm versions are immutable; never move an existing `v*` tag or attempt to republish an existing npm version.

## Source and repository boundaries

- Keep this repository independently buildable from public dependencies. Do not add private Git remotes, private downstream commit references, parent-workspace plans or range diffs, credentials, signing keys, real Session artifacts, internal deployment state, absolute developer paths, or the Plugin Registry backend.
- Package behavior is exported from the verified private downstream maintenance source. Do not make package behavior diverge silently between the two trees. Public-only CI, release tooling, security policy, contribution guidance, and root documentation may be maintained here.
- An independent public build failure never authorizes a public-only edit under `packages/**` source, tests, or package READMEs. Stop the release, land the compatibility behavior and its enhanced-owner/exact-official-Host regression coverage in the private `downstream/tui-plugin` source, verify and commit that new private tip, then export it again. Only public-owned package manifests and project tsconfigs, root release tooling, CI, security/contribution policy, root documentation, lockfiles, and generated release metadata may intentionally differ; before tagging, compare every other exported package file byte-for-byte against the recorded private tip. Do not merge a public repository snapshot wholesale into DeepSeek Harness.
- DSH plugins run in the Harness Host process with the user's OS permissions. Public source, signatures, and provenance establish origin and integrity; they are not a sandbox or a safety proof.

## Compatibility and versioning

- Keep the root version and all seven TUI package versions aligned at the current immutable release `0.1.13-rc.2`. The core `0.1.13` identifies TUI iteration while the final `rc.2` suffix must equal the supported official DSH prerelease suffix. Keep official DSH peers, compatibility guards, clean-room fixtures, pack/release scripts, source-manifest metadata, and the dependency catalog aligned separately at the supported DSH version `0.2.0-rc.2`.
- The canonical post-install `tui` profile bundle list is exactly `@deepseek-ai/dsh-base` followed by `@lingxi-ai-cn/dsh-tui`. Treat legacy `@deepseek-ai/dsh-tui-app` entries as an explicit backup-and-recreate migration; never compose both bundles or install the reported upstream peers into the profile.
- Support for a new DSH release is explicit and evidence-based. Do not widen peer ranges or dist-tags merely because a build compiles; require an official-package clean-room install, composition, PTY startup/exit, and terminal restoration on the exact target.
- The TUI bundle includes `@lingxi-ai-cn/dsh-llm-openai-codex` and exposes provider-owned ChatGPT OAuth through `/models`. Keep provider migration explicit and reversible; package installation must not sign a user in, rewrite settings, or modify provider-owned credentials.
- Do not restore `dsh tui` as a required alias, modify the official DSH installation, install profile-local copies of upstream Service Definition packages, or add npm lifecycle scripts to the released package family.
- Keep Plugin Hub profile mutation on the official external `dsh plugin` path until a generic official pre-composition recovery contract is available. Do not infer recovery safety from the TUI being able to start.

## Generated and release files

- `SOURCE_MANIFEST.json` is generated from the public package source. Never hand-edit its hashes; run `pnpm run generate:source-manifest` after an intentional package-source change and review the result.
- Release tarballs and `artifacts/release-manifest.json` are generated outputs. Build them with `pnpm run pack:release`; do not patch tarballs or checksums manually.
- Packed packages must not contain source maps, source trees, lifecycle scripts, bins, local/workspace dependency specs, private metadata, or undeclared files.

## Verification and publication

Before committing, run the smallest relevant package tests and `git diff --check`. Before a public release, run from a clean checkout:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:clean-room
pnpm run pack:release
node scripts/publish-release.mjs
```

Require the Ubuntu 24.04/macOS 14 CI matrix to pass. Publication is performed by `.github/workflows/release.yml` with npm trusted-publishing permissions; never add a long-lived npm token to the repository. Configure the same Trusted Publisher for the new Codex package before its first publication. After publication, audit all seven registry payloads and dist-tags against the release manifest before updating release documentation.

Real OAuth, native macOS IME preedit, SSH/tmux combinations, and additional terminal emulators remain manual checks. Report them only when directly observed.
