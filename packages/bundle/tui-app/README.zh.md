# `@lingxi-ai-cn/dsh-tui`

[English](README.md) | 中文

这是叠加在官方 `dsh-base` profile 之上的后装原生终端 bundle。其 patch 保留 base 的进程级 agent plane，禁用 HMR，选择进程级工具模式，挂载共享耐久 Session projection cache、原生 Session 归档写入服务、provider-neutral Plugin Hub service 与可信本地 [`@lingxi-ai-cn/dsh-plugin-hub-local`](../../interaction/plugin-hub-local/README.md) provider，解析 `dsh --profile tui [--resume <session-id>]`，并激活 [`@lingxi-ai-cn/dsh-tui-runtime`](../../ui/tui/README.md)。它不挂载 Web server、API Proxy、浏览器 runtime、Workspace UI、preset roster 或 Agent installation tool。该包不提供全局 binary，也不修改已安装的 DSH 应用。

## 安装与运行

把确切版本的 TUI 安装到已有且版本匹配的 DSH 所管理的 profile 中，再通过现有 `dsh` binary 启动该 profile：

```sh
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.9
dsh --profile tui
```

该安装契约假设官方 DSH 初始化一个全新的 `tui` profile。其 active bundle 列表必须严格为 `@deepseek-ai/dsh-base`，随后是 `@lingxi-ai-cn/dsh-tui`。旧版下游构建创建的 `tui` profile 可能仍列出 `@deepseek-ai/dsh-tui-app`；添加公开 bundle 不会移除该旧条目，而两个 patch 都会注册 `storage` 等 loader id。安装公开 bundle 前，应备份并重新创建该 profile：

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.9
```

Session 与凭据存储在 profile 目录之外，不会被此次迁移删除。对于用户自己编写的 profile patch，应审查后重新应用，而不要把整个旧 profile 目录原样复制回来。

该包会在解析命令行和协商终端之前检查每个已声明的官方 Host peer。打包后的包要求 DSH package 版本完全一致，拒绝从 `tui` profile 解析 Host package；版本不匹配时会打印已安装 DSH 版本、支持的 DSH 版本、TUI 版本、profile 和确切恢复命令。DSH 与 TUI 应作为经过测试的组合升级。

pnpm 在把 TUI 安装到隔离 profile 时，可能把官方 Host package 报告为缺少 peer。这些警告符合预期，因为官方 launcher 会从 profile 外部提供精确的 Host package 图。不要把列出的 `@deepseek-ai/*` peer 安装到 `$DSH_HOME/profiles/tui`；startup 会校验外部版本和路径。

公开 bootstrap 不包含下游专用 `openai-codex` adapter。因此，即使 profile 组合成功，持久化的 `agent-default-model.provider: openai-codex` 设置也会使官方安装无法创建 Agent。启动前应备份 settings 文件，并选择官方 base 已包含的 adapter，例如 `deepseek-official` 与 `deepseek-v4-flash`。Provider 凭据仍保留在各 provider 自己的 credential store 中。

Plugin Hub provider 读取 `https://redshell-ai.com:9000`，并使用 [`cordis.patch.yml`](cordis.patch.yml) 内 deployment-owned 的 `registry-2026-08` Ed25519 key 校验 signed installation descriptor。provider 不信任 `/v1/meta` 公布的 signing key，普通 TUI settings 不能替换这个 trust root；fixture 或其他 deployment 必须通过显式 patch 提供自己的配置。已发布 bundle 保持 `profileMutations: false`：发现与已安装 profile 事实继续由原生界面提供，而详情和已安装页 footer 会显示确切 `dsh plugin --profile tui ...` 命令，Enter 绝不会修改运行中的 profile。下游专用 staged maintenance lifecycle 仍可供显式启用并安装了匹配 pre-composition recovery hook 的 composition 使用，但它不属于官方 `0.1.0-rc.8` 后装契约。

Startup provider 持有应用参数与已经成功的 Host 兼容快照，并通过 `tuiStartup` 一并发布。TUI 行通过惰性 Loader 配置读取可选 resume id，同时把同一 startup service 注入 runtime，供仅存在于当前进程的 `/doctor` 报告使用。新 Session 使用本次调用的工作目录。启动恢复只接受不属于 subagent 且没有记录 preset 的 Session，并在 Ink 进入 alternate screen 前拒绝不兼容目标；进程内 `/resume` picker 采用相同检查，并在替代 Agent 发布前保留当前 Agent。Projection cache 与 Web bundle 使用相同的 `$DSH_HOME/storages` JSON backend，因此任一界面都能为另一界面生成绑定日志身份的标题 checkpoint。归档写入服务把耐久 raw artifact 流式写入私有临时文件，只在操作者所选目录中发布完整 ZIP。

## 模型体验

### Harness source 与 TUI surface 上下文

#### 模型看到什么

共享 `harness:source` section 标识磁盘上的 Harness 实现；一个静态 `app:tui-surface` 段落说明用户正通过原生终端 UI 交互，终端／粘贴内容不受信任，且该界面支持 follow-up、steering、斜杠命令、审批与结构化问题。

#### Token 影响

每个 Session 一行 source 与一个固定提示段落；在进程生命周期内保持不变。

#### KV Cache 影响

静态 section 位于 system prompt 前部，并在各 turn 之间保持不变，因此留在可复用前缀内。

## 已知限制与暂缓事项

- **没有 Web/preset 组装**：该 bundle 有意保留 base 进程级 agent 行，因此不支持感知 preset 的跨界面 Session 恢复。
- **只使用官方 base 的模型 adapter**：公开 bootstrap 不包含下游专用 `openai-codex` adapter。
- **插件修改使用外部 CLI**：官方 DSH `0.1.0-rc.8` 没有通用 pre-composition recovery hook，因此已发布 TUI 不会激活其下游专用的进程内 profile swap。
- **只支持 TTY 应用**：重定向 stdin 或 stdout 会在激活前失败；无人值守自动化使用 headless profile。
