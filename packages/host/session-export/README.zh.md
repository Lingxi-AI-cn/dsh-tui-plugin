---
description: "基于官方 durable persistence owner 的原生原子 Session archive 与 Markdown 导出。"
kind: "package-reference"
---

# `@lingxi-ai-cn/dsh-session-export`

[English](README.md) | 中文

## 概述

基于官方 [`@deepseek-ai/dsh-session-log-export`](../../session-query/session-log-export/README.zh.md) 生产器的原生 Session 归档写入器与人类可读 projection。`SessionLogExporter` 服务（`ctx.sessionLogExporter`）复用该包的根工件预检、原始工件 ZIP 流、后代顺序、附件收集、压缩、背压与取消。`stream()` 向原生消费方暴露官方归档流；`writeToDirectory()` 把它写入既有的绝对宿主目录，并返回精确的最终路径。`writeMarkdownToDirectory()` 则独立读取已验证的逻辑事件并发布仅供摘要阅读的 Markdown projection。

该适配器只增加原生发布：先创建一个仅所有者可读写的随机同级文件，把取消转发到官方生产器和文件写入，随后同步并关闭完整文件，最后通过排他硬链接发布。既有导出永远不会被覆盖：第一次冲突使用 `-2`，随后递增后缀。发布前的失败会删除局部同级文件，不留下最终归档。目标文件系统必须支持同目录硬链接。

Markdown 导出明确是人类可读 projection，不替代官方原始归档。它包含根 Session 及可选后代的当前表层、有界的用户/助手文本、工具名称、有界结果摘要，以及明确的 seq/time 事实。工具参数值会被省略并明确标记。图片附件只使用 `attachment:<id>` 引用，其字节绝不复制到 Markdown 文件。同一私有同级临时文件、取消、`0600` 权限、冲突后缀和排他硬链接发布规则也适用于 `.md` 输出。

预期的准备失败使用 `SessionLogExportError`：`services-unavailable`、`raw-artifacts-unsupported`、`session-not-found` 和 `prepare-failed`。目标与输出失败使用 `destination-invalid` 和 `write-failed`。面向操作者的消息不会泄露后端准备错误；原始错误保留为 `cause`，供宿主诊断。signal 取消会保留 signal 的 reason，而不会改写成导出失败。

该归档是逐字包含所存 Session 工件的诊断材料。提供方凭据存储和 transient OAuth 进度位于 Session 持久化之外，绝不会包含在内；但已经进入持久日志的 prompt 与工具参数仍会保留，因此 Consumer 必须选择由操作者控制的目标位置，并把结果视为敏感材料。

## 目录

- [配置](#configuration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration"></a>
## 配置

| 键 | 默认值 | 行为 |
|---|---:|---|
| `compressionLevel` | `6` | 从 `0`（仅存储）到 `9`（最小归档）的整数 fflate DEFLATE 级别。 |

<a id="model-experience"></a>
## 模型体验

无，因为导出只读取持久工件并写入宿主文件，不增加 Session 事件或模型可见内容。

#### KV Cache 影响

无。导出不会组装或发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- 不提供逐 Session 原始工件的持久化后端无法导出；随附的 JSONL 后端支持明文与 zstd 工件，SQLite 尚不支持。
- 即使官方原始工件 ZIP 不可用，Markdown projection 仍可使用后端已验证的逻辑 `inspect()` API；附件策略仍固定为仅引用。
- 树导出是一系列逐 Session 的持久性屏障与读取，并非覆盖整条血缘的一次原子快照；实时后代可能在自身工件被读取后继续追加。
- 原生发布要求所选目录支持硬链接。文件系统拒绝该操作时，服务会失败且不会发布局部最终文件。

<a id="dev-note"></a>
### 开发备注

无。
