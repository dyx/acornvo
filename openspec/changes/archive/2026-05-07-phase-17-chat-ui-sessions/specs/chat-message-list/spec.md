## ADDED Requirements

### Requirement: 消息渲染分类

MessageList SHALL 按 `role` 渲染四类消息：

- `user`：右对齐气泡，纯文本 + 换行保留，若附带 attachments chips 同气泡底部显示
- `assistant`（纯文本）：左对齐 markdown 渲染（见流式策略）
- `assistant`（含 toolCalls）：渲染为 chip 卡片 "调用工具 <name>"，默认折叠
- `tool`：渲染为卡片 "result: <摘要>"，默认折叠

所有消息 MUST 显示相对时间（hover 显示完整 ISO 时间）与"复制"按钮。

#### Scenario: user 消息

- **WHEN** role='user' 的 message 被渲染
- **THEN** 显示右对齐气泡；若 message.attachments 非空则下方显示只读 chips

#### Scenario: assistant 工具调用消息

- **WHEN** assistant message 含 toolCalls
- **THEN** 渲染为 chip "调用 <tool>"；默认折叠；点击展开显示 args JSON（pre 格式）

#### Scenario: tool 结果消息

- **WHEN** role='tool' 的 message
- **THEN** 卡片显示 "result: <前 80 字符>"；展开显示完整 JSON；>5KB 时显示"复制全部"按钮

### Requirement: 流式 token 渲染

MessageList SHALL 使用 requestAnimationFrame 节流（约 60fps）将 `{type:'token', text}` 事件增量 flush 到 UI：

1. chat store 维护 `streamingBuffer: string` + `flushedLength: number`
2. 每帧（rAF）将 `buffer.slice(flushedLength)` append 到 DOM 文本节点；更新 flushedLength
3. DOM 层 MUST 仅 append 文本节点；不得每 token 重渲染整条消息
4. 收到 `done` 事件 → 最后一次 flush 剩余 buffer；将 raw 文本切换为 markdown 渲染

#### Scenario: 流式输出基本不掉帧

- **WHEN** LLM 以 ~200 token/s 吐 token
- **THEN** UI 帧率 ≥ 50fps（debug overlay 可见）；文字实时出现

#### Scenario: 流式期间避免 md 抖动

- **WHEN** 流式接收中
- **THEN** 文本以 `<pre style="white-space: pre-wrap">` 渲染；不跑 markdown 解析

#### Scenario: done 切换 markdown

- **WHEN** 收到 `done` 事件
- **THEN** 最终 flush；将 pre 容器替换为 react-markdown 渲染结果（含 remark-gfm）

### Requirement: Markdown 渲染

已完成的 assistant 消息 SHALL 使用 `react-markdown` + `remark-gfm` 渲染。代码块 MUST 用 `<pre>` + 等宽字体 + 浅色背景；链接 MUST 加 `target="_blank"` 并走 phase 1 的外链拦截（`shell.openExternal`）；不注入 highlight.js（本阶段纯背景色即可）。

#### Scenario: markdown 基本元素

- **WHEN** assistant 返回带 `**bold**` / 列表 / 代码块 / 表格 的文本
- **THEN** 正确渲染为 HTML 对应元素；表格走 gfm

#### Scenario: 外链打开

- **WHEN** 用户点击 assistant 消息里的 https 链接
- **THEN** 调 shell.openExternal 打开系统浏览器；不在应用内新开窗口

### Requirement: 自动滚动行为

MessageList SHALL 在新增 message 或 token 到达时自动滚到底部；但若用户已向上滚动（距底 > 80px）MUST 停止自动滚动并显示"新消息 ↓"浮动按钮；点击跳到底并恢复自动滚动。

#### Scenario: 默认贴底

- **WHEN** 新消息到达且用户未向上滚动
- **THEN** 容器 scrollTop 跟进到底部

#### Scenario: 用户上滑

- **WHEN** 用户向上滚动超过 80px
- **THEN** 停止自动滚动；显示"新消息 ↓"按钮

#### Scenario: 点击跳回

- **WHEN** 用户点"新消息 ↓"
- **THEN** smooth scroll 到底；恢复自动滚动；按钮隐藏

### Requirement: 消息操作

每条 message hover 时 SHALL 显示操作条：

- 复制文本（user / assistant）
- 重试（最后一条 assistant 失败消息旁显示"重试"→ 重发上一条 user message）
- 引用（assistant 消息可"引用到输入框"，把文本带引用格式 `> ...` 填到 ChatInput）

#### Scenario: 复制消息

- **WHEN** 用户点 assistant 消息的"复制"
- **THEN** clipboard 写入消息原始文本（markdown raw）；toast 确认

#### Scenario: 失败重试

- **WHEN** assistant 消息为错误尾消息且用户点"重试"
- **THEN** 调 chat.sendUserMessage 重发紧邻上一条 user 消息的 text + attachments
