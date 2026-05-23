## Why

phase 16 把"松语" chat agent 的后端（tools + loop + sessions + approval IPC + 流式事件）做完了；但 `/chat` 路由还是占位（phase 1 的 "即将推出"）。本阶段把 UI 做出来，让"松语"真正可用——这是 PRD P-3 的终极落地。

此外，用户在聊天里有一类高频诉求："**让 AI 看看我这篇**"——上下文显式挂附件。本阶段引入 **"@引用"** 机制：输入框里 `@` 触发 QuickSwitcher（phase 8 已有）选文件 / 剪藏；引用以结构化 attachment 形式传到 agent，agent 在 prompt 预先拥有这些内容而无需额外调 read_file。

## What Changes

- 激活 `/chat` 路由为 `Chat.tsx` 真实页面：左侧 session 列表 + 主对话区 + 右侧 approval 栏
- `ChatInput`：多行输入、`Cmd/Ctrl+Enter` 发送、`@` 唤 QuickSwitcher 挑文件 → 作为 attachment
- `MessageList`：渲染 user / assistant / tool call 折叠块 / tool result 折叠块；流式 token 实时追加
- `ApprovalPanel`：右侧侧栏或浮层显示 `tool.approval-needed` 事件；渲染 diff（update_frontmatter 的 before / after）；两个按钮 + 可编辑参数
- `SessionList`：左侧 300px 宽；新建 / 删除 / 重命名 / 搜索；active session 高亮
- AppRail 的"松语"入口从 disabled 改为实际导航
- Attachments：输入框下方 chips 展示已引用的文件；发送时把 `attachments: [{ type:'file', path, title }]` 传入 agent；agent 的 runAgent 将 attachments 拼为首条 system-like message 或 user message 前缀 "以下是用户附加的文件：..."（phase 16 的 agent-loop 本阶段扩展支持）
- i18n：`chat.*` 所有 UI 文案
- `/settings/ai` 联动：chat 顶栏显示当前 session 用的 profile 名 + 模型；点击可换 profile（更新 sessions.profile_id）

## Capabilities

### New Capabilities

- `chat-page`: `/chat` 路由与三栏布局
- `chat-message-list`: 消息列表 + 流式渲染 + tool 折叠
- `chat-input`: 多行输入 + Cmd+Enter + @引用
- `chat-approval-panel`: 副作用 tool 的 UI 同意门
- `chat-session-list`: 左侧 session 列表与 CRUD UI
- `chat-attachments`: `@` 唤起 QuickSwitcher + attachments 传递

### Modified Capabilities

- `app-shell` (phase 13): "松语" 入口从 disabled 改为实际导航 `/chat`
- `agent-loop` (phase 16): `runAgent` 接受 `attachments` 参数，拼入消息上下文

## Impact

- 无新 native 依赖；可选 `react-markdown` + `remark-gfm` 渲染 assistant 的 markdown 回复
- `src/pages/Chat.tsx` + `src/components/chat/*`
- `src/stores/chat.ts`（per-session 状态 + 流式缓冲）
- `shared/agent-types.ts` 扩展 `Attachment` 类型
- `electron/agent/loop.ts` 处理 attachments：调 tools 的 read_file 内联读取，或直接把 attachment.body 包成初始 user message（design 决定）
- 依赖：phase 8 QuickSwitcher、phase 13 settings、phase 15 / 16 的 IPC
