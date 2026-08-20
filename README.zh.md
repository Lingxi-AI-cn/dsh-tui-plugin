# DeepSeek Harness TUI 插件

[English](README.md)

这是面向官方 DeepSeek Harness 的可独立安装原生终端界面。本仓库发布一个用户入口包 `@lingxi-ai-cn/dsh-tui`，以及同一 npm scope 下五个精确版本内部包。

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

## 构建与验证

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:clean-room
```

clean-room 门禁会从 npm 安装未经修改的官方 Harness，通过 `dsh plugin` 安装本地打包的 TUI，完成 profile 组合和 PTY 启动，使用 `/quit` 退出并恢复终端，同时确认官方安装目录没有被修改。

## 安全提示

DSH 插件在 Harness Host 进程内以用户的操作系统权限执行，不受模型工具 sandbox 限制。只安装可信来源和版本。Session 归档可能包含 prompt、工具参数与结果以及工作区路径。漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## License

MIT
