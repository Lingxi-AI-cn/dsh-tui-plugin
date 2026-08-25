# `@lingxi-ai-cn/dsh-llm-openai-codex`

[English](README.md) | 中文

为 `openai-codex` LLM 路由提供由提供方拥有的 ChatGPT OAuth 与动态账户模型发现。本包复用 pi-ai 的 OpenAI Codex 登录、刷新、认证转换和流式实现，同时让 DeepSeek Harness 继续拥有凭据、目录缓存与 provider-neutral 交互认证 seam。

## 配置

```yaml
- id: llm-openai-codex
  name: '@lingxi-ai-cn/dsh-llm-openai-codex'
  config:
    dshHome: /path/to/dsh-home
    credentialsPath: /path/to/openai-codex.json
    modelCachePath: /path/to/openai-codex-models.json
    clientVersion: '0.146.0'
    streamIdleTimeoutMs: 300000
    maxRequestImageBytes: 20971520
```

默认存储位置是 `$DSH_HOME/oauth/openai-codex.json`（仅 owner 可读写的 OAuth 凭据）与 `$DSH_HOME/model-catalogs/openai-codex.json`（衍生的 last-good 目录）。`clientVersion` 是固定的兼容性 header 与查询值，不是模型白名单；部署可在不重新构建的情况下覆盖它。`streamIdleTimeoutMs` 限制单次 provider 读取的停滞时间，`maxRequestImageBytes` 限制经官方 pi-ai adapter 传递的 Base64 图片历史大小。

插件会在每次请求时解析当前 Host 的耐久附件服务，并将其传给 `PiAiAdapter`。支持图片的 Codex route 因此可以读取 Session log 中确切 `ImageAttachmentRef` 所指向的字节；服务缺失或对象不可用时会在 provider I/O 前失败，而不会静默丢弃图片内容。

公开 TUI bundle 会挂载这条路由，但不会代用户登录。交互界面读取 `ctx.llm.authentication('openai-codex')`，以其公布的 `oauth` 方法运行 `ctx.llm.login()`，并提供 provider-neutral 的提示与进度通知。已认证状态会公布 `canLogout`；`ctx.llm.logout('openai-codex')` 只通过本适配器的 credential-store owner 删除其持久 OAuth 凭据，并刷新 provider 状态。TUI 通过 `/models` 暴露登录流程，并通过 `/provider` 暴露完整的登录／退出状态。本适配器有意不接受 API key 或粘贴的 access token。

## 动态模型目录

每次已认证的 `listModels('openai-codex')` 调用都会带账户 access token、account id 与兼容性 header 查询 `https://chatgpt.com/backend-api/codex/models`，保留 `visibility` 为 `list` 的行，按账户优先级排序，再把目录公布的 context、输入模态与推理级别映射到 LLM seam。解析未知模型时，也会在返回 `UNKNOWN_MODEL` 前刷新一次。

该 URL 与响应形状是从当前 Codex client 及所参考 `pa_mac` 实现中观察到的**实现兼容性事实**，并非 OpenAI 公共 API 契约。OpenAI 的公开产品文档确认 ChatGPT 登录与交互式模型选择，但没有记录这个目录端点。因此适配器会验证有大小上限的不受信任响应；遇到 401 时只刷新一次凭据并重试；只写入验证后的数据；发现失败时保留 last-good 缓存或 pi-ai baseline。

## 凭据安全

`FileCredentialStore` 是唯一的凭据持久化 owner。它在进程内串行执行 read-modify-write，并通过跨进程文件锁保护同一操作；使用原子替换；创建仅 owner 可访问的父目录；还会拒绝 POSIX 下 group/other 带任何权限位的既有凭据文件。目录文件永不包含 token。登录通知可在实时终端里显示提供方授权 URL 与 device code，但不会追加进耐久 Session transcript。

## 模型体验

### OpenAI Codex 请求

#### 模型看到什么

所选账户模型通过 pi-ai 的 OpenAI Codex Responses 适配器接收普通 Harness 提示词、`GenerateOptions.messages`、工具 schema 与调用配置。认证与目录发现不添加提示词文本。

#### Token 影响

登录或发现不会增加模型输入 token。提供方 tokenization 与输出由所选模型和推理级别决定。

#### KV Cache 影响

切换所选提供方或模型会改变提供方缓存域；除此以外，本包不改变已组装前缀。

### OpenAI Codex 响应

#### 模型看到什么

没有额外内容。pi-ai 将提供方 stream 转换为 Harness chunk 词汇。

#### Token 影响

只有 Agent loop 保留的响应 block 会进入后续请求。

#### KV Cache 影响

保留的 block 按普通 Agent 路径追加到既有前缀之后。

## 已知限制与暂缓事项

- 首个面向用户的登录与模型选择器只在 TUI 提供；Web 模型页仍负责 API-key profile 配置，不运行这套原生 OAuth 流程。
- 推理能力会被发现并通过 `resolveModelInfo` 暴露，但第一版 `/models` 只选择提供方与模型，不提供独立的推理级别步骤。
- 兼容性端点可能独立于 OpenAI 公共 API 发生变化。刷新失败会出现在 Host 日志中，并继续使用 last-good 目录。
