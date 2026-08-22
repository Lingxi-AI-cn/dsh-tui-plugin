# Changelog

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
