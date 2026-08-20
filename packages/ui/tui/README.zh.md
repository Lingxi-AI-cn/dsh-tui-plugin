# `@lingxi-ai-cn/dsh-tui-runtime`

[English](README.md) | 中文

面向一个自有 root DeepSeek Harness Agent 及其 live continuable child view 的原生全屏终端前端。该插件等待 Loader 结算，通过 `ctx.agents` 创建或恢复 root，只持有它的 root `AgentHandle`，用 Ink 渲染已提交的 `session/event` 行，并在 flush 其 Session 后处置 root。它不挂载 HTTP server，也不导入浏览器 Client 包。

空的 root Session 会打开居中的启动工作区；完整工作区能容纳时显示九行、60 cell 的 Electric `DSH` 前景色块标志，否则显示紧凑的 `DSH` 标志。扩展颜色终端会在每个标志 cell 上计算源设计的余弦高压电弧调色板，ANSI 16 色终端使用主题 accent，无色输出则只发出块字符。工作区保留有界 composer、已解析的 model 提示和 workspace footer。第一次 admitted input 之后，或 Session 已经存在 transcript 行时，header 会变成紧凑 activity row，transcript 会在 composer 上方跟随 live tail，短输出保持在底部锚定。Agent running 时，activity row 会循环固定宽度的工作指示器并显示 `Esc stop`；Escape 复用已有的 Agent cancellation path。`/quit` 与 `/exit` 不接受参数，会在请求退出前完成 command audit，并汇入 terminal-first 的幂等 shutdown path。

Transcript 是对耐久 Session 日志的纯 fold。以 append 方式产生的消息保持人类可见，仅供模型使用的 surface replacement 不显示；流式 assistant chunk 会校准为其完成消息，工具调用与结果按 `callId` 配对成一个生命周期节点，turn 失败保持可见。调度器所有的 `tool/execution-group` 快照会按模型顺序渲染 Parallel pool 与 Exclusive barrier，显示 queued、running、successful、failed、cancelled child 及完成进度。提供方无关的 read/search 呈现只保留为调度组内的 `Explore` 语义标签，而不作为并发证据；没有调度快照的旧日志仍使用连续 Explore grouping。service 所有的 `subagent/delegation-*` 记录会把任务标签、child 身份、提供方、耗时、终止原因和有界结果附到发起调用的工具行，不会创建第二个活动。最近的耐久 `todo/write` 快照会在 composer 上方渲染成固定的 `Tasks` 界面：活动列表最多显示六个带状态标记的条目，全部完成的列表压缩为一行进度，空列表不渲染，下一次 `turn/start` 会清除当前列表。具有配对快照的成功 `todo_write` 生命周期会被该界面吸收，失败调用仍保留在 transcript 中。紧凑卡片继续使用无边框摘要。`Ctrl+O` 会在最近一个可检查 block 上进入 transcript 浏览模式；上下方向键可在 conversation block、活动及其保留 child 和 Tasks 间移动。Enter 打开一个有界详情面板，PageUp 与 PageDown 滚动其完整正文，Escape 先关闭详情再回到 composer。工具详情根据提供方无关的呈现意图显示。缺失定义、过期参数或抛出异常的 presenter 会回退到清理后的原始内容。Assistant GFM 会投影成终端文本，使标题、列表、代码与表格保留结构且不泄露呈现标记；每个不受信任字符串仍会经过终端控制字符清理。实时 `agent/status`、审批请求与用户问题不进入耐久 transcript 状态，并在 teardown 期间清空。

`Ctrl+F` 会在完整 folded transcript 的每个 block 上进入增量搜索，包括未挂载页面、user 与 assistant 文本、reasoning、command result 和完整工具详情。索引按稳定 node key 缓存规范化小写文本，只有 block 的可搜索文本改变时才替换对应缓存文档。Enter 与 Shift+Enter 会在匹配 block 间循环移动，再按一次 `Ctrl+F` 会在所选 block 关闭搜索，Escape 则恢复搜索前确切的 transcript anchor。当前 block 与第一个可见匹配只在进程内 render state 中高亮；query、索引、选择与高亮绝不修改 Session event。

Agent idle 时，composer 用 `Agent.followup()` 发送普通文本；running 时使用 `Agent.steer()`。它维护一个感知 Unicode grapheme 的插入点，支持左右与按词移动、逻辑行 Home/End、向前／向后及删除前一词、保留未提交草稿的已提交历史遍历，以及最多五行可见换行内容。`Ctrl+J` 插入换行，Enter 提交原始非空白文本而不裁掉首尾空白。`Ctrl+_` 或 `Ctrl+Shift+-` 通过最多 100 份进程内文本与光标快照撤销编辑，`Ctrl+Y` 则重做。快速的单 grapheme 输入和同方向删除会合并；paste、多行插入、suggestion 接受与历史接受各自形成独立 unit，光标移动只会终止合并。至少八行或 4 KiB 的 bracketed paste 会变成一条有界的 `[Pasted text]` placeholder；经过终端安全处理的原文只保留在当前进程中，并仅在提交时展开。删除 placeholder 会移除其 payload；undo、redo、stash、已提交历史与 Agent view 切换都能保留 reference，而不挂载被粘贴的行。`Ctrl+R` 按从新到旧的顺序搜索当前 TUI 进程提交的去重 prompt；重复触发会选择更早的匹配，Enter 接受匹配，Escape 恢复原 draft 和确切光标。`Ctrl+S` 会暂存非空 draft、把它恢复到空 editor，或与另一个非空 draft 交换，因此恢复不会覆盖文本；每份 draft 保留自己的编辑历史。Prompt-history 搜索、暂存、paste reference 与编辑历史仅存在于当前进程，绝不进入 Session 日志。只含命令的斜杠查询会通过共享 suggestion controller 使用有效的 `ctx.commands.list(agent)` descriptor。在 draft 开头或空白之后的 `@token` 会通过同一 controller 使用以当前 Session workspace 为根的、可取消的 `ctx.fs.completePaths()` 结果；loading、无匹配和 truncated 状态保持有界，目录接受时保留尾部斜杠，文件接受时追加一个分隔空格。有界列表标出一个选中项；Up/Down 移动选中项而不遍历 prompt history，Shift+Tab 向前移动，Tab 或 Enter 接受选中的命令或路径，Escape 关闭列表但保留 draft。一个不可变 action registry 统一拥有有效的 Global、Composer、Suggestion、HistorySearch、TranscriptSearch、Transcript、Detail、Dialog、Footer、Work 与 Approval binding 及其输入优先级。`/help` 继续返回有效 command descriptor，同时打开由该 registry 生成的有界可滚动交互面板；不支持的 capability action 会被省略，`/help extra` 仍返回 usage error，Escape 会回到之前的本地模式。`Alt+P` 可打开现有 model picker，且不会替换当前 draft。以斜杠开头的输入会先尝试 `ctx.commands.execute()`；未匹配行仍作为普通提示提交，使 skill 手势继续走共享 Agent 路径。审批限定到确切的自有 Agent，只提供单次允许／拒绝。`ctx.userQuestions.registerProvider()` 提供 FIFO 结构化问题界面。

`/models` 会在 `ctx.llm.listProviders()` 及各提供方实时 `listModels()` 结果上打开有界、可滚动的选择器。声明了交互认证的提供方在尚未配置时显示为登录操作。首个原生流程是 OpenAI Codex：选择 **使用 ChatGPT 登录** 后，界面运行提供方自有的浏览器 OAuth 流程，把可刷新的凭据存到 `$DSH_HOME/oauth/openai-codex.json`，刷新账户模型目录，再回到选择器。模型声明可选 reasoning effort 时，第二个有界问题会选择一个确切等级。解析后的模型与 effort 会经 `ctx.agentDefaultModel.saveSelection()` 持久化，成为自有 Agent 的下一步选择，并立即更新 idle header；已经运行中的 step 仍保留它捕获的选择。

`/resume` 或 Alt+R 会打开有界、可搜索的 Session picker，且不会离开 alternate screen。默认范围是当前 workspace；Tab 切换到全部 workspace，此时每行还显示自身 cwd。每行组合 `ctx.sessionQuery.listSessions()`、实时 Session 的最后 event 时间或持久化产物 mtime，以及最新标题。挂载 `ctx.sessionProjectionCache` 时，持久化标题使用绑定日志身份的 checkpoint 行和有界的只读 tail 冷读取；否则用一次可取消的 `readTitleSnapshots()` 批量 fold。单个不可读 Session 只会变成一个禁用行，不会丢弃其他结果。当前、已经 live、subagent 所有、带 preset、格式不兼容、未持久化以及没有 cwd 的 Session 都显示明确禁用原因。选择后会调用 `ctx.agents.resume()` 并执行可取消、未发布的 setup，在其中再次检查已加载日志里的 preset 变更和不可用路由。只有成功发布的 handle 才会替换活动 Agent、event/status store、模型选择与 Ink props；随后才 flush 并处置旧 handle。失败会保留原 Agent、transcript、draft、终端事务和 listener。Alt+R 会保留非空 draft，直到用户暂存或明确丢弃；已有的进程内 stash 会在成功切换后保留。

`/clear` 与 `/new` 都会打开明确的新 Session 确认；`/clear` 绝不会隐藏耐久历史后继续使用同一份模型上下文。只有当前 Agent idle 且没有 approval 或 question 等待时才能确认。确认操作通过 `ctx.agents.create({ source: 'clear' })` 创建空 Session，并保留当前 Session cwd 与下一请求的确切模型选择。命令的 `command/run` 与 `command/done` 配对会在确认切换 owner 前落到旧 Session。新 Session preparation 与 resume 共用单一切换事务：旧 Agent 会保持已发布状态，直到新 handle 与 Ink render 提交；失败会在未改变的 transcript 上恢复确认界面，只有已提交的切换才会 flush 并处置旧 handle。旧 Session 继续保持持久化状态，可通过 `/resume` 选择；Session 本地的 navigation、history、search、Tasks 与 draft 会重置，已有的进程内 stash 则保留。

`/rewind` 会先在父 Session 结算命令 audit，再进入只包含已完成 append-origin 人类提示的 transcript 浏览模式。Up 与 Down 只在安全的人类边界间移动，并通过稳定的事件锚点保持所选提示可见。确认界面会指明该提示，以及子会话保留和仅留在父会话中的耐久事件数量。子会话通过 `ctx.agents.create({ source: 'rewind', seed, meta })` 创建；其 seed 结束于所选完整轮次，以及下一次轮次开始前的尾随独立事件之后，metadata 则记录 `parentSession`、`seedLength` 与 cwd。Preparation 会复用日志记录的请求选择，以及 resume 和新建使用的同一项受回滚保护的 Agent 切换事务。取消或失败会保持父 Agent、transcript、draft、终端状态与后续历史不变；提交成功的子会话会重置 Session 本地 UI 状态，保留进程内 stash，并让父会话继续持久化以供 `/resume` 使用。

`/export` 会先记录完整命令生命周期，再打开原生目录编辑器，因此归档可以包含该命令的耐久审计事件对。相对路径从当前 Session workspace 解析；Tab 可在仅当前 Session 与其耐久 descendant lineage 间切换。只有 Agent idle、没有交互等待且未进行 Session 切换时才能导出。随后 TUI 调用 host 所有的 `ctx.sessionLogExporter`，显示已解析的目标目录与写入进度，并报告确切的最终发布路径。Escape 会中止 preparation、lineage 与 attachment 读取、压缩和文件写入；关停流程会先恢复终端，再等待清理完成。Host writer 使用私有同级临时文件，只以第一个未占用文件名发布完整 ZIP，绝不替换已有归档。这是 diagnostic raw-artifact 导出：已提交的 prompt、工具参数／结果与 workspace 路径仍会保留；提供方 credential store 与瞬时 OAuth 进度不在归档内。

Compaction 生命周期 event 会被 fold 成一个耐久 transcript marker。Marker 显示运行中、成功或失败状态、被 shadow 的历史数量、估算 token、summary 与 command 关联；replacement checkpoint 的 user message 仍然只服务于模型，不会作为重复的人类行渲染。自动与手动 compaction 使用同一个 marker，成功的 `/compact` command row 会被其关联 marker 吸收。Summary 文本与失败详情都进入 transcript search，并可从 Session log reload 后重建。

大量选项不会无限撑高终端。问题界面只挂载与 viewport 相称的一段，显示当前范围，并用上下方向键移动窗口；数字或精确标签仍可作为输入。Transcript 使用 Unicode cell 宽度预算物理显示行，而不会把一个语义 node 当成一行。Explore group 与固定 Tasks 界面最多挂载六个 child 行及一个省略标记，并为这些完整行预留空间。在浏览模式之外，`PageUp`、`PageDown` 与鼠标滚轮在完整语义 transcript block 间翻页；composer 为空时，Home 与 End 跳到最早 block 和实时尾部。Composer 上下方向键仍控制已提交输入历史。历史页面会在流式更新、Tasks 替换与终端 resize 期间保留语义顶部锚点；新事件只显示有更新内容的提示，不会把读者拉回底部。回到尾部后会恢复自动跟随。浏览模式会在翻页和 resize 期间保持焦点 parent block 可见，消费非导航输入而不修改 composer，并在流式替换移除焦点 key 时恢复到最近的存活 target。Tasks 仍是 focus target，其完整耐久 checklist 会在共享详情面板中打开。详情正文按 Unicode 显示宽度包装 grapheme cluster，并报告当前可见的物理行范围。过大的文本 block 在历史页面显示带标记的头部，在实时视图显示带标记的尾部。

终端改变只有一个 owner。它在写入前拒绝非 TTY stream，只进入一次 alternate buffer，启用 SGR 鼠标滚轮报告与 bracketed paste，复用 Ink 的 raw-mode 生命周期，并在关停流程等待命令取消、Session flush 或 Agent dispose 之前恢复 raw mode、mouse/paste mode、cursor 与 screen。完整的 SGR 按下、释放、移动与滚轮报告会在 composer 插入之前被消费；只有滚轮报告会导航 transcript。这条幂等路径也会移除 signal listener 并结算未完成交互。

原始输入在交互分派前经过一个增量 decoder。它跨传输 chunk 保留 UTF-8，将控制字节与相邻的已提交文本分开，并统一传统 xterm 按键、Kitty CSI-u、xterm modifyOtherKeys、application keypad 序列及协议提供的 Shift/Ctrl/Alt/Meta/Super 修饰键。同一 tokenizer 会消费 SGR 鼠标报告、focus 报告、bracketed paste、终端回复、未知功能键及未知或不完整 CSI，不让其字节泄漏到编辑器。单独的 Escape 在 35 ms 后结算；一段 bracketed paste 保持为一个 undo unit，并以 16 MiB 为上限，截断时显示 live notice。终端发出增强键盘协议时 TUI 可以解码，但不会根据 `$TERM` 推断支持，也不会在缺少协商所得终端能力时启用协议。

进入 alternate screen 前，`TerminalSession` 会通过同一个 decoder 在有界时间内发送设备、Kitty 键盘和 OSC 查询。没有回复的终端会在 deadline 内进入界面，并使用传统输入且不启用增强 mouse、focus、paste 或 clipboard mode；只有确认过的 capability 才会启用对应 mode。跨 chunk 拆分的回复与交错的普通输入保持字节顺序，协商期间缓存的输入会在 Ink 挂载后分派。在 transcript 浏览或详情中按 Y，会通过已协商的 OSC 52 复制最多 100,000 个 UTF-8 字节。tmux 中同一序列会进入 tmux 配置的 clipboard buffer 路径，并可由其 `set-clipboard` 策略转发；SSH 只有在远端进程观察到回复后才会使用 OSC。不支持、超过限制或写入失败只会产生 live notice，绝不写入 Session event。颜色深度来自输出 stream 与 `NO_COLOR`；tmux 与 SSH 只作为当前进程的外层传输上下文记录。Capability snapshot 仅存在于进程内，关停时只关闭该事务实际启用的 mode。

文本编辑器使用终端真实光标，而不是渲染出来的反色空格光标。`TuiApp` 根据可见多行布局和 Unicode 显示宽度计算插入 cell，居中的启动 composer 会沿用 Ink/Yoga 对起始侧 cell 的取整方式。`TerminalSession.rendererOutput` 在每次 Ink 全屏渲染后恢复该 cell，同时拦下 Ink 隐藏光标的请求。终端事务只启用已协商的 bracketed paste，并在每条关停路径恢复 paste、mouse、focus、keyboard、cursor、raw 与 alternate-screen mode。这样 macOS 等终端 IME 的中日韩预编辑文本会锚定在正确位置；包括 Plugin Hub 详情在内的只读 panel 与只接受审批的交互会隐藏光标，teardown 仍会无条件恢复它。

完成的 reasoning 在 transcript 中只占一条 `Thinking · duration` 标题，其完整文本仍可通过 block 详情查看。围栏代码保留语言标题，窄屏表格转成逐行字段列表，工具摘要对 Session workspace 内路径使用相对形式，同时保留外部绝对路径。Terminal、read、search、diff、web、delegation 与 generic 行在 80 列下保持有界；低于 60 列时，activity row 与 footer 会省略次要元数据而不发生重叠。第一次请求前，居中的启动工作区显示解析后的 model 与提供方默认 reasoning effort。running 时，activity row 会在工作指示器和 `Esc stop` 旁显示耐久 request 选择；idle 时显示下一步选择。Footer 会投影同一份已捕获或下一步选择，并组合 `ctx.permissionPresets`、以提供方用量为锚点的 `contextPressure`、权威 background-work counter、Session workspace 与已挂载 transcript 范围；只有容量和提供方用量样本同时存在时才显示 context，只有至少一个 work row 时才显示 Work。Suggestion 处理完毕后，Tab 进入显式 Footer mode；Left/Right 或 Tab/Shift+Tab 在已挂载项目间移动，Enter 打开既有模型选择器、permission preset 选择器、有界 Work 面板或有界只读详情，Escape 返回 composer。Permission 变更执行已注册的 `/permission` 命令，不在本地修改策略。终端少于 56 列时保留 model、permission 与存在时的 Work；更宽布局按优先级加入 context、transcript position 与 workspace。`NO_COLOR` 和有限色终端仍保留文本与符号；tmux 和 SSH 继承外层终端能力，Windows Terminal 使用同一套 ANSI 与 Unicode 宽度路径。

审批对话框限定到 TUI 精确持有的 agent，并渲染 owning request 提供且经过清理的 terminal、diff、filesystem、web 或 generic 事实。Up/Down 与 PageUp/PageDown 通过统一 interaction registry 滚动有界详情。Approval content 没有 copy action，因为其 presentation intent 并未声明 clipboard safety。审批服务只公开 allow-once 与 reject，因此 TUI 不会展示服务无法执行的持久策略操作。

Work footer 项与有界面板会投影 `ctx.jobs` 快照、耐久 `ctx.subagents.listDescendants()` 目录行、实时 `ctx.agents` 状态，以及按 owner scope 监听的 `subagent/*` 生命周期事件。每行显示 label、在可用时显示 owning Session、state、elapsed time，并且只公开 owner 支持的 stop action。由 job 管理的 one-shot subagent 只显示为 job 行，可继续的本地 child 只显示为 subagent 行；remote run 因不提供本地 Session transcript 而只显示 summary。X 只调用 `ctx.jobs.kill()` 或 `ctx.subagents.interrupt()`，绝不伪造 lifecycle event。Enter 会打开 live continuable local child 的确切 Session transcript；header 会标明 Agent 与 input target，Ctrl+G 返回 root，child dispose 后则自动返回。Child input 会使用确切的 live durable direct parent 调用 `ctx.subagents.followup()`，绝不直接操作 inbox 或 Agent method，因此它始终是普通 FIFO follow-up，而不是 steering。Root 与 child view 分别保留进程内 composer、submitted history、transcript anchor、focus 与 search state。Queued count 保持为零，因为已组合的 service 没有公开权威 queue state；workflow event 仍是 transcript fact，因为 workflow 没有公开 live registry 或 cancellation handle。`/plugins` 打开 Discover 时会使用 `tui` surface 和 installable-only filter，并将有界的单行查询光标锚定在搜索框内；进入 Detail 后光标隐藏。Tab 切换到 Installed，其中 managed 或 unmanaged 状态、active-bundle membership、resolved version 与 health 均来自 active-profile installed truth，而不是 browser 或 Registry state。Detail 将有界的 Versions 区放在 README 之前，因此较长的第三方文本不会隐藏 version 或 installability 事实。README 使用终端 Markdown 投影：Registry 响应没有物理换行时会恢复常见 block 边界，标题、列表、代码、图片替代文字与链接标签保持可读，presentation marker、原始 HTML、链接目标和图片 payload 则不会显示。完整详情最多保留 256 个物理行，并明确标记被截断的 README。provider 会声明 profile 修改是否可用。仅目录模式会在状态中标记通过外部 CLI 修改，在 footer 中显示确切的 `dsh plugin --profile tui add --save-exact` 或 `remove` 命令，并阻止 Enter 发起修改。启用修改时，安装与离线移除都会先请求 detached plan，再要求用户显式确认确切 package 和 version、source commit、artifact size 与 digest prefix、DSH compatibility、signed validation level、lifecycle scripts、advisories、变更前后 bundle order、Host process permissions 及 required restart。Search、planning 与 inactive staging 可取消；取消与 staging 完成竞争时会安全丢弃 staged transaction。maintenance handoff 开始后，panel 不可取消或关闭；terminal-first shutdown path 会在旧 process 退出前恢复终端，而 helper 独占 generation activation、relaunch readiness、commit 与 failed-boot restoration。Session 切换与关停会中止 catalog work，并在异步清理前解除 observer。TUI 不公开 Agent installation tool，presentation component 也不调用 pnpm。

Plugin Hub Discover row 使用结构化 card，而不是预先拼接的 status string。终端达到 96 列时，每张 card 使用固定三行，依次显示 name 与右对齐 discovery badge、summary，以及存在时由 Registry 提供的 category、package kind、primary language、package/version 和 activity metadata；更窄终端保留固定双行 name 与 summary card，低于 48 列时右侧只保留 Star count。每一物理行都按 Unicode cell width 限界，选中与未选中 card 高度一致，no-color 输出仍保留相同状态标签。Star count、repository activity、category、kind 与 language 始终只是 discovery metadata，绝不影响 installability、verification 或 confirmation authority。

Plugin Hub Detail 使用有界语义 section，依次呈现 Overview、Compatibility and trust、Risks and advisories、Versions 与清理后的 README content。它会显示 Registry 的 OS、archive、license、Star、activity、curation、category、package kind、primary language 与结构化 advisory 事实，并使用 warning 或 error tone；category、kind 与 language 会明确标为 discovery metadata，而不是 security 或 installability state，no-color 模式仍保留完整文字。Detail 和 confirmation 内容使用 semantic palette color，但不使用 ANSI dim，使 muted metadata 和 README text 保持清晰可读。Install confirmation 使用 Install target、Compatibility and trust 与 Profile changes section；package-manager、artifact、digest、compatibility、signed validation、lifecycle、bundle、restart 与 runtime 事实均来自 detached plan，目录 detail 只提供 advisory 展示上下文。

Discover 默认按 Stars 排序，并使用 `Alt+S` 在 Relevance、Stars、Updated 与 Newest 之间循环。`Alt+C` 循环 Registry-owned category，并回到 All categories。TUI 会发送当前 ordering 和 category，但不强制加入 TUI-surface 或 installability filter，在目录尾部追加 opaque continuation page，按 plugin id 去重，并在 Registry 拒绝 stale cursor 时从第一页重新加载。后续 page 加载期间保留已有 card；目录状态和 Showing range 会公开当前 ordering 与 continuation state，但不会进入 Session log。不可安装 card 仍可用于 discovery 和 detail 查看，但 detail 不提供 install action。

## 性能诊断

`pnpm run test:tui:perf` 会通过生产 transcript fold、搜索索引、物理行 viewport、详情换行和 Ink transcript renderer，运行一个可选择执行、确定性的 100/1,000/10,000-node 长 Session benchmark。Fixture 包含 Markdown 与 Unicode conversation block、工具组、大型输出、Tasks、已完成 delegation 和一次 streaming append。输出的 JSON 会记录 initial 与 appended fold 时间、append projection 加 render 时间、PageUp、搜索导航与刷新、40/80/160 列 resize、详情 projection 与打开、保留 heap、已挂载 React element、已挂载 transcript block，以及每 frame 输出字节。Wall-clock 与 heap 观察只描述所报告的主机；benchmark 与 correctness tests 分离，其阶段目标用于指导优化，不构成跨平台 latency 保证。归属的[长 Session benchmark Agent Note](../../../.agents/notes/implemented/testing/2026-08-16-native-tui-long-session-benchmark.md)记录初始机器基线和已知未达项目。

`TuiApp` 为每个 Agent 持有一个 append-oriented transcript projection。经过验证的 Session-event suffix 会以 copy-on-write 方式更新 stream、tool、activity、delegation、Tasks 和 compaction 状态，同时保留未变化 node 的 identity；resolver 变化、非 prefix snapshot、Session replacement 或 compaction start 会从完整耐久日志重建。完整 `foldTranscript()` 路径会从空状态运行同一个 event state machine，并继续作为 differential oracle。完整 transcript 搜索会在 node 引用未变化时复用规范化文本。Focused detail 按 node 或保留 child 引用缓存逻辑行，并按 terminal width 缓存物理行；resize 只使依赖宽度的结果失效。[增量 projection Agent Note](../../../.agents/notes/implemented/architecture/2026-08-16-native-tui-incremental-transcript-projection.md)记录 ownership 与 invalidation 规则。

`TuiTranscriptViewportIndex` 保存 Agent-local 语义 key index、immutable node index、未测量 block 的保守高度、按 identity 与 width 缓存的精确测量，以及一个 Fenwick 物理行 prefix index。每个 frame 只测量足以填满物理行预算的 block 和第一个被排除的边界 block；前后各两个相邻 block 会挂载到零高度 overscan。固定高度的 tool、group、Tasks 和 compaction block 会跨 width 复用测量，text 测量则按 width 隔离。`TuiTranscriptScrollController` 是 live-tail follow、PageUp/PageDown、鼠标滚轮、Home/End、focus reveal、transcript search、rewind selection、replacement fallback 和 resize-stable semantic anchor 的唯一 transition authority。index 引入前的 helper 继续作为 differential oracle；超大 text 在锚定位置仍显示带标记的 head，在跟随实时输出时仍显示带标记的 tail。[物理行 virtualization Agent Note](../../../.agents/notes/implemented/architecture/2026-08-16-native-tui-physical-row-virtualization.md)记录 index 与校正规则。

## Host 兼容性

后装 runtime 把所有官方 package import 集中在 `src/host.ts`。如果受支持的 Host 不提供交互式 provider 认证或有界文件系统补全，`/models` 只列出已经配置的 route，路径建议保持为空；普通模型请求和显式路径提交仍然可用。Session rewind 在本 package 内使用相同的耐久事件算法，不要求较新的 `@deepseek-ai/dsh-session` 命名导出。

## 配置

| 键 | 默认值 | 行为 |
|---|---:|---|
| `resume` | 未设置 | 启动时恢复该持久化 Session，而不是创建新 Session。 |
| `maxResumeOptions` | `8` | Picker 一次最多挂载的 Session 行数。 |
| `resumeScanConcurrency` | `4` | 一次 picker 扫描中 projection-cache 或产物 metadata 读取的最大并发数。 |

### 用户设置

挂载 `ctx.settings` 时，本包会注册 `tui` namespace。文件 provider 把这些值持久化到共享用户设置文档；TUI 从不直接写该文件。

| 键 | 默认值 | 行为 |
|---|---:|---|
| `theme` | `dark` | 选择 `dark`、适合浅色终端的 `light` 或 `no-color` 语义终端 token。 |
| `keybindings` | `{}` | 替换指定交互 action id 的按键手势。 |

主题变更会重新渲染现有 Ink root，并保留活动 Agent、transcript、draft、navigation 与 dialog。协商得到的 16 色输出使用 ANSI 颜色名，扩展色输出使用内置 palette；`NO_COLOR` 或无颜色输出 stream 会忽略存储的 preference 并强制使用无色结果。没有颜色时，selection、progress、failure、approval 与 diff 行仍保留文本或 `›`、`✓`、`✕`、`+`、`-` 等标记。

`keybindings` 把导出的 `TuiInteractionActionId` 值映射到最多八个规范小写按键序列。配置列表会替换该 action 的按键手势，而 `/models` 等命令手势仍然可用；空列表表示该 action 没有按键手势。具名序列包括 `enter`、`escape`、`tab`、`shift+tab`、`shift+enter`、方向键、翻页键、`home` 与 `end`；可打印 ASCII 按键可以使用 `ctrl`、`meta`、`super`、`hyper` 及受支持的组合修饰键。未知 action、不支持或非规范的序列、重复按键和同 context 冲突都会使 settings validation 失败。`app.interrupt` 必须保留 `ctrl+c`，Dialog action 不能占用 dialog-local 的 Tab/Y/N/S/D 控制键。

```yaml
tui:
  keybindings:
    composer.openModels: [ctrl+p]
    composer.historySearch: [ctrl+k]
    composer.transcriptSearch: [ctrl+t]
```

解析后的不可变 registry 同时驱动 input dispatch 与 `/help`。已提交的 settings 变更会让下一次 input event 使用新 registry，并重新渲染同一 Ink tree，而不替换 Agent、transcript、draft、navigation 或 dialog。按键可以在不同 modal context 中复用，因为普通输入只属于当前 context；Global action 始终具有更高优先级。

`/config` 会打开原生设置菜单。用户可以选择 terminal theme、选择任意支持按键的 interaction action，或重置全部 TUI settings。快捷键编辑器接受逗号分隔的规范序列；输入 `default` 只会删除该 action 的 override 并恢复内建 binding。确认重置后，完整的 `tui` settings section 会被替换为空默认值。每次变更都通过 `ctx.settings` 提交，因此由 file provider 负责持久化，当前 theme 与 interaction registry 会立即更新而无需重启 Agent。

## 模型体验

间接影响：选择哪一条已注册 LLM 路由接收 root 的下一次普通请求，并通过 continuable subagent service 交付明确的 child-view input；模型可见内容仍由适配器与 `tui-app` bundle 拥有。

#### KV Cache 影响

切换提供方或模型会让下一 Agent step 进入不同的提供方缓存域；除此以外，本包不注册 system-prompt section 或工具 schema。

## 已知限制与暂缓事项

- **只有一个可见 Agent view，且只挂载一页有界 transcript**：root 与 live continuable child view 会原位切换；不提供同时显示的 pane 或 Session tab。Inactive 与 one-shot local child 及 remote run 仍为 summary-only。每个 view 的 draft 只存在于进程内，不会持久化。
- **拒绝恢复带 preset 的 Session**：在进程级 base 组装下回放 Web Session 会改变其工具与提示词；感知 preset 的跨界面恢复暂缓。
- **Transcript 检查没有指针焦点**：鼠标滚轮可以翻动历史，但不支持指针选择或焦点。
- **终端集成随宿主而异**：自动化 PTY 覆盖证明已提交 Unicode、窄屏布局、bracketed-paste 恢复与光标定位。原生 macOS IME preedit 和 Windows ConPTY 行为仍是手工 release check。
- **终端图片粘贴不可用**：标准终端输入只提供已提交文本，不提供带类型的图片字节。TUI 不会仅因 `ctx.attachments` 存在就启用图片输入；未来携带字节的终端 transport 还必须在持久化或 provider I/O 前预检确切模型的 `inputModalities`。
- **Ink 5 跟随仓库 React 18 版本线**：采用更新 renderer major 需要先证明隔离的 React build face，或协调 Web React 迁移。
