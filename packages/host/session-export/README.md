# `@lingxi-ai-cn/dsh-session-export`

English | [中文](README.zh.md)

Host-owned Session-log ZIP producer, human-readable Markdown projection, and native path writer. The `SessionLogExporter` service (`ctx.sessionLogExporter`) flushes each live Session before reading its persistence backend's raw artifact, streams the root artifact, optional descendants, and referenced images through bounded fflate compression, and never reconstructs the raw archive from parsed events. `stream()` exposes the archive to a host transport; `writeToDirectory()` writes the same archive to an existing absolute directory and returns its exact final path. `writeMarkdownToDirectory()` separately reads the validated logical events and publishes a summary-only Markdown projection.

The native writer creates an owner-only random sibling, forwards cancellation through root preparation, lineage, persistence, attachment reads, compression, and file writes, syncs and closes the complete file, then publishes it with an exclusive hard link. Existing exports are never overwritten: the first collision uses `-2`, followed by increasing suffixes. A failure before publication removes the partial sibling and leaves no final archive. The destination filesystem must support same-directory hard links.

Markdown export is intentionally a human-readable projection, not a replacement for the raw archive. It includes the current surface of the root and optional descendants, bounded user/assistant text, tool names and bounded result summaries, and explicit sequence/time facts. Tool argument values are omitted by default and marked as omitted; the exporter does not offer a silent sensitive-detail mode. Image attachments use `attachment:<id>` reference-only links and are never copied into the Markdown file. The same private sibling, cancellation, `0600` mode, collision suffix, and exclusive hard-link publication rules apply to `.md` output.

Expected preparation failures use `SessionLogExportError`: `services-unavailable`, `raw-artifacts-unsupported`, `session-not-found`, and `prepare-failed`. Destination and output failures use `destination-invalid` and `write-failed`. The operator-facing messages do not expose backend preparation errors; the original error remains attached as `cause` for host diagnostics. Signal cancellation preserves the signal's reason instead of becoming an export failure.

The archive is diagnostic material containing the stored Session artifacts verbatim. Provider credential stores and transient OAuth progress are outside Session persistence and are never included, but prompts and tool arguments already present in the durable log remain present; consumers must choose an operator-controlled destination and treat the result as sensitive.

## Configuration

| Key | Default | Behavior |
|---|---:|---|
| `compressionLevel` | `6` | Integer fflate DEFLATE level from `0` (store) through `9` (smallest archive). |

## Model Experience

None, as export reads durable artifacts and writes a host file without adding Session events or model-visible content.

#### KV Cache effect

None. Export does not assemble or send provider requests.

## Known Limitations and Deferred Work

- Persistence backends that do not expose per-Session raw artifacts cannot export; the shipped JSONL backend supports plaintext and zstd artifacts, while SQLite does not.
- Markdown projection can use a backend's validated logical `inspect()` API even when raw-artifact ZIP export is unavailable; its attachment policy remains reference-only.
- A tree export is a sequence of per-Session durability barriers and reads, not one atomic snapshot across the whole lineage; a live descendant may append after its artifact was read.
- Native publication requires hard-link support in the selected directory. The service fails without publishing a partial final file when the filesystem rejects that operation.
