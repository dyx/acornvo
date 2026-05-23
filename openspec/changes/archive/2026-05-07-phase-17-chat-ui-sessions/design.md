## Context

phase 16 完成了 agent 后端。现在要做"松语" UI，核心挑战：

- 流式 token 丝滑渲染（不闪烁、不卡顿、要能跟上中等速率）
- 副作用 tool 的 approval 不能打断用户心流，但必须醒目
- 消息太长或 tool result 太大时折叠
- 用户引用文件要顺手（`@` 触发 QuickSwitcher 复用）

PRD S-11 / S-12 要求"松语简洁、直接、随手可问"。

## Goals / Non-Goals

**Goals:**

- 3 栏布局：session 列表 / 对话区 / approval 栏
- 流式 token 基本不掉帧（requestAnimationFrame batching）
- `@` 引用文件：无缝接入 QuickSwitcher，结构化 attachment
- 可中途"停止生成"
- session 历史、重命名、删除可用

**Non-Goals:**

- 不做消息搜索（phase 未来可加）
- 不做消息导出（复制单条可以）
- 不做语音输入 / 附图（只支持文本 + 文件引用）
- 不做"消息分支"（无 edit-regenerate tree；可 edit 上一条用户消息只在 UI 编辑不影响 session 历史）
- 不做多 agent 切换（单内置松语）
- 不做对话主题聚类自动重命名（title 用首句 40 字即可；用户可改）

## Decisions

### D1: 三栏布局

```
┌────────────┬──────────────────────────┬─────────────┐
│            │                          │             │
│ SessionList│     MessageList          │ ApprovalRail│
│   (300px)  │      + ChatInput         │   (0 / 320) │
│            │                          │             │
└────────────┴──────────────────────────┴─────────────┘
```

- 左：session list（300px，可折叠到 48px）
- 中：对话区（flex 1）
- 右：approval 栏（默认隐藏，宽 0；有 pending approval 时滑入 320px）

### D2: 流式渲染策略

- chat store 每个 session 维护 `streamingBuffer: string`
- 收到 `{type:'token', text}` 事件 → `buffer += text`
- 用 `requestAnimationFrame` 节流到 60fps：每帧把 buffer 的新增部分 flush 到 UI state；DOM 仅 append 文本节点（非重新渲染整条消息）
- `done` 事件 → 把 buffer flush 完，转为 persisted message

**理由**：LLM 吐 token 有时 200 token/s，直接 setState 每 token 会卡。rAF batch 是标准做法。

### D3: markdown 渲染

- assistant 文本用 `react-markdown` + `remark-gfm` 渲染
- 代码块用 `<pre>` + 可选 highlight.js（本阶段不引，纯背景色 + 等宽字体）
- 链接：`target="_blank"` + 走 phase 1 的外链拦截（实际会 shell.openExternal）
- 流式期间：边接收边解析 md 很消耗；策略：流式时用纯 `<pre>` 显示 raw，`done` 之后切换为 markdown 渲染（一次性）

### D4: 消息折叠

- tool_call 消息（`role:'assistant'` 且含 toolCalls）→ 渲染为 chip 卡片："调用工具 search_files"，默认折叠；点击展开显示 args JSON
- tool_result 消息（`role:'tool'`）→ 卡片 "result: ..."；展开显示 JSON；超 5KB 加 "复制全部" 按钮
- 这样主对话视觉干净，仍可 debug

### D5: ChatInput 交互

- 多行 `<textarea>`，auto-grow 到 `max-height: 240px`
- `Enter`：插入换行
- `Cmd/Ctrl+Enter`：发送
- `Shift+Enter`：插入换行（与 Enter 等价）
- `@`：触发 QuickSwitcher 覆盖层（复用 phase 8 组件）；选中后 input 中插入 `@file:<title>` 的展示 token（不可编辑内部）+ 在 store 的 `pendingAttachments` 数组里追加结构化条目
- attachments chips 列表紧贴 input 上方；X 按钮移除
- 底部状态：profile 显示 + 模型 + 可换

### D6: Attachment 协议

```ts
type Attachment =
  | { type: 'file'; path: string; title: string }
  | { type: 'clip'; clipId: number; url: string; title: string }
```

发送时：`chat.sendUserMessage({ sessionId, text, attachments })`。agent loop 将 attachments 处理为：

- 在 user message 之前追加一条 `role: 'user', content: '以下是我附加的内容供你参考：\n' + 每个 attachment 读取后的内容块`
- 内容块格式：`--- <path or url>\n<body>\n---\n`
- 超长 attachment body 截 20000 字符，附 `(已截断)`
- attachment 不会作为 session_message 持久化单独一行，而是合并到发出的 user message 的上下文里；但 session_messages 存 **用户实际输入的 text**（不含 attachment body，避免 DB 膨胀）
- 对话历史再发给 LLM 时要重新读取 attachments 吗？**不需要重读**：attachments 只在"当前这一次"上下文；下一轮如果需要，LLM 可主动调 read_file

### D7: Approval UI

右侧 320px 抽屉；有 pending approval 时自动滑入：

- 顶部：工具名 + icon + reason 文字
- 主区：args diff
  - update_frontmatter：两栏 before / after YAML，变更行底色
  - 其他工具：`<pre>` 展示 JSON，可编辑（CodeMirror 或 textarea）
- 底部：「同意」(主色) / 「取消」(次色) / "编辑参数"（切换到可编辑状态，同意时发 editedArgs）
- 多个 pending：队列显示一个一个处理；底部显示 "还有 2 条待审" 标签
- 30 分钟未处理会被自动拒绝；UI 显示 "此操作已超时取消"

### D8: SessionList

- 新建按钮（顶部 "+")：调 `chat.sessions.create` 然后 activate
- 搜索框：本地 filter by title
- 行渲染：title（单行截断）/ 相对时间 / 删除 hover 按钮
- 右键菜单：重命名 / 删除 / 复制 session id
- active session 左边 3px 主色竖线

### D9: 停止与错误

- 流式中右下角有"停止生成"按钮 → 调 `chat.cancelStream`
- 错误事件：
  - `E_MISSING_PROFILE` → 顶部 banner "请先在设置中配置 AI profile"，附链接 `/settings/ai`
  - `E_BUSY` → toast "当前会话已在生成，请稍候"
  - `E_STEP_LIMIT` → 对话末尾灰色消息"助手达到步骤上限，已停止"
  - `E_NETWORK` / `E_SERVER` → 尾部灰消息"网络错误，稍后再试"；"重试"按钮重新 send last user message

### D10: 可达性与键盘

- `Cmd/Ctrl+N`：新建 session
- `Cmd/Ctrl+K`：聚焦输入框并清空
- `Cmd/Ctrl+/`：显示快捷键帮助（对话顶栏 "?" icon）
- 在 session list 用 ↑↓ 切换，Enter 激活；Delete 删除（二次确认）

### D11: 持久化 + 恢复

- 打开 `/chat`：拉 `sessions.list` 按 updated_at DESC；默认选中第一个；无 session → 新建一个空 session
- 刷新应用后 session 列表与消息均持久
- 流式中 app 崩溃 → 上次 buffer 丢失；下次打开看到 user 消息 + 空 assistant（phase 16 的 loop 实现不会 commit 未完的 assistant）

### D12: agent-loop 的 attachment 扩展

phase 17 SHALL 扩展 phase 16 的 `runAgent` 接受 `attachments`：

- 读所有 attachments 的内容（内部调 `read_file` 的逻辑或直接 fs read）
- 拼成一段 pre-user message（role='user'）放到 history 中但**不 append 到 session_messages**（否则 DB 膨胀）
- 这意味着 session_messages 只存"显示给用户看的"；实际发送给 LLM 的 messages 是"运行时重建"的

#### Trade-off

也可以把 attachment body 当作一条 session_message 持久化（role='user' 但带 `hidden: true` flag）。本设计选**运行时拼接**简单但"刷新页面后滚动回看上次请求" 时不会重建 attachment 内容；接受。

### D13: i18n key

```
chat.newSession / chat.untitled
chat.input.placeholder
chat.send / chat.stop
chat.attach.file / chat.attach.remove
chat.approval.toolName / reason / args / approve / reject / edit
chat.approval.queued (e.g., "还有 N 条待审")
chat.error.missingProfile / busy / stepLimit / network
chat.toolCall.folded / chat.toolResult.folded
chat.session.rename / delete / confirmDelete
```

## Risks / Trade-offs

- [流式 markdown 抖动] → 流式期间用 pre-wrap 文本；done 再切 markdown（design D3）
- [多 approval 堆叠] → 队列显式处理；pending 超时自动释放
- [attachment 超长爆 context] → 每 attachment 截 20000 字；多 attachment 总量再保底 80000 字
- [session 数量过多使列表慢] → 虚拟化；本阶段直接渲染，100+ session 时再考虑
- [用户打字与流式输出同时发生] → input 与 message list 两个独立 state；rAF 不阻塞 input
- [app 崩溃流式 message 丢失] → 接受；下次重发即可

## Migration Plan

- 无 schema 变化（phase 16 已建表）；本阶段纯 UI + 一个 agent-loop 扩展
- 回滚：`/chat` 恢复占位；AppRail 松语重新 disabled

## Open Questions

- 是否支持 "重发上一条用户消息"？→ 做；在 assistant 失败消息旁边加"重试"按钮
- attachment 是否支持文件夹？→ 否，仅单个 md 或剪藏；文件夹让用户自己用 search_files
- "新建 session" 是否显示一个 "空态引导"？→ 是：预置 4 个示例 prompt（"帮我在笔记里找关于注意力机制的内容"/"总结最近 10 篇剪藏"/"把 a.md 的 tags 改成..."/"列出 tags 前 10"）
