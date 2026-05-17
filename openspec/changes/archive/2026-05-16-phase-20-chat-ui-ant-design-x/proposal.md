## Why

Chat UI 是 AI 应用的视觉门面。当前 `src/pages/Chat.tsx` + `src/components/chat/*` + `useStreamingText` 共约 2700 LOC，由 Radix + Tailwind + react-markdown + 手写 rAF DOM 流式管线组装；行为正确但维护负担高，且 `@ant-design/x` v2 已提供与 AI chat 对齐的组件原语（Bubble.List / Sender / Conversations / ThoughtChain / Welcome / Prompts / Actions / Attachments）。借这次重构沉淀松鼠视觉到 antd token，把通用 chat 语义让位给上游组件，净减约 900 LOC。

## What Changes

- **UI 组件切换**：`Chat.tsx` 三栏→两栏；`MessageList` → `Bubble.List`；`SessionList*` → `Conversations`；`ChatInput` + `AttachmentChips` → `Sender` + `Sender.Header { Attachments }`；`ToolCallCard`/`ToolResultCard` → `ThoughtChain`；空态四卡片 → `Welcome` + `Prompts wrap`；assistant 操作行 → `Actions`；`DeleteSessionDialog` / `ShortcutsDialog` → antd `Modal`；`ChatBanner` → antd `Alert`；`SessionStatusBadge` → antd `Badge`
- **Markdown 渲染切换**：`react-markdown + remark-gfm` → `@ant-design/x-markdown`（流式 markdown 原生支持）；保留 `a` 标签的 IPC 外链跳转通过自定义 component
- **审批 UX 重构**：拆 `ApprovalPanel` 为消息流内 `Actions`（Approve / Reject / Edit）+ Edit 时弹 `ApprovalDrawer`（包既有 `JsonArgsEditor` + `FrontmatterDiff`）；右栏取消，布局简化为两栏
- **删除流式 DOM 控制**：`useStreamingText` (52 LOC，`requestAnimationFrame` + `appendChild` DOM 直操作) 删除；token 事件追加到 store 最新 assistant 消息 `content`；`Bubble.streaming` + `XMarkdown` 接管渲染
- **store 瘦身（对外 API 不变）**：`bySession[id]` 删 `streamingBuffer` + `flushedLength` 字段；`ChatMessage` 增 `status: 'pending' | 'streaming' | 'done' | 'error'`；token reducer 懒创建 streaming assistant 消息（首个 token 到达时若末位非 streaming assistant 则 push 一条空 content streaming assistant，避免依赖 phase-19 改 translator）；token 默认 16ms (~rAF) 合批，开关化以便测试关掉
- **主题与 i18n**：`src/lib/theme.ts` 把 `--color-paper` / `--color-line` / `--color-ink` / `--color-paper-2` / `--color-ink-3` 等 CSS 变量映射到 antd token；`App.tsx` 顶层用 `XProvider` 包根；antd `zhCN` / `enUS` 跟随 `i18n.language`；业务字符串仍走 react-i18next
- **依赖**：增 `antd`、`@ant-design/x-markdown`、`@ant-design/icons`、`dayjs`（X 隐式依赖）；chat 域内移除 `react-markdown` / `remark-gfm` 引用；清理 chat 域对 `@radix-ui/react-dropdown-menu` / `@radix-ui/react-dialog` 的引用（包是否保留视其他页面用量）
- **消费 phase-19 K1 扩展**：依赖 `tool.start.callId?` / `tool.result.callId?` 字段（phase-19 K1 例外清单第 2 条），用于 `bubbleSelectors` 按 callId 把工具调用与结果折叠进对应 assistant 消息的 ThoughtChain
- **拒绝引入**：`@ant-design/x-sdk` 的 `useXChat` / `AbstractChatProvider`（理由记在 design.md 决策 B-S6 —— HITL 跨 onRequest 边界 + 双 truth source）
- **acceptance 与单测**：保留 `Chat.acceptance.test.tsx` 全部业务断言；选择器从 radix `data-testid` 改为 ARIA role + i18n name；IPC mock 表面（K1）不动；流式断言改用 store status 字段而非 DOM textContent；删 `useStreamingText.test`；重写 5 个 chat 组件测试为新组件名

## Capabilities

### New Capabilities

- `chat-page`: chat 页面级布局与生命周期 —— 两栏（`Conversations | Bubble.List + Sender`）、`XProvider` 包根、空态 `Welcome` + `Prompts`、Sender 与 store action 的双向绑定
- `chat-session-list`: 用 `Conversations` 渲染 sessions，按 `updatedAt` 分组（today / thisWeek / earlier）、上下文菜单（rename / delete）、新建入口；折叠态 (<960px) 自定义桥
- `chat-attachments`: 用 `Attachments` 嵌入 `Sender.Header`，附件添加 / 移除 / 显示与 store `pendingAttachments` 同步
- `chat-theme-bridge`: `XProvider` 配置 + CSS 变量→antd token 映射 + antd locale 桥（跟随 `i18n.language` 切换）
- `chat-derive-bubble`: `bubbleSelectors` 派生规则 —— `ChatMessage[]` + `PendingApproval[]` → `BubbleItem[]`；tool 消息按 `toolCallId` / `callId` 折叠进上一条 assistant 的 ThoughtChain；streaming / loading 标记派生

### Modified Capabilities

- `chat-message-list`: 渲染从手写 `MessageList` 切换到 `Bubble.List`；流式 token 通过 `ChatMessage.status='streaming'` + `Bubble.streaming` + `XMarkdown` 渐进渲染；assistant 消息 `contentRender` 复合 ThoughtChain + XMarkdown + 可能的 inline approval；删除 `useStreamingText` rAF 管线
- `chat-input`: 实现从 `ChatInput` 切换到 `Sender`；`onSubmit` 调 `store.sendUserMessage`、`onCancel` 调 `store.cancelStream`；prefix 区域 paperclip 触发 Attachments 选择；删除 streamingBuffer 相关行为
- `chat-approval-panel`: 从右栏面板拆为消息流内 `Actions`（Approve / Reject / Edit）+ Edit 时弹 `ApprovalDrawer`（内嵌 `JsonArgsEditor` + `FrontmatterDiff`）；`approveTool(sessionId, callId, editedArgs?)` 签名与 IPC 路径不变

## Impact

- **代码**：`src/pages/Chat.tsx` 重写为两栏；删除 17 个 chat 组件文件（`SessionList*` / `MessageList` / `UserBubble` / `AssistantMarkdown` / `ToolCallCard` / `ToolResultCard` / `ChatInput` / `AttachmentChips` / `ApprovalPanel` / `MessageOps` / `DeleteSessionDialog` / `ShortcutsDialog` / `ChatBanner` / `SessionStatusBadge` / `SessionContextMenu`）+ `useStreamingText.ts` 及其单测；新增 6 文件（`src/lib/theme.ts`、`src/components/chat/bubbleSelectors.ts`、`chatRoles.tsx`、`ApprovalInlineActions.tsx`、`ApprovalDrawer.tsx`、`ExternalLinkAnchor.tsx`）；保留 `JsonArgsEditor.tsx`、`FrontmatterDiff.tsx`、`ProfileFooter.tsx`（Drawer / 顶栏内继续用，仅 antd token 视觉对齐）；净 LOC 约 −900
- **存储**：`src/stores/chat.ts` 删 `streamingBuffer` + `flushedLength` 字段；`ChatMessage` 增 `status` 字段；token reducer 改为懒创建 streaming assistant；store 对外 action 集（loadSessions / selectSession / createSession / renameSession / deleteSession / sendUserMessage / cancelStream / approveTool / rejectTool / updateSessionProfile / setPendingPromptText / pushAttachment / removeAttachment / bumpFocusInput / bumpShowShortcuts）签名全部不变
- **依赖**：增 `antd` / `@ant-design/x-markdown` / `@ant-design/icons` / `dayjs`；减 chat 域 `react-markdown` / `remark-gfm` 引用；清理 chat 域对 radix dialog/dropdown 引用；`@ant-design/x` 已在主线 (^2.7.0)
- **IPC**：`AgentEvent` 契约前端零感知改动；**消费 phase-19 已扩字段** `tool.start.callId?` 与 `tool.result.callId?`（K1 例外清单第 2 条）
- **测试**：删 `useStreamingText.test`；重写 5 个 chat 组件测试（`ApprovalPanel`→`ApprovalInlineActions`+`ApprovalDrawer`、`ChatInput`→`ChatInputArea`、`MessageList`→`BubbleListAdapter`+`bubbleSelectors`、`SessionList`→`ConversationsAdapter`、`AttachmentChips`→`AttachmentsAdapter`）；保留 `FrontmatterDiff.test`、`ProfileFooter.test`（微调）；新增 `chatRoles.test.tsx`、`themeTokens.test.ts`；`Chat.acceptance.test.tsx` 修订选择器策略
- **依赖顺序**：**阻塞于 phase-19 完整完成且 K1 callId 扩展已合主线**；phase-19 进行中时 phase-20 stay blocked
- **非目标**：不动后端 / agent / IPC（属 phase-19）；不引入 `@ant-design/x-sdk`（useXChat / AbstractChatProvider）；不迁其他页面（Library / Browse / Editor / History / Settings / Search）；不做 Welcome onboarding tour / Cmd+K 命令面板 / Sources 引用 / Think reasoning 折叠 / slash commands suggestion / Notification 替代 radix toast（均留 future）
