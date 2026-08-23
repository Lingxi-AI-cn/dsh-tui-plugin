# @lingxi-ai-cn/dsh-plugin-hub

中文 | [English](README.md)

这是通过 `ctx.pluginHub` 提供的 provider-neutral 人工 Plugin Hub 能力。服务拥有稳定的目录、installed state、detached plan、staging 和 activation handoff DTO，以及 provider 注册、临时 progress event、错误分类和显式 `supportsProfileMutations()` capability；HTTP、cache、signature、profile 修改、包管理器、journal 和 maintenance process 都属于 provider。只提供目录的 provider 会报告 `false`，因此 consumer 可以继续提供发现与已安装事实，而不呈现进程内修改操作。

目录详情 DTO 会保留 repository archive 状态、声明与验证过的 operating system、有界 curation note，以及带 severity 与 recommended action 的结构化 advisory。这些只是发现和风险展示事实；任何一项都不能确立 installability，也不能替代 signed descriptor 校验。

目录 row 还可以携带由 Registry 提供的 category、package kind、metadata source 和 repository primary language。这些字段只用于展示和可选搜索筛选；client 不会从 README text、description、repository name 或 popularity 推断它们。

目录 search 接受 provider-neutral 的 `relevance`、`stars`、`updated` 和 `newest` ordering。provider 会保持 continuation cursor opaque，并将其绑定到包含 ordering 在内的完整 request；目录 ordering 只属于人工发现 state，不会影响 installability 或 verification。

provider 还可以提供独立的发现仓库 page。Discovery row 携带 repository sync、exact-head scan、rejection、package 和 published projection 事实；它们只能浏览，绝不表示存在可安装版本。consumer 必须将该视图与 installable catalog 分开，并且不能把 discovery row 传入安装计划。

安装计划只接受 opaque `PluginId` 和 `PluginVersionId`。plan 公开精确确认事实，但绝不公开 artifact URL、本地路径、executable、包管理器参数或 signature bypass。staging 和 activation 只接受 provider 签发的 branded id；`markMaintenanceReady()` 在 authenticated relaunch handoff 之外是 no-op。

## Model Experience

无，因为该服务只向人工 UI consumer 提供目录、README 和进度，并且绝不会将它们写入 Session log。

#### KV Cache effect

无影响；该服务不会添加、替换或保留模型请求内容。

## Known Limitations and Deferred Work

- **需要 provider 实现** — Service Definition 自身不执行 Registry 校验或 profile 修改；挂载的 Host provider 拥有全部 trust 和 transaction decision。
- **无 rollback contract** — generation 保留、history、rollback plan 和 advisory remediation 不属于首个安装 lifecycle。
