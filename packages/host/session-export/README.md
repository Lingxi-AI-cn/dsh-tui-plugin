---
description: "Native atomic Session archive and Markdown export over official durable persistence owners."
kind: "package-reference"
---

# `@lingxi-ai-cn/dsh-session-export`

English | [中文](README.zh.md)

## Summary

Native Session archive writer and human-readable projection over the official [`@deepseek-ai/dsh-session-log-export`](../../session-query/session-log-export/README.md) producer. The `SessionLogExporter` service (`ctx.sessionLogExporter`) reuses that package's root preflight, canonical logical-log ZIP stream, descendant ordering, attachment collection, compression, backpressure, and cancellation. `stream()` exposes the official archive stream to a native consumer; `writeToDirectory()` writes it into an existing absolute host directory and returns the exact final path. `writeMarkdownToDirectory()` separately reads validated logical events and publishes a summary-only Markdown projection.

## Native publication

The adapter adds only native publication: it creates an owner-only random sibling, forwards cancellation through the official producer and file writes, syncs and closes the complete file, then publishes it with an exclusive hard link. Existing exports are never overwritten: the first collision uses `-2`, followed by increasing suffixes. A failure before publication removes the partial sibling and leaves no final archive. The destination filesystem must support same-directory hard links.

Markdown export is intentionally a human-readable projection, not a replacement for the official raw archive. It includes the current surface of the root and optional descendants, bounded user/assistant text, tool names and bounded result summaries, and explicit sequence/time facts. Tool argument values are omitted and marked as omitted. Image attachments use `attachment:<id>` references and their bytes are never copied into the Markdown file. The same private sibling, cancellation, `0600` mode, collision suffix, and exclusive hard-link publication rules apply to `.md` output.

Expected preparation failures use `SessionLogExportError`: `services-unavailable`, `session-not-found`, and `prepare-failed`. Destination and output failures use `destination-invalid` and `write-failed`. The operator-facing messages do not expose backend preparation errors; the original error remains attached as `cause` for host diagnostics. Signal cancellation preserves the signal's reason instead of becoming an export failure.

The archive is diagnostic material containing validated Session events serialized as canonical JSONL. Provider credential stores and transient OAuth progress are outside Session persistence and are never included, but prompts and tool arguments already present in the durable log remain present; consumers must choose an operator-controlled destination and treat the result as sensitive.

## Table of Contents

- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

| Key | Default | Behavior |
|---|---:|---|
| `compressionLevel` | `6` | Integer fflate DEFLATE level from `0` (store) through `9` (smallest archive). |

## Model Experience

None, as export reads durable artifacts and writes a host file without adding Session events or model-visible content.

#### KV Cache effect

None. Export does not assemble or send provider requests.

## Known Limitations and Deferred Work

- ZIP and Markdown export read logical events through read handles on JSONL and SQLite backends; the ZIP uses the current format's canonical filename. Physical compression and storage layout do not affect the exported log.
- Markdown attachment policy remains reference-only.
- A tree export is a sequence of per-Session durability barriers and reads, not one atomic snapshot across the whole lineage; a live descendant may append after its artifact was read.
- Native publication requires hard-link support in the selected directory. The service fails without publishing a partial final file when the filesystem rejects that operation.

<a id="dev-note"></a>
### Dev Note

None.
