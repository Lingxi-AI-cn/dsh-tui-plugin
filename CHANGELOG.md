# Changelog

## 0.1.13-rc.2

- Supports exactly official DeepSeek Harness `0.2.0-rc.2` across all seven packages, with pi-ai `0.87.1`.
- Adds native timed questions when the Host tool is explicitly configured for timed mode: one batch countdown, editing pause, explicit defer, and empty-answer submission. The shipped presets retain the official legacy default.
- Adds `/questions` and a pending-question footer entry. Continued questions recover from the durable Session projection; late replies use official root-Agent admission and preserve the original pending tool result.
- Adapts provider transcript contexts and native launch visibility to the official APIs while preserving Session recovery, schedule ownership, and the canonical two-bundle profile.
- Real-account OAuth, native IME preedit, and wider terminal/platform checks remain manual.

## 0.1.12-rc.2

- Supports exactly official DeepSeek Harness `0.1.7-rc.2` across all seven packages.
- Adopts the official Agent Preset registry, revisioned Settings owner, Session V4 persistence, Jobs and Schedule events, and ordered bundle patches.
- Includes the four official preset declarations in the TUI bundle. Preset defaults use the Settings owner; copy and delete remain unavailable because the official registry has no authoring API.
- Preserves healthy Session rows beside unreadable records, with explicit refusal reasons and no rewrite of historical Session data.
- Verifies the exact official npm installation, canonical two-bundle profile, seven-package closure, and PTY startup and exit. Real-account OAuth and native IME preedit remain manual checks.

## 0.1.11-rc.2

- Keeps exact compatibility with official DeepSeek Harness `0.1.5-rc.2`.
- Keeps healthy Sessions visible when another Session fails an activity read or historical-format migration.
- Shows unavailable reasons in the Session Manager list and detail and refuses resume for unreadable records.
- Preserves scan cancellation and stored Session data. This release does not add migration support for historical descriptor version 2.

## 0.1.10-rc.2

- Supports exactly official DeepSeek Harness `0.1.5-rc.2` across all seven packages, with pi-ai `0.85.1`.
- Reads Session v3 through logical persistence handles, preserves inherited history during cold rename, and exports canonical logical logs.
- Renders revisioned assistant streams across active child views while retaining durable Session messages as transcript truth.
- Updates attachment and subagent provenance handling, official Host identification, and profile artifact paths.
- Preserves the independent Codex provider and provider-owned credentials. Real-account OAuth, native IME preedit, and the wider terminal matrix remain manual checks.

## 0.1.9-rc.1

- Keeps exact compatibility with official DeepSeek Harness `0.1.2-rc.1` across all seven packages.
- Registers the enhanced ChatGPT adapter as `lingxi-openai-codex` so it can coexist with the official `openai-codex` route; existing enhanced OAuth grants remain under their original credential scope.
- Stores new TUI model selections in `tui.defaultModel`, leaving the shared Agent default unchanged. Existing defaults and Session selections are not migrated automatically; see the upgrade instructions.
- Isolates concurrent Codex WebSocket cache entries and releases adapter-owned streams and connections on disposal.
- Restores the terminal and requests application exit before asynchronous TUI cleanup; startup catalog cancellation and Agent cleanup no longer wait on unrelated background reads.
- The plugin does not replace the official CLI shutdown controller. A remaining remote-socket close-handshake delay on official DSH is outside this package release.

## 0.1.8-rc.1

- Aligns the post-install TUI with exact official DeepSeek Harness `0.1.2-rc.1` and its published Host graph.
- Adopts rc.1 Session snapshots, distinct sequence and log-offset identities, seeded-rewind metadata, and projection-cache inherited-event cuts without restoring mutable Session access.
- Routes native human prompts to continuable child Agents through the official Host-only queue with durable user provenance, while preserving model-authored Agent messaging on its separate owner.
- Uses the official rc.1 PTC/Ralph and web-tool composition, and pins the bundled Codex adapter to the compatible `pi-ai@0.84.4` closure.
- Verifies the exact seven-package payload, official-DSH clean-room composition, PTY startup and exit, and terminal restoration before publication.

## 0.1.7-alpha.2

- Aligns the post-install TUI with exact official DeepSeek Harness `0.1.2-alpha.2`, including its Authorization, Credentials, settings, projection, preset-composition, Schedule, Session export, Todo, and subagent owners.
- Migrates Codex production authentication to Host-owned Authorization and scoped Credentials records without signing users in or rewriting provider state during installation.
- Adds metadata-only Session storage preflight, authoritative Turn usage, settled-question and child-route facts, canonical `ptc` preset identity, and Host-owned preset/plug-in composition diagnostics.
- Adds the read-only `/schedules` surface and footer status, preserving official Schedule ownership for creation, deletion, persistence, and dispatch.
- Retains capability-gated fallback behavior for older supported Hosts while validating the exact alpha.2 package graph, composition, PTY exit, and terminal restoration in a clean room.

## 0.1.6-rc.8

- Reorganizes consecutive same-turn tool calls into compact activity summaries with a two-level Activity Inspector for category and exact-call details.
- Adds a majority-height assistant result reader with physical-row mouse scrolling, continuation-aware segment navigation, and complete-response switching.
- Adds direct copy and Markdown export actions for either one assistant segment or the complete same-turn response, with clickable transcript and detail controls.
- Keeps result-reader actions visible beside pinned Tasks, prevents wheel-boundary jumps, and makes success notices transient so they do not cover the footer.

## 0.1.5-rc.8

- Adds native Provider, Session/Workspace, Preset, and Host Plugin management surfaces, including capability-gated mutations, redacted settings, safe preset authoring, Session archive plus Host-gated restore, and provider logout.
- Adds revision-aware pending-input queues, unified file and Session references, durable Goal/Plan status, per-Turn deliverables, and a searchable hierarchical Trajectory inspector.
- Adds message feedback, durable image intake, terminal path paste, safer referenced-Session preflight, and exact mouse targets across the new dialogs, tabs, fields, and inline deliverable paths.
- Preserves official DSH `0.1.0-rc.8` ownership boundaries: unsupported queue mutations and non-image durable attachments remain explicitly unavailable instead of being emulated in the TUI.

## 0.1.4-rc.8

- Separates installed plugins, Registry entries, and GitHub repositories, with explicit installability filters, repository scan status, and mouse-accessible details and links.
- Adds capability-oriented `/commands`, `/skills`, `/mcp`, `/tips`, `/provider`, `/update`, and `/btw` workflows with bilingual, bounded terminal presentation.
- Adds custom theme files, activity animation choices, live feedback notices, passive compatible-version discovery, resume-and-rename, and richer footer actions.
- Restores pointer regions after leaving a tool detail opened during Agent execution and strengthens Plugin Hub cache, pagination, filtering, and click behavior.

## 0.1.3-rc.8

- Resolves Codex image prompts through the Host-owned durable attachment service.
- Restores bounded workspace `@` completion on the exact official DSH rc.8 Host.
- Localizes official rc.8 command descriptions in globally installed Chinese profiles.
- Keeps structured-question Enter handling isolated from running-Agent steer, follow-up, and interrupt delivery.

## 0.1.2-rc.8

- Adds Standard, PTC, Minimal, Creator, and healthy user Agent Preset selection through `/mode`.
- Preserves preset identity across Session resume, creation, clear, and rewind workflows.
- Applies mode changes atomically in a blank Session and creates a confirmed new Session after work has started.

## 0.1.1-rc.8

- Bundles the OpenAI Codex adapter with provider-owned ChatGPT OAuth and dynamic account model discovery.
- Adds an official DSH rc.8 compatibility bridge for the optional authentication seam without modifying the Host installation or user settings.
- Adopts version identity where the TUI core increments independently and the final `rc.8` suffix names exact compatibility with official DSH `0.1.0-rc.8`.
- Expands clean-room and release verification from six to seven exact packages and proves the `/models` ChatGPT sign-in row in a PTY.

## 0.1.0-rc.9

- Adds mouse-driven transcript scrolling and pointer interaction while preserving keyboard operation.
- Adds English/Chinese runtime localization across menus, prompts, footer status, diagnostics, and command feedback.
- Improves menu selection contrast, input-cursor placement, cancellation behavior, terminal theme detection, and runtime diagnostics.
- Expands Session navigation, context inspection, extension surfaces, startup guidance, and long-transcript rendering.
- Remains exactly compatible with official DeepSeek Harness `0.1.0-rc.8`.

## 0.1.0-rc.8

- Initial public release candidate for official DeepSeek Harness `0.1.0-rc.8`.
- Adds the post-install native TUI bundle, terminal runtime, Session archive exporter, and signed read-only Plugin Hub provider.
- Keeps profile mutation on the official external `dsh plugin` command for the bootstrap release.
