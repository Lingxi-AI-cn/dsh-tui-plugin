---
description: "供受信任 Consumer 使用的 Host 侧 profile 检查、detached package plan、精确本地修改、加锁和校验。"
kind: "package-reference"
---

# `@lingxi-ai-cn/dsh-profile-plugin-manager`

[English](README.md) | 中文

## 概述

这是供命令行和受信任本地 Consumer 共享的 Host 侧 profile 插件管理包。`ProfilePluginManager` 接收显式 profile 目录和共享 lock 路径；它不从 TUI 输入选择 profile，不获取 Registry 数据、不验证 descriptor、不渲染 UI，也不激活 generation。

## 目录

- [操作](#operations)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="operations"></a>
## 操作

- `inspectInstalled()` 从 `package.json.dependencies`、有序的 `dsh.profile.bundles`、已解析的 package manifest、`pnpm-lock.yaml` 和可选本地 Hub receipt 推导本地事实。远程 Catalog 状态绝不是 installed truth。
- `plan()` 返回有有效期且 detached 的 install、update 或 remove plan，其中包含精确 profile revision、before 状态、预期 bundle 顺序、重启要求和 lifecycle script 风险。生成 plan 不修改 profile。
- `installExact()` 和 `updateExact()` 只接受绝对本地 artifact 路径及精确 package identity。在把路径交给 pnpm 之前，会立即检查可选 SHA-512 digest 和字节大小；这些 API 不接受 mutable package spec。
- 类型化安装在 profile 的 `.dsh-artifacts/` 目录保存经过摘要复核的 tarball，并使用短相对依赖路径。切换 generation 后该路径仍然有效，也避免外部缓存长路径触发 pnpm 存储文件名限制。保留的 tarball 随 profile 一同复制。
- `removePackage()` 接受一个经过校验的 package name。每次 mutation 成功后都会通过与 CLI passthrough 相同的 installed-state 算法协调 bundle list。
- `materializeProfile()` 在不跟随 symlink 的情况下复制完整 profile；`validateProfile()` 检查 dependency、lockfile 事实、bundle entry、bundle patch 和 profile patch 层。
- `runPnpm()` 保留高级 `dsh plugin` passthrough 约定（包括可选继承 stdin），同时使用异步、无 shell 的 argv spawn、取消、wall-clock timeout 和有界 stdout/stderr retention。

`withProfilePluginLock()` 使用原子创建的目录，并记录 owner PID、process start identity、transaction id、时间戳和 nonce。竞争者只会回收能够证明已 stale 的 owner；owner 存活或无法验证时以 `PROFILE_BUSY` 失败。常规 profile Consumer 使用 `resolveProfilePluginLockPath(profileDir)` 推导唯一 lock 路径。

每次 typed mutation 都会在 lock 内重新检查 detached plan revision。profile 已变化时返回 `PROFILE_CHANGED`，plan 过期时返回 `PLAN_EXPIRED`，本地 artifact 缺失或变化时返回 `INVALID_ARTIFACT`。pnpm failure 分别保留 exit、signal、timeout、cancellation 和 output truncation 事实；build policy 诊断映射为 `BUILD_NOT_ALLOWED`，且不会修改 `pnpm-workspace.yaml`。

<a id="model-experience"></a>
## 模型体验

无，因为 profile 检查和 package manager 执行不注册 prompt、tool、message 或 provider request。

#### KV Cache 影响

无；本包绝不组装模型输入。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- **不做 Registry 信任决策** - 受信任调用方必须先验证 descriptor identity、compatibility、artifact size 和 digest，再构造 `ProfilePluginArtifact`；manager 只复查所提供的本地文件事实。
- **没有 activation transaction** - materialization 会写入独立目录，但 generation journal、active profile swap、maintenance helper、ready marker、recovery 和 rollback 不属于本 package stage。
- **Windows 需要无 shell 的 pnpm 入口** - `.cmd` shim 不会通过 command shell 执行；Windows Consumer 必须提供可直接执行的 pnpm command，例如 Node 加 pnpm 的 JavaScript entry。

<a id="dev-note"></a>
### 开发备注

无。
