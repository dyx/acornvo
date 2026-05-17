## MODIFIED Requirements

### Requirement: 消息渲染分类
BubbleListAdapter SHALL 用 `@ant-design/x` 的 `Bubble.List` + 顶层 stable `chatRoles` 配置渲染消息：

- `user`：Bubble role `user`，`placement='end'`，content 为纯文本（保留换行）；若 message.attachments 非空则下方显示只读 chips
- `assistant`（纯文本）：Bubble role `assistant`，`placement='start'`，`contentRender` 用 `XMarkdown` 渲染（流式 + 完成态统一）
- `assistant`（含 toolCalls）：`contentRender` 复合渲 `ThoughtChain`（toolSteps，由 chat-derive-bubble selector 折叠产出）+ `XMarkdown`（text）+ 可能的 inline `ApprovalInlineActions`（当 toolStep 含 pendingApproval）
- `tool`：**不直接渲染为独立 BubbleItem**；由 `bubbleSelectors` 折叠进对应 assistant 消息的 toolSteps（见 chat-derive-bubble 规格）

`chatRoles.assistant.footer` SHALL 用 `@ant-design/x` 的 `Actions`（含 `Actions.Copy` + 自定义 Retry / Quote）。Bubble 自带的相对时间显示沿用，hover 显示完整时间（如 X 内置不支持则用 antd `Tooltip` 包一层）。

#### Scenario: user 消息
- **WHEN** message role='user' 被渲染
- **THEN** Bubble.List 显示一条 role='user'、placement='end' 的 Bubble；attachments 非空时下方显示只读 chips

#### Scenario: assistant 工具调用消息
- **WHEN** assistant message 含 toolCalls
- **THEN** Bubble.contentRender 渲 ThoughtChain；每个 toolStep 显示工具名 + args（可折叠）+ result（可折叠）；后续 message.text 通过 XMarkdown 渲染在 ThoughtChain 下方

#### Scenario: tool 结果消息
- **WHEN** message role='tool' 到达 store
- **THEN** bubbleSelectors 把它按 `toolCallId === assistant.toolCalls[i].id` 折叠进上一条 assistant 消息的 toolSteps；不产生独立 Bubble

### Requirement: 流式 token 渲染
BubbleListAdapter SHALL 通过 store + Bubble 的 `streaming` prop + XMarkdown 渐进渲染流式输出，不再使用 requestAnimationFrame DOM appendChild 微观控制：

1. `token` 事件由 store reducer 追加到最新 streaming assistant 消息的 `text` 字段；首个 token 时若末位非 streaming assistant 则懒创建（见 chat-derive-bubble 行为基础与 design.md §B-S4）
2. reducer 默认 16ms 合批多个 token 事件为一次 setState（design.md §B-S5），合批可关
3. 该消息派生 BubbleItem 时 `streaming: true`、`content` 为 `{ text, toolSteps }`
4. Bubble 的 `streaming` prop + XMarkdown 内部渲染层接管 typing animation 与流式 markdown 增量渲染
5. 收到 `done` 事件 → reducer 把消息 status 改为 'done'；BubbleItem.streaming 变 false

`useStreamingText` hook、`streamingBuffer` 与 `flushedLength` 字段 MUST 删除。

#### Scenario: 流式输出基本不掉帧
- **WHEN** LLM 以 ~200 token/s 吐 token
- **THEN** reducer 16ms 合批；UI 帧率 ≥ 50fps；文字渐进出现无明显抖动

#### Scenario: 流式期间 XMarkdown 行为
- **WHEN** 流式接收中
- **THEN** XMarkdown 渐进渲染未闭合的 markdown 元素（未闭合 fenced code 不抖动；半行 table 暂以 raw 显示直至闭合）

#### Scenario: done 后切换为完成态
- **WHEN** 收到 `done` 事件
- **THEN** message.status='done'；Bubble.streaming=false；XMarkdown 输入不变（不需要切渲染管线）

### Requirement: Markdown 渲染
已完成与流式中的 assistant 消息 SHALL 统一使用 `@ant-design/x-markdown` 的 `XMarkdown` 组件。`a` 标签 SHALL 通过 `XMarkdown.components = { a: ExternalLinkAnchor }` override：点击调 `ipc.file.openExternal(url)` 走系统浏览器，不在应用内导航。代码块使用 antd token 的 `colorBgLayout` 作背景；本阶段 NOT 注入 highlight.js / shiki（纯背景色即可）。

#### Scenario: markdown 基本元素
- **WHEN** assistant 返回带 `**bold**` / 列表 / 代码块 / 表格 的文本
- **THEN** XMarkdown 正确渲染为对应元素；表格走 X 内置 gfm

#### Scenario: 外链打开
- **WHEN** 用户点 assistant 消息里的 https 链接
- **THEN** 调 `ipc.file.openExternal(url)` 打开系统浏览器；不在应用内新开窗口

### Requirement: 自动滚动行为
`Bubble.List` SHALL 启用 `autoScroll` prop。新增 message 或 token 到达时容器自动滚到底部；用户向上滚动后（距底 > 80px）autoScroll MUST 暂停并显示 "新消息 ↓" 浮动按钮；点击按钮跳到底并恢复 autoScroll。若 X 内置行为不达本要求阈值，则用 wrapper 组件检测滚动位置补足。

#### Scenario: 默认贴底
- **WHEN** 新消息到达且用户未上滑
- **THEN** Bubble.List 容器 scrollTop 自动跟进到底部

#### Scenario: 用户上滑
- **WHEN** 用户向上滚动超过 80px
- **THEN** autoScroll 停止；显示 "新消息 ↓" 按钮

#### Scenario: 点击跳回
- **WHEN** 用户点 "新消息 ↓"
- **THEN** smooth scroll 到底；恢复 autoScroll；按钮隐藏

### Requirement: 消息操作
每条 message hover 时 `chatRoles.<role>.footer` SHALL 显示 `Actions`：

- `Actions.Copy`（user / assistant）→ clipboard 写入消息原始文本（markdown raw）
- 自定义 Retry（最后一条 assistant 失败消息）→ 调 `chat.sendUserMessage` 重发紧邻上一条 user 消息的 text + attachments
- 自定义 Quote（assistant）→ 把文本带引用格式 `> ...` 填到 Sender

#### Scenario: 复制消息
- **WHEN** 用户点 Actions.Copy
- **THEN** clipboard 写入原始 markdown 文本；显示 antd `message.success`（替换原 radix toast）

#### Scenario: 失败重试
- **WHEN** assistant 消息为错误尾且用户点 Retry
- **THEN** 调 `chat.sendUserMessage` 重发紧邻上一条 user 消息的 text + attachments
