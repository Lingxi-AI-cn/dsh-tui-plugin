# DeepSeek Harness TUI 插件

[English](README.md)

这是面向官方 DeepSeek Harness 的可独立安装原生终端界面。本仓库发布一个用户入口包 `@lingxi-ai-cn/dsh-tui`，以及同一 npm scope 下五个精确版本内部包。

## 已发布版本

| 发布面 | 当前公开产物 |
| --- | --- |
| 源码 | [`Lingxi-AI-cn/dsh-tui-plugin`](https://github.com/Lingxi-AI-cn/dsh-tui-plugin)，默认分支 `main` |
| Release | [`v0.1.0-rc.8`](https://github.com/Lingxi-AI-cn/dsh-tui-plugin/releases/tag/v0.1.0-rc.8)，pre-release |
| npm入口 | [`@lingxi-ai-cn/dsh-tui@0.1.0-rc.8`](https://www.npmjs.com/package/@lingxi-ai-cn/dsh-tui/v/0.1.0-rc.8) |
| 自动矩阵 | Ubuntu 24.04与macOS 14：公开源码校验、测试、构建、包审计、官方DSH clean-room和PTY退出 |

发布时npm `next`和`latest`都把用户入口包解析到`0.1.0-rc.8`。本版本故意只支持精确匹配的官方Harness release，不推断兼容后续候选版。

## 兼容性

| TUI | DeepSeek Harness | Node.js | 发布等级 |
| --- | --- | --- | --- |
| `0.1.0-rc.8` | 精确匹配 `0.1.0-rc.8` | `^22.19.0` 或 `>=24` | bootstrap |

bootstrap 版本提供原生会话界面、Session 导航、审批与提问、工具呈现、耐久 Tasks、Session 归档导出和只读 Plugin Hub。插件安装、更新和移除通过官方外部 `dsh plugin` 命令完成。

## 安装

先安装官方 Harness，再把精确版本的 TUI 加入独立 profile：

```sh
npm install --global @deepseek-ai/dsh@0.1.0-rc.8
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
dsh --profile tui
```

如果使用项目本地 Harness，请通过该安装中的 `dsh` 二进制执行相同命令。

### 已有 `tui` profile

该 profile 必须只包含官方 base bundle 与 Lingxi TUI bundle。如果 `$DSH_HOME/profiles/tui/package.json` 仍列出旧的 `@deepseek-ai/dsh-tui-app`，添加本包会让两个 patch 同时生效，启动将以 `duplicate loader entry id: storage` 失败。先保留旧 profile 作为备份，再让官方 DSH 创建干净 profile：

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.0-rc.8
```

Session 与凭据位于 profile 目录之外。只重新应用经过审查的自定义 profile patch，不要把整个旧 profile 原样复制回来。

pnpm 在 profile 安装期间打印的 missing-peer 列表符合预期。官方 DSH 会从自己的安装目录提供这些精确 Host package；如果把建议的 `@deepseek-ai/*` peer 安装到 profile 中，反而会创建重复的 Host package 图。

bootstrap release 不包含 `openai-codex` adapter。如果已有 `$DSH_HOME/settings.yaml` 选择了该 provider，应先备份文件，再把默认模型改为官方 DSH 提供的 adapter，例如：

```yaml
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash
```

安装官方 DSH 时出现的 npm `install-scripts` 警告与 plugin profile 的警告相互独立。如果决定启用这些官方 native helper，请执行 npm 当时打印的 `--allow-scripts` 命令；不要把相关 package 安装进 TUI profile。

## 构建与验证

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:clean-room
```

clean-room 门禁会从 npm 安装未经修改的官方 Harness，通过 `dsh plugin` 安装本地打包的 TUI，断言精确的双 bundle profile 组合，完成 PTY 启动，使用 `/quit` 退出并恢复终端，同时确认官方安装目录没有被修改。

本仓库是经过清理的公开发布面。修改package源码时必须保持六包版本和内部精确依赖一致，重新生成`SOURCE_MANIFEST.json`，并遵守[AGENTS.md](AGENTS.md)。公开release tag和npm版本不可覆盖或移动。

## 安全提示

DSH 插件在 Harness Host 进程内以用户的操作系统权限执行，不受模型工具 sandbox 限制。只安装可信来源和版本。Session 归档可能包含 prompt、工具参数与结果以及工作区路径。漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## License

MIT
