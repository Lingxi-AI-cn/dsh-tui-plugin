# Changelog

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
