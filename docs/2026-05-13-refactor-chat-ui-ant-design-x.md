# PRD · 子项目 B · Chat UI 迁移到 @ant-design/x

## 1 · 背景与目标

### 1.1 现状

`src/pages/Chat.tsx`（180）+ `src/components/chat/*`（25 个组件，共约 2700 LOC）+ `src/stores/chat.ts`（571）+ `src/hooks/useStreamingText.ts`（52）构成现有 chat UI，技术栈：

- React + TypeScript
- Radix UI（DropdownMenu / Dialog / Slot / Toast）
- Tailwind CSS + 自定义 CSS 变量（`--color-paper`、`--color-line`、`--color-ink` 等"松鼠"视觉）
- react-markdown + remark-gfm
- 手写 rAF DOM 流式管线（useStreamingText 用 `appendChild` 直接操作 DOM）

行为完整但维护负担高，且 chat UI 是 AI 应用的视觉门面 —— X 库提供了更对齐 AI chat 的组件原语。

### 1.2 目标

把 chat 页面（仅 chat 页）迁移到 **@ant-design/x**：

- 用 `Bubble.List` / `Sender` / `Conversations` / `ThoughtChain` / `Welcome` / `Prompts` / `Actions` / `Attachments` 替换现有手写组件
- 用 `@ant-design/x-markdown` 替换 react-markdown，获得流式 markdown 渲染
- 用 X 内置的 typing animation 替代手写的 rAF DOM 管线
- 引入 antd `Modal` / `Drawer` 处理 X 库未覆盖的弹层（审批编辑、删除确认、快捷键）
- 保留"松鼠"视觉身份（CSS 变量映射到 antd theme token）
- IPC 契约不变；store 对外 API 不变 —— 仅替换 UI 层

### 1.3 非目标

- 任何后端 / agent / IPC 改动（A 的事）
- 新 chat 功能（仅 refactor，行为对等）
- 把其他页面（Library / Browse / Editor / History / Settings / Search）迁到 antd
- Welcome onboarding tour、Cmd+K 命令面板、Sources 引用展示、Think reasoning 折叠 —— 留 future
- 自定义 i18n re-architecture

---

## 2 · 关键架构决策

| 编号      | 议题          | 决策                                                                                                                                                                                                           |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B-S3**  | 状态管理      | **Zustand 瘦身 + X 组件直消费**：保留跨 session / 审批 / 附件状态；删除 streamingBuffer + useStreamingText；token 事件直接追加到最新 assistant message.content，Bubble 的 streaming prop 接管 typing animation |
| **B-A3**  | 审批 UX       | **inline 卡片 + Drawer**：默认消息流内 Actions（Approve / Reject / Edit）；点 Edit 开 antd Drawer 含 JsonArgsEditor + FrontmatterDiff。右侧栏取消，布局简化为两栏                                              |
| **B-M1**  | Markdown 渲染 | **@ant-design/x-markdown**：流式 markdown 原生支持；保留 `a` 标签的 IPC 外链跳转                                                                                                                               |
| **B-T1**  | 工具调用展示  | **ThoughtChain**：assistant 消息含 toolCalls 时，contentRender 渲 ThoughtChain；tool result 折叠进 step；自然展示多步并行 tool（与 §A.4.4 并行约束去除契合）                                                   |
| **B-Th1** | 主题集成      | **CSS 变量 → antd token 映射**：`XProvider` 用 token 表把 `--color-paper` 等映射到 `colorBgContainer` 等；松鼠视觉延续；chat 页内不再用 tailwind                                                               |

---

## 3 · 依赖与组件映射

### 3.1 新增依赖

```
@ant-design/x                      # Bubble, Sender, Conversations, ThoughtChain,
                                   #   Welcome, Prompts, Actions, Attachments, XProvider
@ant-design/x-markdown             # XMarkdown（流式 markdown）
antd                               # Modal / Drawer / Badge / Alert（X 未覆盖部分）
@ant-design/icons                  # 图标系统统一
```

`@ant-design/x` 隐式依赖 `antd`、`@ant-design/icons`、`dayjs`，按官方版本约束安装。

### 3.2 移除依赖

```
react-markdown
remark-gfm
@radix-ui/react-dropdown-menu      # chat 页内取消使用；如其他页有用则保留
@radix-ui/react-dialog             # 同上
```

Radix 的 `@radix-ui/react-toast`、`@radix-ui/react-slot` 别处仍用则保留。

### 3.3 组件映射全表

| 现有 (LOC)                                                    | 新方案                                                                           | 备注                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `Chat.tsx` (180, 三栏)                                        | 重写为两栏：`Conversations` \| `Flex vertical { Bubble.List + Sender }` + Drawer | 右栏取消                                      |
| `SessionList` + `SessionListRow` + `SessionContextMenu` (265) | `Conversations`（groupable, creation, menu）                                     | 折叠态需 ~30 行自定义桥（X 不原生支持窄折叠） |
| `MessageList` (122)                                           | `Bubble.List`（autoScroll, role-based）                                          | role 配置 stable 顶层定义                     |
| `UserBubble` (27)                                             | Bubble role `user`（placement='end'）                                            | —                                             |
| `AssistantMarkdown` (64)                                      | Bubble role `assistant` + `contentRender` 用 `XMarkdown`                         | 保留 `a` 标签 IPC 外链跳转的自定义 component  |
| `MessageOps` (59)                                             | Bubble role.footer 用 `Actions`（Actions.Copy + 自定义 Quote / Retry）           | —                                             |
| `ToolCallCard` + `ToolResultCard` (58)                        | assistant 消息含 toolCalls 时 `contentRender` 渲 `ThoughtChain`                  | tool 调用作为 reasoning step                  |
| `ChatInput` (167)                                             | `Sender`（onSubmit / onCancel / header / prefix）                                | header 嵌 Attachments；可后续接 Suggestion    |
| `AttachmentChips` (45)                                        | `Attachments`（嵌进 Sender.Header）                                              | 不再独立组件                                  |
| `JsonArgsEditor` (58)                                         | **保留**（在 Drawer 内继续用）                                                   | JSON 编辑 antd 无现成                         |
| `FrontmatterDiff` (67)                                        | **保留**（在 Drawer 内继续用）                                                   | diff 视图自写                                 |
| `ApprovalPanel` (195)                                         | 拆为 inline `Actions` + `ApprovalDrawer.tsx`（新，~120）                         | 右栏取消                                      |
| `DeleteSessionDialog` (35) / `ShortcutsDialog` (57)           | antd `Modal`                                                                     | —                                             |
| `SessionStatusBadge` (19)                                     | antd `Badge`                                                                     | —                                             |
| `ChatBanner` (41)                                             | antd `Alert`                                                                     | —                                             |
| `ProfileFooter` (37)                                          | 自定义（保留），改 antd token                                                    | —                                             |
| 空态 4 卡片（Chat.tsx 嵌入）                                  | `Welcome` + `Prompts wrap`                                                       | —                                             |
| `useStreamingText` (52)                                       | **删除** —— Bubble.streaming 接管                                                | 净减 52 LOC                                   |

净 UI 改动：现有 chat UI ~2700 LOC 中约 1300 LOC 由 X 组件接管或删除；新增约 350 LOC（ApprovalDrawer、bubbleSelectors、chatRoles、theme.ts 等），**净减约 900 LOC**。

### 3.4 新文件

- `src/lib/theme.ts` —— CSS 变量 → antd token 映射
- `src/components/chat/bubbleSelectors.ts` —— store messages → Bubble.List items 派生层
- `src/components/chat/chatRoles.tsx` —— Bubble role 配置（顶层 stable）
- `src/components/chat/ApprovalInlineActions.tsx` —— inline Approve / Reject / Edit
- `src/components/chat/ApprovalDrawer.tsx` —— 编辑 args 抽屉（含 JsonArgsEditor + FrontmatterDiff）
- `src/components/chat/ExternalLinkAnchor.tsx` —— XMarkdown 的 `a` override（走 IPC 外链）

### 3.5 删除文件

- `src/components/chat/SessionList.tsx`、`SessionListRow.tsx`、`SessionContextMenu.tsx`
- `src/components/chat/MessageList.tsx`、`UserBubble.tsx`、`AssistantMarkdown.tsx`
- `src/components/chat/ToolCallCard.tsx`、`ToolResultCard.tsx`
- `src/components/chat/ChatInput.tsx`、`AttachmentChips.tsx`
- `src/components/chat/ApprovalPanel.tsx`、`MessageOps.tsx`、`DeleteSessionDialog.tsx`、`ShortcutsDialog.tsx`、`ChatBanner.tsx`、`SessionStatusBadge.tsx`
- `src/hooks/useStreamingText.ts` + 单测

---

## 4 · 主题与 i18n 集成

### 4.1 Theme tokens (B-Th1)

`src/lib/theme.ts`：

```ts
export const themeTokens = {
  colorBgContainer: 'var(--color-paper)',
  colorBgLayout: 'var(--color-paper-2)',
  colorBorder: 'var(--color-line)',
  colorText: 'var(--color-ink)',
  colorTextSecondary: 'var(--color-ink-3)',
  fontFamily: '"Source Han Serif SC", serif',
  borderRadius: 6
  // ... 其余按需补
}
```

`App.tsx` 顶层：

```tsx
<XProvider locale={antdLocale} theme={{ token: themeTokens, components: { Bubble: { ... }, Sender: { ... } } }}>
  ...
</XProvider>
```

CSS 变量定义保留在 `index.css`，light/dark 切换逻辑不动。

### 4.2 i18n 桥（react-i18next + antd locale）

- 保留 `react-i18next` 与现有所有键（`chat.*` / `approval.*` 等）。
- `XProvider.locale` 接 antd 的 `zhCN` / `enUS`，按 `i18n.language` 切换（约 30 LOC 桥代码）：

```tsx
const antdLocale = i18n.language.startsWith('zh') ? zhCN : enUS
```

- antd 内置字符串（Modal 的 OK/Cancel、Attachments 的"上传"等）由 antd locale 提供；业务字符串仍走 react-i18next。

---

## 5 · 数据流

### 5.1 Store 瘦身（B-S3）

`src/stores/chat.ts` 改动：

| 字段                                                | 当前                               | 新方案                                                                 |
| --------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `bySession[id].streamingBuffer: string`             | token 增量缓冲                     | **删除**                                                               |
| `bySession[id].flushedLength: number`               | useStreamingText rAF 已 flush 长度 | **删除**                                                               |
| `bySession[id].messages: ChatMessage[]`             | 历史消息                           | **保留**，扩展 `status: 'pending' \| 'streaming' \| 'done' \| 'error'` |
| `bySession[id].pendingApprovals: PendingApproval[]` | 审批队列                           | **保留**                                                               |
| `bySession[id].pendingAttachments: Attachment[]`    | 待发送附件                         | **保留**                                                               |
| `bySession[id].status: SessionStatus`               | 会话状态机                         | **保留**                                                               |
| `pendingPromptText`                                 | 空态卡片注入 input                 | 改为 `focusInputBump` + i18n 提示文本由组件本地 state 处理             |

token 事件不再写 streamingBuffer，**直接追加到最新 assistant message 的 content**：

```ts
case 'token': {
  const slot = state.bySession[sessionId];
  const last = slot.messages[slot.messages.length - 1];
  if (last?.role === 'assistant') last.text += event.text;
  break;
}
case 'message.appended': {
  slot.messages.push({ ...event.message, status: 'streaming' });
  break;
}
case 'done': {
  const final = slot.messages[slot.messages.length - 1];
  if (final?.role === 'assistant') final.status = 'done';
  slot.status = 'idle';
  break;
}
case 'tool.approval-needed': {
  slot.pendingApprovals.push({ callId, toolName, args, reason, receivedAt: Date.now() });
  slot.status = 'awaiting-approval';
  break;
}
```

净减约 80 LOC store 代码 + 52 LOC（useStreamingText 文件删）。

### 5.2 派生层 (bubbleSelectors)

`src/components/chat/bubbleSelectors.ts`（新，~80 行）把 store 的 `ChatMessage[]` 派生为 `Bubble.List` items；并把后续 `role='tool'` 消息折叠进对应 assistant 消息的 ThoughtChain 数据：

```ts
type BubbleItem = {
  key: string
  role: 'user' | 'assistant'
  content: string | { text: string; toolSteps: ToolStep[] }
  streaming?: boolean
  loading?: boolean
}

type ToolStep = {
  call: { id: string; name: string; args: unknown }
  result?: { ok: true; data: unknown } | { ok: false; error: string }
  pendingApproval?: PendingApproval
}

export function deriveBubbleItems(
  messages: ChatMessage[],
  pendingApprovals: PendingApproval[]
): BubbleItem[] {
  const out: BubbleItem[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'tool') continue // 已被合并到上一个 assistant
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const toolSteps = m.toolCalls.map((tc) => ({
        call: tc,
        result: findToolResultFor(messages, i, tc.id),
        pendingApproval: pendingApprovals.find((p) => p.callId === tc.id)
      }))
      out.push({
        key: m.id,
        role: 'assistant',
        content: { text: m.text, toolSteps },
        streaming: m.status === 'streaming',
        loading: m.status === 'streaming' && !m.text && toolSteps.length === 0
      })
    } else {
      out.push({
        key: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.text,
        streaming: m.status === 'streaming',
        loading: m.status === 'streaming' && !m.text
      })
    }
  }
  return out
}
```

### 5.3 Roles 配置（stable）

`src/components/chat/chatRoles.tsx`（新，~60 行）顶层模块导出 stable 对象，避免 inline 触发 Bubble re-render：

```tsx
export const chatRoles: BubbleListProps['role'] = {
  user: {
    placement: 'end',
    avatar: <Avatar icon={<UserOutlined />} />
  },
  assistant: {
    placement: 'start',
    avatar: <Avatar icon={<RobotOutlined />} />,
    contentRender: (content, info) => {
      const c = content as { text: string; toolSteps: ToolStep[] }
      return (
        <>
          {c.toolSteps?.length > 0 && <ThoughtChain items={c.toolSteps.map(toThoughtChainItem)} />}
          {c.text && <XMarkdown content={c.text} components={{ a: ExternalLinkAnchor }} />}
          {c.toolSteps?.some((s) => s.pendingApproval) && (
            <ApprovalInlineActions step={c.toolSteps.find((s) => s.pendingApproval)!} />
          )}
        </>
      )
    },
    footer: (content, info) => <MessageActions messageId={info.key} text={content?.text ?? ''} />
  }
}
```

### 5.4 Sender + Attachments

```tsx
function ChatInputArea() {
  const [value, setValue] = useState('')
  const status = useChatStore((s) => s.bySession[activeId]?.status ?? 'idle')
  const attachments = useChatStore((s) => s.bySession[activeId]?.pendingAttachments ?? [])
  const send = useChatStore((s) => s.sendUserMessage)
  const cancel = useChatStore((s) => s.cancelStream)
  const attachRef = useRef<AttachmentsRef>(null)

  return (
    <Sender
      value={value}
      onChange={setValue}
      loading={status === 'streaming'}
      onSubmit={(text) => {
        send({ text, attachments })
        setValue('')
      }}
      onCancel={cancel}
      header={
        attachments.length > 0 && (
          <Sender.Header>
            <Attachments
              ref={attachRef}
              items={attachments.map(toAntdFileItem)}
              onChange={({ fileList }) => syncAttachments(fileList)}
              overflow="scrollX"
            />
          </Sender.Header>
        )
      }
      prefix={<PaperClipOutlined onClick={() => attachRef.current?.select({ multiple: true })} />}
    />
  )
}
```

### 5.5 Conversations + 折叠态

```tsx
const items = sessions.map(s => ({
  key: s.id,
  label: s.title || t('chat.untitled'),
  group: groupSession(s.updatedAt),   // 'today' / 'thisWeek' / 'earlier'
  menu: { items: [
    { key: 'rename', label: t('chat.rename'), onClick: () => ... },
    { key: 'delete', label: t('chat.delete'), onClick: () => ... },
  ]},
}));

<Conversations
  items={items}
  activeKey={activeSessionId}
  onActiveChange={selectSession}
  groupable
  creation={{ label: t('chat.new'), onClick: createSession }}
/>
```

**折叠态**：窗口宽 < 960px 时把 Conversations 包一层"窄列表"自定义 mode —— X 本身不原生支持窄折叠。约 30 行小桥接（仅渲图标 + 截断标题）。

---

## 6 · 审批 UX 详细（B-A3）

### 6.1 inline Actions

```tsx
function ApprovalInlineActions({ step }: { step: ToolStep }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const approve = useChatStore((s) => s.approveTool)
  const reject = useChatStore((s) => s.rejectTool)
  const sessionId = useChatStore((s) => s.activeSessionId)! // 待审批仅存在于当前 session
  const callId = step.pendingApproval!.callId

  return (
    <>
      <Actions
        items={[
          {
            key: 'approve',
            label: t('approval.approve'),
            icon: <CheckOutlined />,
            onItemClick: () => approve(sessionId, callId)
          },
          {
            key: 'reject',
            label: t('approval.reject'),
            icon: <CloseOutlined />,
            onItemClick: () => reject(sessionId, callId)
          },
          {
            key: 'edit',
            label: t('approval.edit'),
            icon: <EditOutlined />,
            onItemClick: () => setDrawerOpen(true)
          }
        ]}
        variant="default"
      />
      <ApprovalDrawer
        open={drawerOpen}
        step={step}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(editedArgs) => {
          approve(sessionId, callId, editedArgs)
          setDrawerOpen(false)
        }}
      />
    </>
  )
}
```

### 6.2 ApprovalDrawer.tsx

封装现有 `JsonArgsEditor` + `FrontmatterDiff`：

```tsx
<Drawer
  open={open}
  title={t('approval.edit.title')}
  width={520}
  onClose={onClose}
  footer={
    <Space>
      <Button onClick={onClose}>{t('common.cancel')}</Button>
      <Button type="primary" onClick={() => onSubmit(currentArgs)}>{t('approval.approveWithEdits')}</Button>
    </Space>
  }
>
  <JsonArgsEditor value={currentArgs} onChange={setCurrentArgs} schema={...} />
  {step.call.name === 'update_frontmatter' && (
    <FrontmatterDiff before={originalFm} after={previewWithPatch(currentArgs.patch)} />
  )}
</Drawer>
```

`approveTool` 的现有 signature `(sessionId, callId, editedArgs?)` 保持不变，Drawer 提交时传入 editedArgs。

---

## 7 · 流式渲染桥

**rAF DOM 微观控制全部消失**：

- 当前：后端 `token` 事件 → store.streamingBuffer 累加 → useStreamingText 用 `requestAnimationFrame` + `appendChild` 直接操作 DOM textContent。
- 新：后端 `token` 事件 → store reducer 把 token 追加到最新 assistant message.text → React re-render → Bubble.List 看到 `streaming: true` 的 item → Bubble 内部 typing animation 流畅播放。

性能注意：每个 token 触发一次 Zustand setState → React diff。X 内部对 `streaming: true` 的 Bubble 有节流优化；如观察到性能问题，可在 reducer 内加 token 节流（如 16ms 一次合批），但 PRD 阶段不预设。

---

## 8 · Store API 兼容性

`chat.ts` 对外暴露的 action 集**全部保持不变**：

```
loadSessions / selectSession / createSession / renameSession / deleteSession /
sendUserMessage / cancelStream / approveTool / rejectTool /
updateSessionProfile / setPendingPromptText / pushAttachment / removeAttachment /
bumpFocusInput / bumpShowShortcuts
```

签名不变；仅内部状态字段重构。这确保：

- IPC 监听层（`chat-store-effects`）零改动
- 非 chat 页面引用 store 处零改动
- 接受度测试 mock `window.api.*` 表面不动

---

## 9 · 测试策略

| 测试                             | 行动                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useStreamingText.test.ts`       | **删除**                                                                                                                 |
| `ApprovalPanel.test.tsx` (287)   | **重写** → `ApprovalInlineActions.test.tsx`（~120）+ `ApprovalDrawer.test.tsx`（~150）                                   |
| `ChatInput.test.tsx` (315)       | **重写** → `ChatInputArea.test.tsx`（~200）                                                                              |
| `MessageList.test.tsx` (398)     | **重写** → `BubbleListAdapter.test.tsx`（~200）+ `bubbleSelectors.test.ts`（~100）                                       |
| `SessionList.test.tsx` (343)     | **重写** → `ConversationsAdapter.test.tsx`（~200）                                                                       |
| `AttachmentChips.test.tsx` (112) | **重写** → `AttachmentsAdapter.test.tsx`（~80）                                                                          |
| `FrontmatterDiff.test.tsx` (33)  | **保留**                                                                                                                 |
| `ProfileFooter.test.tsx` (77)    | 微调（仅 antd token 视觉差）                                                                                             |
| `chat.test.ts`（store）          | **修订**：删 streamingBuffer 用例；新增 status 字段 + token reducer                                                      |
| `Chat.acceptance.test.tsx`       | **修订**：选择器从 radix `data-testid` 改为 X 组件 + antd className 组合；流式断言改用 store status 而非 DOM textContent |
| **新增** `chatRoles.test.tsx`    | role.contentRender 快照                                                                                                  |
| **新增** `themeTokens.test.ts`   | CSS 变量 → antd token 映射的烟雾测试（采样 5 个 token）                                                                  |

接受度测试（`src/__acceptance__/`）必须 100% 通过，且 IPC mock 表面零改动 —— K1 的对外契约。

---

## 10 · 实施分块（仅供后续 plan 参考）

> 本 session 不实施。按 OpenSpec change `phase-20-chat-ui-ant-design-x` 走 propose → plan → apply。每个 block 完成后整套 chat 用例应通过。

1. **基础设施**：装包；`src/lib/theme.ts`；`App.tsx` 用 XProvider 包根；其他页面冒烟（不影响）；i18n locale 桥
2. **派生层与 roles**：写 `bubbleSelectors.ts`、`chatRoles.tsx`、`ExternalLinkAnchor`；单测
3. **Conversations + Sender**：替换 SessionList → Conversations；替换 ChatInput → ChatInputArea；旧组件暂保留侧路；折叠态桥
4. **Bubble.List + ThoughtChain**：替换 MessageList → BubbleListAdapter
5. **审批 inline + Drawer**：替换 ApprovalPanel；右栏取消改两栏；新增 ApprovalInlineActions + ApprovalDrawer
6. **Store 瘦身**：删 streamingBuffer / flushedLength / useStreamingText；token reducer 改为直接追加
7. **清理**：删旧 chat 组件、radix chat 范围引用、旧测试；跑完整测试与 Chat.acceptance

---

## 11 · OpenSpec capability 变化

**MODIFIED**：

- `chat-page` —— 两栏布局；XProvider；空态用 Welcome+Prompts
- `chat-message-list` —— Bubble.List + ThoughtChain + XMarkdown
- `chat-input` —— Sender + Attachments；删 streamingBuffer 相关行为
- `chat-session-list` —— Conversations；折叠态自定义桥
- `chat-approval-panel` —— inline Actions + Drawer；右栏取消
- `chat-attachments` —— Attachments 组件接管

**ADDED**：

- `chat-theme-bridge` —— XProvider + antd token 映射 + i18n locale 桥
- `chat-derive-bubble` —— bubbleSelectors 派生层规格（messages → bubble items 的折叠规则）

**UNCHANGED**：A 的所有 capability、`agent-ipc`、非 chat 页面

---

## 12 · 非目标（B 不做）

- 任何后端 / agent / IPC 改动（A 的事）
- 新 chat 功能（仅 refactor，行为对等）
- Welcome onboarding tour、Cmd+K 命令面板（留 future）
- 把 Library / Browse / Editor / History / Settings / Search 迁到 antd
- Sources / 引用展示（RAG 落地时再做）
- Think / 折叠 thinking tokens（依赖 §A.13 reasoning models）
- 自定义命令 Suggestion（slash commands）—— 留 future
- Notification 替代现有 radix toast —— 留 future

---

## 13 · 行为对等性核对清单

实施时须逐项验证（在 `Chat.acceptance.test.tsx` 中保留断言）：

1. 空 session 进入 → Welcome + 4 个 Prompt 卡片渲染；点卡片 → Sender 填入文本
2. 普通对话流式：token 按收到顺序展示，typing 动画无闪烁
3. 长对话：autoScroll 维持底端，用户上滑后停止 autoScroll
4. 工具调用展示：assistant + tool result 折叠为 ThoughtChain 单一卡片
5. 待审批：inline Actions 出现（Approve / Reject / Edit）；status='awaiting-approval'
6. 编辑 args：点 Edit → Drawer 打开 → 改 JSON → 提交 → 后端接到 editedArgs
7. cancel：streaming 中点 Sender.onCancel → 立即停笔；status='idle'
8. 切换 session：上一 session 的 streaming 不污染当前
9. 删除 session：Conversations 立即移除；前后端一致
10. profile 切换：顶栏下拉切换；下一次 send 用新 profile
11. 附件：Attachments 加文件 → 发送 → 后端收到 attachments 数组；UI 清空
12. 暗色模式：CSS 变量切换；antd token 自动跟随
13. 快捷键：`?` 仍打开 ShortcutsDialog（antd Modal）
14. 删除会话确认：DeleteSessionDialog 替换为 antd Modal，行为一致
15. 错误：error 事件 → `ChatBanner`（antd Alert）展示
