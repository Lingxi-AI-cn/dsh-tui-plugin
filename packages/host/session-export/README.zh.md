# `@lingxi-ai-cn/dsh-session-export`

[English](README.md) | 中文

宿主侧拥有的 Session 日志 ZIP 生产器与原生路径写入器。`SessionLogExporter` 服务（`ctx.sessionLogExporter`）会在读取持久化后端的原始工件前 flush 每个实时 Session，通过有界 fflate 压缩流式输出根工件、可选后代和引用的图片，并且绝不从解析后的事件重建存储日志。`stream()` 向宿主传输层提供归档；`writeToDirectory()` 把同一归档写入一个既有的绝对目录，并返回精确的最终路径。

原生写入器先创建一个仅所有者可读写的随机同级文件，把取消转发到根工件准备、血缘、持久化、附件读取、压缩和文件写入，随后同步并关闭完整文件，最后通过排他硬链接发布。既有导出永远不会被覆盖：第一次冲突使用 `-2`，随后递增后缀。发布前的失败会删除局部同级文件，不留下最终归档。目标文件系统必须支持同目录硬链接。

预期的准备失败使用 `SessionLogExportError`：`services-unavailable`、`raw-artifacts-unsupported`、`session-not-found` 和 `prepare-failed`。目标与输出失败使用 `destination-invalid` 和 `write-failed`。面向操作者的消息不会泄露后端准备错误；原始错误保留为 `cause`，供宿主诊断。signal 取消会保留 signal 的 reason，而不会改写成导出失败。

该归档是逐字包含所存 Session 工件的诊断材料。提供方凭据存储和 transient OAuth 进度位于 Session 持久化之外，绝不会包含在内；但已经进入持久日志的 prompt 与工具参数仍会保留，因此 Consumer 必须选择由操作者控制的目标位置，并把结果视为敏感材料。

## 配置

| 键 | 默认值 | 行为 |
|---|---:|---|
| `compressionLevel` | `6` | 从 `0`（仅存储）到 `9`（最小归档）的整数 fflate DEFLATE 级别。 |

## 模型体验

无，因为导出只读取持久工件并写入宿主文件，不增加 Session 事件或模型可见内容。

#### KV Cache 影响

无。导出不会组装或发送提供方请求。

## 已知限制与暂缓事项

- 不提供逐 Session 原始工件的持久化后端无法导出；随附的 JSONL 后端支持明文与 zstd 工件，SQLite 尚不支持。
- 树导出是一系列逐 Session 的持久性屏障与读取，并非覆盖整条血缘的一次原子快照；实时后代可能在自身工件被读取后继续追加。
- 原生发布要求所选目录支持硬链接。文件系统拒绝该操作时，服务会失败且不会发布局部最终文件。
