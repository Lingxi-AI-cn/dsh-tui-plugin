---
description: "面向官方 DeepSeek Harness Host 的可安装原生终端 profile bundle。"
kind: "package-bundle"
---

# `@lingxi-ai-cn/dsh-tui`

[English](README.md) | 中文

## 概述

这是叠加在官方 [`dsh-base`](../base/README.zh.md) profile 之上的后装原生终端 bundle。其 patch 会移除 base 的进程级 Agent plane，挂载官方 preset roster，以及 Host 侧的 Code Mode 与 Cordis runner，并把 Workspace、Session／file reference、耐久 projection cache、Schedule、有界 directory picker、message feedback、Host plugin inventory、原生 Session 归档写入服务、provider-neutral Plugin Hub service 与可信本地 [`@lingxi-ai-cn/dsh-plugin-hub-local`](../../interaction/plugin-hub-local/README.zh.md) provider 等 terminal-neutral owner 保留在 Host plane。它解析 `dsh --profile tui [--resume <session-id>]`，并激活 [`@lingxi-ai-cn/dsh-tui-runtime`](../../ui/tui/README.zh.md)。它不挂载 Web server、API Proxy、浏览器 runtime、Workspace UI 或 Agent installation tool。该包不提供全局 binary，也不修改已安装的 DSH 应用。

## 目录

- [安装与运行](#install-and-run)
- [Agent 模式](#agent-modes)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="install-and-run"></a>
## 安装与运行

把确切版本的 TUI 安装到已有且版本匹配的 DSH 所管理的 profile 中，再通过现有 `dsh` binary 启动该 profile：

```sh
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.7-alpha.2
dsh --profile tui
```

该安装契约假设官方 DSH 初始化一个全新的 `tui` profile。其 active bundle 列表必须严格为 `@deepseek-ai/dsh-base`，随后是 `@lingxi-ai-cn/dsh-tui`。旧版下游构建创建的 `tui` profile 可能仍列出 `@deepseek-ai/dsh-tui-app`；添加公开 bundle 不会移除该旧条目，而两个 patch 都会注册 `storage` 等 loader id。安装公开 bundle 前，应备份并重新创建该 profile：

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.7-alpha.2
```

Session 与凭据存储在 profile 目录之外，不会被此次迁移删除。对于用户自己编写的 profile patch，应审查后重新应用，而不要把整个旧 profile 目录原样复制回来。

该包会在解析命令行和协商终端之前检查每个已声明的官方 Host peer。官方 `@deepseek-ai/dsh-agent-presets` package 负责提供并校验自身随附的 preset root；TUI 不会猜测相对于应用的路径。打包后的包要求 DSH package 版本完全一致，并拒绝从 `tui` profile 解析 Host package；版本不匹配时会打印已安装 DSH 版本、支持的 DSH 版本、TUI 版本、profile 和确切恢复命令。DSH 与 TUI 应作为经过测试的组合升级。

发布 manifest 会保留精确 Host peer 版本范围，但会将这些 peer 标记为仅对 package-manager 解析可选，因为官方 launcher 会从隔离 profile 外部提供完整 Host 图。正常执行 `dsh plugin` 安装时，不再把这些外部 package 报为缺失，也不会在 `$DSH_HOME/profiles/tui` 内复制它们；startup 仍会要求并校验其精确外部版本与路径。

公开 bundle 包含 [`@lingxi-ai-cn/dsh-llm-openai-codex`](../../llm/llm-openai-codex/README.zh.md)。provider 尚无凭据时，`/models` 会提供 ChatGPT 登录；登录后则列出该账户的模型目录。OAuth 凭据仍位于 adapter 自己管理的 `$DSH_HOME/oauth/openai-codex.json`；安装和升级不会改写它。

Plugin Hub provider 读取 `https://redshell-ai.com:9000`，并使用 [`cordis.patch.yml`](cordis.patch.yml) 内 deployment-owned 的 `registry-2026-08` Ed25519 key 校验 signed installation descriptor。provider 不信任 `/v1/meta` 公布的 signing key，普通 TUI settings 不能替换这个 trust root；fixture 或其他 deployment 必须通过显式 patch 提供自己的配置。已发布 bundle 保持 `profileMutations: false`：发现与已安装 profile 事实继续由原生界面提供，而详情和已安装页 footer 会显示确切 `dsh plugin --profile tui ...` 命令，Enter 绝不会修改运行中的 profile。下游专用 staged maintenance lifecycle 仍可供显式启用并安装了匹配 pre-composition recovery hook 的 composition 使用，但它不属于官方 `0.1.2-alpha.2` 后装契约。

Startup provider 持有应用参数、经过校验的官方 preset root 与已经成功的 Host 兼容快照，并通过 `tuiStartup` 一并发布。TUI 行通过惰性 Loader 配置读取可选 resume id，同时把同一 startup service 注入 runtime，供仅存在于当前进程的 `/doctor` 报告使用。新 Session 使用本次调用的工作目录与 roster default。启动恢复会从 Session header 与最新耐久 `agent-preset/selected` event 解析实际 preset，在 Ink 进入 alternate screen 前拒绝 subagent、缺失、损坏或旧版 rosterless target，并在发布 Agent 前挂载解析出的 preset。进程内 `/resume` picker 采用相同检查，并在替代 Agent 发布前保留当前 Agent。Projection cache 与 Web bundle 使用相同的 `$DSH_HOME/storages` JSON backend，因此任一界面都能为另一界面生成绑定日志身份的标题 checkpoint。归档写入服务把耐久 raw artifact 流式写入私有临时文件，只在操作者所选目录中发布完整 ZIP。

<a id="agent-modes"></a>
## Agent 模式

TUI 使用与 Web 相同的动态 `ctx.agentPresets` roster 和耐久 Session identity。4 种官方模式如下：

| 显示名称 | Preset id | 组装内容 |
|---|---|---|
| Standard | `standard` | 完整编码 Agent，提供原生工具、skill、计划、目标、子代理与工作流。 |
| PTC | `ptc` | 向模型提供 TypeScript Code Mode SDK 与 `run_code`，以这种形式呈现 Standard 的能力。 |
| Minimal | `minimal` | 使用官方固定提示词，并且仅提供持久化 `bash` 与 `str_replace_editor`。 |
| Creator | `cordis` | 提供 Standard 的能力，并增加 runtime 检查、plugin 实验与 preset 创作指导。 |

`/mode` 与可操作 footer 会列出这些 system preset，以及 `$DSH_HOME/.agent-presets` 中健康的 user preset。空白 Session 会通过官方 recompose transaction 原地切换，并且只在新组装提交后记录 `agent-preset/selected`。一旦存在 `turn/start`，选择另一种模式会打开现有的新 Session 确认；取消会保持当前 Agent、transcript、draft 和 footer 不变，确认则以所选 preset 创建新 Session，并让旧 Session 继续可恢复。`/new`、`/clear` 与 `/rewind` 会继承当前 Session 的实际 preset。`/presets` 增加 owner 提供的结构化组合条目、原子复制、检查、Host-open、user-owned 删除，以及在 preset owner 暴露 settings compare-and-set seam 时可用的未来默认值选择；缺失或损坏的 preset 保持可见但不可选择。Schedule owner 提供面向模型的 create/list/delete tool，`/schedules` 与 footer 则把其活动 projection 显示为只读终端 panel。

<a id="model-experience"></a>
## 模型体验

### Harness source 与 TUI surface 上下文

#### 模型看到什么

共享 `harness:source` section 标识磁盘上的 Harness 实现；一个静态 `app:tui-surface` 段落说明用户正通过原生终端 UI 交互，终端／粘贴内容不受信任，且该界面支持 follow-up、steering、斜杠命令、审批与结构化问题。

#### Token 影响

每个 Session 一行 source 与一个固定提示段落；在进程生命周期内保持不变。

#### KV Cache 影响

静态 section 位于 system prompt 前部，并在各 turn 之间保持不变，因此留在可复用前缀内。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- **Preset 源文件编辑使用 Host**：manager 负责默认选择、复制、检查与删除，但通过 Host 打开 composition 文件，不内嵌 YAML editor。
- **Codex 登录只在 TUI 提供**：公开 bundle 增加原生 ChatGPT OAuth 与账户模型发现；Web Models 页面不运行该登录流程。
- **插件修改使用外部 CLI**：官方 DSH `0.1.2-alpha.2` 没有通用 pre-composition recovery hook，因此已发布 TUI 不会激活其下游专用的进程内 profile swap。
- **只支持 TTY 应用**：重定向 stdin 或 stdout 会在激活前失败；无人值守自动化使用 headless profile。

<a id="dev-note"></a>
### 开发备注

无。
