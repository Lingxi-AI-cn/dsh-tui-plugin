# DSH TUI

[![npm](https://img.shields.io/npm/v/@lingxi-ai-cn/dsh-tui?label=npm)](https://www.npmjs.com/package/@lingxi-ai-cn/dsh-tui)
[![CI](https://github.com/Lingxi-AI-cn/dsh-tui-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Lingxi-AI-cn/dsh-tui-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md)

**面向官方 DeepSeek Harness、可后装的原生终端界面。**

DSH TUI 在不替换、不修改官方 Harness 安装的前提下，为终端提供完整的全屏编码 Agent 体验。它通过独立 DSH profile 安装，继续使用上游 Agent loop 与耐久 Session 模型，同时补充清晰的对话界面、鼠标辅助导航、Session 工作流、运行时诊断与 Plugin Hub 浏览能力。

> 这是一个独立的社区插件。插件运行在 DeepSeek Harness Host 进程中，并遵循官方 Harness 的插件与 profile 机制。

## 界面预览

| English | 中文 |
| --- | --- |
| [![English startup screen](screenshots/screenshot_en.jpg)](screenshots/screenshot_en.jpg) | [![中文启动界面](screenshots/screenshot_cn.jpg)](screenshots/screenshot_cn.jpg) |

## 特色功能

### 原生对话体验

- 全屏终端工作区集成紧凑实时 Transcript、居中启动界面、模型状态、权限、工作区、上下文压力和 Transcript 位置。
- 结构化显示 Markdown、推理过程、工具调用与结果、Diff、搜索、Web 活动、上下文压缩、委派 Agent 和耐久 Tasks。
- 基于物理终端行的虚拟化与 Unicode 宽度布局，使长 Session 和窄终端仍保持流畅、易读。

### 以 Session 为中心的工作流

- 使用 `/resume` 恢复历史工作，使用 `/new` 或 `/clear` 创建干净 Session，并可通过 `/rewind` 从更早的安全人类 turn 创建分支。
- 浏览和搜索完整耐久 Transcript，查看完整块详情，在根 Agent 与存活子 Agent 之间切换，并监控可取消的后台工作。
- 使用 `/export` 导出 Session 以便审阅或备份；prompt、工具活动和工作区路径会作为明确的诊断数据保留。

### 高效键盘与鼠标交互

- 支持命令与路径补全、已提交 prompt 历史、完整 Transcript 搜索、草稿暂存、撤销/重做、多行编辑、外部编辑器和有界剪贴板操作。
- 协商后的鼠标能力可用于滚动 Transcript 和选择常用界面目标；也可在 `/config` 中把选择与滚动交还外层终端。
- 单一可配置交互注册表同时驱动运行时按键和 `/help` 面板，让当前可用手势始终可发现。

### 模型、权限与人类决策

- `/models` 发现已配置的提供方和模型，支持提供方拥有的认证流程，并在模型允许时选择精确推理强度。
- 随包提供的 OpenAI Codex adapter 会显示 **使用 ChatGPT 登录**，把可刷新的 OAuth 凭据存到 `$DSH_HOME/oauth/openai-codex.json`，并动态发现当前登录账户可用的模型目录。
- 审批请求和结构化用户问题通过有界原生对话框呈现，不混入普通 Transcript 状态。
- 可操作 Footer 可直接打开模型、权限、后台工作、上下文、工作区和 Transcript 详情，无需离开当前 Session。

### 中英文与终端适配

- 使用 `/lang en` 或 `/lang zh` 运行时切换第一方界面语言；菜单、提示、对话框、Plugin Hub 框架和 Footer 详情会同步切换。
- 自动、深色、浅色和无颜色主题，在有限色彩终端中仍保留明确的语义状态。
- Unicode 显示宽度布局、真实 IME 光标锚点、有界终端能力协商和幂等退出流程，共同保护 CJK 输入并在退出时恢复终端状态。

### Plugin Hub 与诊断

- `/plugins` 浏览签名 Registry、已安装 profile 事实、版本、兼容性、验证级别、安全建议和经过清理的 README 内容。
- Profile 变更继续使用官方 `dsh plugin` 路径；TUI 显示精确安装或移除命令，不建立第二套包管理权限。
- `/doctor` 检查 Host/TUI 能力，`/context` 查看当前模型、权限、工具、skills 和 system prompt 贡献者。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `/models` | 选择提供方、模型和推理强度 |
| `/config` | 配置主题、鼠标所有权和按键绑定 |
| `/lang en\|zh` | 切换 TUI 语言 |
| `/resume` | 搜索并恢复耐久 Session |
| `/new`、`/clear` | 在当前工作区创建新 Session |
| `/rewind` | 从更早的安全 turn 创建子 Session |
| `/export` | 导出耐久 Session 数据 |
| `/plugins` | 浏览可发现插件与已安装插件 |
| `/doctor` | 检查运行状态与能力 |
| `/context` | 查看已加载上下文事实 |
| `/help` | 查看命令与当前有效交互按键 |
| `/quit`、`/exit` | 恢复终端并安全退出 |

## 兼容性

下一个公开源码候选有意与对应的官方 Harness 版本精确绑定。在该候选被打 tag 并发布以前，npm 当前已发布版本仍是 `0.1.0-rc.9`。

| DSH TUI | DeepSeek Harness | Node.js | 平台 |
| --- | --- | --- | --- |
| `0.1.1-rc.8` | 精确匹配 `0.1.0-rc.8` | `^22.19.0` 或 `>=24` | macOS 14 与 Ubuntu 24.04 CI |

只有在精确官方包 clean-room 安装、profile 组合、PTY 启动/退出和终端恢复验证完成后，才会增加对新 Harness 版本的支持。

TUI 核心版本独立递增（这里是 `0.1.1`），最后的预发布后缀（`rc.8`）则始终表示兼容的官方 Harness 预发布版本。这样不会让用户把一次 TUI 迭代误认为上游 DSH 已升级。

## 安装

先安装精确支持的官方 Harness，再把 DSH TUI 加入独立的 `tui` profile：

```sh
npm install --global @deepseek-ai/dsh@0.1.0-rc.8
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.1-rc.8
dsh --profile tui
```

如果使用项目本地安装的 Harness，请通过该安装中的 `dsh` 二进制执行同样的 profile 命令。

首次启动后可使用：

```text
/models      选择模型提供方或完成认证
/lang zh     切换到中文
/config      配置主题、鼠标行为和按键绑定
/help        查看命令与当前快捷键
```

### 已有或旧版 `tui` profile

规范 profile 必须只包含 `@deepseek-ai/dsh-base`，随后是 `@lingxi-ai-cn/dsh-tui`。如果旧 profile 仍包含 `@deepseek-ai/dsh-tui-app`，请先保留备份，再让官方 DSH 创建干净 profile：

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
mv "$DSH_HOME/profiles/tui" "$DSH_HOME/profiles/tui.before-lingxi"
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.1-rc.8
```

Session 和凭据位于 profile 目录之外。只重新应用经过审查的自定义 patch，不要把旧 profile 整体复制回来。

<details>
<summary>安装说明</summary>

- pnpm 在安装 profile 时可能打印 missing-peer 警告。官方 DSH 会提供这些精确 Host package；把建议的 `@deepseek-ai/*` peer 安装到 profile 中反而可能创建重复 Host 图。
- TUI bundle 已包含 Codex adapter，但安装过程不会启动 OAuth，也不会修改现有提供方凭据。需要连接账户时，请在 `/models` 中选择 **使用 ChatGPT 登录**。
- npm 可能询问是否允许官方 DSH 原生 helper 的安装脚本。请按 npm 针对官方安装打印的提示处理，不要把这些 package 加入 TUI profile。

</details>

## 升级或重新安装

安装声明兼容当前官方 Harness 版本的精确 TUI 版本：

```sh
dsh plugin --profile tui add --save-exact @lingxi-ai-cn/dsh-tui@0.1.1-rc.8
```

Release tag 和 npm 版本不可覆盖或移动。不要混用不同 release candidate 的 package。

## 卸载

通过官方插件命令移除用户入口 bundle：

```sh
dsh plugin --profile tui remove @lingxi-ai-cn/dsh-tui
```

卸载 bundle 不会删除 Harness Session、凭据或用户编写的 profile patch。

## 从源码构建

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:clean-room
```

验证流程会检查公开源码卫生、测试、构建产物、精确七包 tarball 闭包、官方 DSH clean-room 组合、Codex 登录行、PTY 启动与 `/quit`，以及终端状态恢复。修改 package 行为前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [AGENTS.md](AGENTS.md)。

## 安全提示

DSH 插件在 Harness Host 进程中使用当前用户的操作系统权限执行，并不是 sandbox。请只安装可信版本并审查 profile 变更。Session 导出可能包含 prompt、工具参数与结果以及工作区路径。漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## License

MIT

## 致谢

DSH TUI 建立在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的架构、插件系统、Agent runtime 和耐久 Session 模型之上。感谢 [DeepSeek](https://www.deepseek.com/) 以及 DeepSeek Harness 的所有贡献者将这一上游项目带给社区。
