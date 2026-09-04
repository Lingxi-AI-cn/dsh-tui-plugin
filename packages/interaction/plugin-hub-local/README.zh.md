---
description: "Plugin Hub 的可信本地 Registry client、artifact verifier 与可选 profile transaction provider。"
kind: "package-reference"
---

# @lingxi-ai-cn/dsh-plugin-hub-local

[English](README.md) | 中文

## 概述

这是可信本地 Plugin Hub provider。部署显式提供 HTTPS `registryUrl` 和本地固定的 Ed25519 key；缺少配置时可选 provider 不挂载。目录响应会进行 runtime parse 和 API 版本校验，最多在配置的 Registry origin 内跟随三次 redirect，限制字节数并遵守调用方取消；Registry 暂时不可用时保留进程内 last-good view。HTTP 304 响应会验证匹配的 ETag entry，并返回其 cached value 而不把目录标记为 stale；其他 Registry failure 可以使用 last-good fallback。Registry detail 响应会归一化 `validationMatrix` row（`manifest`、`install` 和 `tui-boot`），并严格把 quarantine、repository archive、operating-system、curation 和结构化 advisory 事实投影为 provider-neutral DTO；detail metadata 异常时会 fail closed。

## 目录

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

`profileMutations` 默认为 `false`。在这种适用于后装插件的安全模式中，Registry 浏览和 active-profile `installed()` 事实仍然可用，修改方法以 `CONTRACT_UNSUPPORTED` 失败，启动 ready 操作则为空操作。已发布 TUI bundle 使用该模式，因为官方 DSH `0.1.2-rc.1` 在 profile composition 之前没有通用 recovery hook；用户通过 `dsh plugin --profile tui ...` 执行修改。设置 `profileMutations: true` 会启用下文所述的 downstream maintenance lifecycle，只供安装了配套 pre-composition recovery hook 的 composition 使用。

目录 search 会把 provider-neutral 的 `relevance`、`stars`、`updated` 或 `newest` ordering 传给 Registry，将 ordering 纳入 request cache key，并让 signed snapshot fallback 使用相同 ordering 和 cursor binding。Registry 返回 `INVALID_CURSOR` 时会保留为 typed provider error，不会静默从第一页重启。

provider 通过 `searchRepositories()` 转发独立的 `/v1/discovery/repositories` 视图。Discovery row 会做有界 contract 校验，提供 repository/scan/package/projection 状态，但绝不会进入 `planInstall()`；只有 `/v1/plugins` row 可以进入安装计划。

provider 会对 Registry 提供的 category、package kind、metadata source 和 repository primary language 做有界的 fail-closed 校验。category、kind 和 language filter 会传给 live Registry request、进入 cache identity，并以相同语义应用于 fixture 和 signed-snapshot fallback；这些字段不会影响 installability 或 descriptor verification。

启用 profile 修改时，`planInstall()` 只接受 opaque plugin 和 version id，然后由 provider 自己获取 fresh signed descriptor。provider 会核对 selected id、key validity、descriptor 时间区间、exact `tui` surface、DSH semver range、npm-tarball policy、compressed size、package identity、lifecycle-script inventory 和 SHA-512 digest。每次 artifact redirect 都重新校验；production artifact 仅允许 `https://registry.npmjs.org`，显式 loopback HTTP 只供 fixture 使用。verified bytes 通过原子 link 发布为 `$DSH_HOME/plugin-hub/artifacts/sha512/<digest>.tgz`；tarball suffix 保留 pnpm 对本地 package 的解析方式，digest 则保留 content-addressed identity。公开 detached plan 不包含 URL 和 filesystem path。`installed()` 始终从 active profile manager 派生；启用修改时，`planRemove()` 也使用同一事实来源。

`stage()` 会先写入并 fsync private transaction journal，然后在不跟随 symlink 的情况下复制 active profile。它会重新核对 copied baseline revision，在 inactive directory 中通过 shared manager 应用 exact cached artifact，协调 bundle order，验证 installed manifest 与 lockfile fact，解析每个 bundle/profile patch，并组合结果 entry list。pnpm、取消、revision 或 validation failure 会标记 journal，而且只移除 staging generation。activation handoff 开始前可调用 `discard()`。

`createMaintenanceHandoff()` 会启动 package-owned helper，并且只在 helper 持有 shared profile lock 后返回。helper 等待旧 DSH process 退出，把 staged generation 换入固定 `tui` profile，以受限 environment 重启捕获的 DSH invocation，并且只在新 process 写入绑定 nonce、PID 和 revision 的 ready marker 后 commit。新启动失败时，helper 会先终止该 process，再恢复并重启旧 generation。启动恢复会处理任一次 rename 处的崩溃，根据 exact ready marker 前滚，并在磁盘状态不明确时 fail loud。committed receipt 是 managed installation identity 的本地来源；remote Catalog 绝不参与 installed truth。

## Model Experience

无，因为 provider 请求和响应只用作人工 TUI 数据，绝不会进入模型请求或 Session history。

#### KV Cache effect

无影响；目录刷新和缓存记录不会改变模型请求内容。

## Known Limitations and Deferred Work

- **目录 cache 仍在内存** — signed artifact 使用持久 content-addressed cache，但 Catalog query/detail ETag 和 last-good snapshot 属于进程本地状态。
- **尚无用户选择的 rollback** — failed-boot 自动恢复会保留 old 与 failed generation，但 history retention、清理和显式 rollback action 仍然延后。

<a id="dev-note"></a>
### 开发备注

无。
