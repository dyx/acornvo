## Context

`src/pages/Chat.tsx`（180 LOC，三栏布局）+ `src/components/chat/*`（25 个组件、约 2700 LOC）+ `src/stores/chat.ts`（571 LOC）+ `src/hooks/useStreamingText.ts`（52 LOC）构成现有 chat UI，技术栈：React + TS + Radix（DropdownMenu / Dialog / Slot / Toast）+ Tailwind + 自定义 CSS 变量（"松鼠"视觉）+ react-markdown + 手写 rAF DOM 流式管线。

`@ant-design/x` 已在主线（`^2.7.0`），但本次之前没用过。`@ant-design/x-markdown` / `antd` / `@ant-design/icons` / `dayjs` 待引入。phase-19（AI / LangChain 迁移）正在重写 agent 内核，IPC 契约 `AgentEvent`（K1）保持不变，但**已扩 K1 例外清单第 2 条**：`tool.start` / `tool.result` 增加可选 `callId` 字段，phase-20 消费它做工具调用与结果的折叠。

**约束**：

- phase-19 完整完成且 K1 callId 扩展已合主线后才开工（顺序执行）
- chat store 对外 action 集签名不变（IPC 监听层 `chat-store-effects`、非 chat 页面引用处零改动）
- `Chat.acceptance.test.tsx` 全部业务断言保留；IPC mock 表面（K1）不动
- 保留松鼠视觉身份（CSS 变量映射到 antd token，light/dark 切换逻辑不动）

## Goals / Non-Goals

**Goals:**

- 把 chat 页（仅 chat 页）UI 层迁到 `@ant-design/x` + `@ant-design/x-markdown` + antd
- 净减约 900 LOC（手写组件让位给上游组件原语）
- 流式渲染交还给 X 内置 typing animation + XMarkdown，删除手写 rAF DOM 管线
- 审批从右栏面板拆为消息流内 inline Actions + 编辑用 Drawer，布局简化为两栏
- CSS 变量映射到 antd token，松鼠视觉延续；i18n locale 跟随业务 `i18n.language`

**Non-Goals:**

- 任何后端 / agent / IPC 改动（属 phase-19）
- 新 chat 功能（仅 refactor，行为对等）
- 把 Library / Browse / Editor / History / Settings / Search 迁到 antd
- 引入 `@ant-design/x-sdk` 任何一层（useXChat / AbstractChatProvider / XRequest / useXConversations）
- Welcome onboarding tour、Cmd+K 命令面板、Sources 引用展示、Think reasoning 折叠、slash commands Suggestion、Notification 替代 radix toast（均留 future）
- 自定义 i18n re-architecture

## Decisions

### B-S3 · 状态管理

**决策**：**Zustand 瘦身 + X 组件直消费**。store 保留跨 session / 审批 / 附件状态；删除 `streamingBuffer` + `flushedLength`；token 事件直接追加到最新 assistant 消息的 `content`；Bubble 的 `streaming` prop 接管 typing animation 提示视觉。

**理由**：

- session_messages 表是 UI truth source（phase-19 design.md §S1 已立约），store 是其渲染端镜像；引入 useXChat 等于多一层 truth source 易跑偏
- HITL 跨多次 IPC 调用（user message → token... → approval-needed → approve → token... → done），不符合 Provider "一次 onRequest = 一段响应" 模型
- 移除 rAF DOM 微观控制后，React + Zustand 的天然 re-render + X 的 streaming UI 已够用

**替代方案**：

- A. 引入 `useXChat` + 自定义 `AbstractChatProvider` 包 IPC —— 见 B-S6 拒绝理由
- B. 只引 `useXConversations` 管 sessions 列表，store 管 messages —— 净 LOC wash，多一份 state 来源；本次不选

### B-S4 · token 早于 message.appended 的处理

**决策**：**reducer 懒创建 streaming assistant**。首个 `token` 事件到达时若末位消息非 `status='streaming'` 的 assistant，则 push 一条 `{ role: 'assistant', text: event.text, status: 'streaming', createdAt: Date.now(), id: nextMsgId() }`；后续 `token` 追加到这条消息的 `text`。后续 `message.appended` 事件（assistant，带 toolCalls 与最终 id）按 LangGraph `AIMessage.id` 去重合并到这条临时消息（替换 id、补 toolCalls）。

**理由**：

- LangGraph 流式协议中 `["messages", chunk]` 与 `["updates", AIMessage]` 是两个独立流；tokens 天然先于 message.appended 到达
- 让 phase-19 stream-translator 在首个 token 前 emit 合成 `message.appended` 会污染 translator 单一职责
- B 侧反应器懒创建更内聚——store 自己处理 "正在生成的临时消息" 这个 UI 概念

**替代方案**：

- A. phase-19 translator 提前 emit 合成 message.appended —— 拒绝（污染 translator + 跨 A/B 协议耦合）
- B. 仍保留 `streamingBuffer` 但走 React render —— 拒绝（store 字段未瘦下来）

### B-S5 · token 节流

**决策**：**reducer 默认 16ms 合批**（~rAF），开关化（`__chatTokenBatching: boolean`）便于测试关掉断言确定性。合批时把同窗口内所有 `token` 事件的 `text` 串接后单次 setState。

**理由**：

- 每个 token 一次 setState 在长回复（1k+ tokens）下会触发 1k+ 次 React diff；即便 React 18 batch 也会被 IPC 边界打散
- X 的 Bubble.streaming 优化仅作用于 Bubble 内部 typing animation，不能消除父组件 re-render
- 16ms 合批与浏览器渲染周期对齐；用户感知不到延迟（最多一帧）
- 开关化避免破坏现有"token 计数"风格的单元测试

**替代方案**：

- A. PRD 原方案"如观察到性能问题再加节流" —— 拒绝；性能基线本应预设
- B. 30ms / 50ms 合批 —— 节流过粗，typing animation 抖动可见
- C. 仅在 message 长度 > N 时启用 —— 复杂度不值

### B-S6 · 不引入 `@ant-design/x-sdk`

**决策**：**不引入 `useXChat` / `AbstractChatProvider` / `useXConversations`**。仅使用 `@ant-design/x`（UI 组件）+ `@ant-design/x-markdown`（XMarkdown）。

**理由（结构性，不可调和）**：

1. `AbstractChatProvider` 强绑 `XRequest`（HTTP fetch），渲染进程**没有 HTTP** —— 数据走 Electron IPC
2. `useXChat` 假设"一次 onRequest = 一段响应"；HITL 流程"用户消息 → 中断 → 用户审批（独立 IPC 调用）→ 继续"跨多次 onRequest 边界
3. 引入会产生**双 truth source**：useXChat 内部 messages 与 store.bySession[].messages 都是 SoT，需要 `setMessages` 持续同步
4. 接受度测试（K1 mock 不动）期望 IPC 表面驱动 UI；引入 useXChat 改变内部数据流

**替代方案**：

- A. 注册 Electron 自定义 protocol（如 `acornvo-chat://`）让 fetch 路由到 IPC，硬接 useXChat —— 拒绝（净增协议层 + 仍有 HITL 不匹配问题）
- B. 起 in-process LangGraph Server 走真 HTTP —— 拒绝（推翻 phase-19 §K1 决策；引入 localhost 网络层）

文档备案：本次拒绝原因写进此节，避免后续 reviewer 反复问"为什么不用 X 官方推荐路径"。

### B-A3 · 审批 UX

**决策**：**inline Actions + Drawer**。assistant 消息含待审 toolCall 时，`contentRender` 渲 inline `Actions`（Approve / Reject / Edit）；点 Edit 弹 antd `Drawer`，内嵌既有 `JsonArgsEditor` + `FrontmatterDiff`（保留），编辑后 Submit 调 `approveTool(sessionId, callId, editedArgs)`。右栏取消，布局简化为两栏。

**理由**：

- 审批在视觉上贴近触发它的工具调用更直觉
- 右栏面板需要"当前 session 主动 vs 后台 session 标记"的协调，删掉简化心智
- Drawer 与 Modal 相比更适合表单类编辑（侧滑、占用面积大、可保留下方上下文）

**替代方案**：

- A. 保留右栏 —— 拒绝（PRD 已立约 B-A3）
- B. 用 Modal 替代 Drawer —— 编辑面积小，FrontmatterDiff 显示受挤

### B-M1 · Markdown 渲染

**决策**：**`@ant-design/x-markdown`** 替换 `react-markdown + remark-gfm`。XMarkdown 原生支持流式（增量渲染未闭合标记不抖动）。`a` 标签 override 为 `ExternalLinkAnchor`，走现有 IPC 外链跳转（`ipc.file.openExternal`）。

**理由**：

- XMarkdown 与 Bubble.streaming 联动，渲染层无需手动 切 raw/markdown 模式（旧实现的 §"done 切换 markdown" Scenario）
- react-markdown + remark-gfm 净依赖较大，迁后可移除

**风险**：

- XMarkdown 对未闭合 fenced code / 半行 table / 未闭合 `**` 的处理需要烟雾测试
- 高亮主题需要与松鼠视觉协调；用 antd token 提供 `colorBgLayout` 等已能满足，复杂语言高亮（highlight.js / shiki）继续 future

### B-T1 · 工具调用展示

**决策**：**`ThoughtChain`**。assistant 消息含 `toolCalls` 时，`contentRender` 渲 `ThoughtChain`；tool 消息按 `callId` 折叠为对应 step；自然展示 LangGraph v1 默认的并行 tool_calls。step 显示：工具名 + args（折叠）+ result（折叠）+ 待审 inline Actions。

**理由**：

- 当前 `ToolCallCard` + `ToolResultCard` 是各自独立卡片，多步工具流视觉混乱
- ThoughtChain 的 "reasoning step" 心智匹配多步 tool 流程
- phase-19 K1 callId 扩展给了精准折叠的钩子（旧 `tool.start`/`result` 无 id 链接无法做）

### B-Th1 · 主题集成

**决策**：**CSS 变量映射到 antd token**。`src/lib/theme.ts` 导出 `themeTokens` 对象，key 为 antd token 名，value 为 `'var(--xxx)'` 字符串。`XProvider` 在 `App.tsx` 顶层包根，传入 `{ token: themeTokens, components: { Bubble: ..., Sender: ... } }`。CSS 变量定义保留在 `index.css`，light/dark 切换逻辑不动。

```ts
export const themeTokens = {
  colorBgContainer:    'var(--color-paper)',
  colorBgLayout:       'var(--color-paper-2)',
  colorBorder:         'var(--color-line)',
  colorText:           'var(--color-ink)',
  colorTextSecondary:  'var(--color-ink-3)',
  fontFamily:          '"Source Han Serif SC", serif',
  borderRadius:        6,
};
```

**已知风险**：antd 的派生 token（hover / focus 色变种）基于字面色值算 HSL，CSS 变量会成不透明字符串导致部分 hover 色不跟随 dark mode。烟雾测试覆盖 5 个 token 即可，发现问题再针对性补字面色 fallback。

### B-Conv1 · Conversations 折叠态

**决策**：**窗口宽 < 960px 时包一层"窄列表"自定义 mode**。`Conversations` 本身不原生支持窄折叠，约 30 行小桥接（仅渲图标 + 截断标题，点击切换、新建按钮保留）。

**理由**：

- 当前 SessionListRow 已有类似行为，迁过来成本低
- 不做折叠态则窄窗下视觉拥挤，不可接受

**替代方案**：

- A. 直接砍掉折叠态，留 future —— 拒绝（窄窗用户体验回归）
- B. 用 antd `Layout.Sider collapsible` 包 Conversations —— Sider 的 collapsed 模式与 Conversations 内部 group 渲染冲突，反而更复杂

## Risks / Trade-offs

- **XMarkdown 流式 markdown 边界行为不明** → block 4 加 streaming markdown 烟雾测试（未闭合 fenced code、半行 table、未闭合 `**`）；如发现严重抖动则在 reducer 节流加大或在 contentRender 加防抖
- **antd token 派生色不跟 CSS 变量切换** → 暗色模式手测；如发现问题则在 `index.css` 同时维护 `--color-*-hover` 字面 fallback 给 token 用
- **每个 token 触发 React diff 性能** → B-S5 16ms 合批默认开；预案：消息长度 > 2k 时合批窗口加大到 32ms
- **acceptance 测试选择器变化** → 用 ARIA role + i18n name 而非 antd className（X / antd 内部 class 不稳定）；保留断言行为而非 DOM 结构
- **接受度测试 `mkSlot` 含旧 `streamingBuffer` / `flushedLength` 字段** → 修订 `mkSlot` 删字段、加 `status` 字段；保持测试 case 逻辑不变
- **`@ant-design/x` v2 API 演进** → 锁版本（`^2.7.0`）；升版本前跑完整 chat acceptance 抓回归
- **`react-markdown` / `remark-gfm` 在 chat 外是否有其他 import** → 实施时 grep 确认；如其他页面用 react-markdown，则保留 package 仅 chat 范围内不再 import

## Migration Plan

按 PRD §10 拆 7 个 block，每块完成后整套 chat 测试应通过：

1. **基础设施**：装包（`antd` / `@ant-design/x-markdown` / `@ant-design/icons` / `dayjs`）；`src/lib/theme.ts`；`App.tsx` 用 `XProvider` 包根；其他页面冒烟（不影响）；antd locale 桥（B-Th1）
2. **派生层与 roles**：写 `bubbleSelectors.ts`、`chatRoles.tsx`、`ExternalLinkAnchor.tsx`；单测（B-T1 + B-M1 局部）
3. **Conversations + Sender**：替换 `SessionList*` → `Conversations`；替换 `ChatInput` + `AttachmentChips` → `Sender` + `Sender.Header { Attachments }`；旧组件暂保留侧路；折叠态桥（B-Conv1）
4. **Bubble.List + ThoughtChain**：替换 `MessageList`/`UserBubble`/`AssistantMarkdown` → Bubble.List；XMarkdown 烟雾测试；assistant `contentRender` 复合 ThoughtChain + XMarkdown
5. **审批 inline + Drawer**：替换 `ApprovalPanel`；右栏取消改两栏；新增 `ApprovalInlineActions.tsx` + `ApprovalDrawer.tsx`（B-A3）
6. **Store 瘦身**：删 `streamingBuffer` / `flushedLength` / `useStreamingText`；token reducer 改为懒创建 + 16ms 合批（B-S3 + B-S4 + B-S5）
7. **清理**：删旧 chat 组件、清理 chat 域 radix dialog/dropdown 引用、删旧测试；改写 acceptance 测试选择器；跑完整测试

**回滚策略**：每 block 在 chat acceptance 通过的前提下 ship。若 block 6 (store 改造) 触发 acceptance 回归，回退至 block 5（Bubble.List 已就位，store 仍保留旧 streamingBuffer 字段，token 走旧逻辑）。

## Open Questions

1. **Welcome 4 prompt 卡片文案** —— 复用现有 i18n key (`chat.empty.*`) 还是新增？实施时确认 i18n 团队（如有）的命名约定；倾向新增 `chat.welcome.*` 命名空间，避免与旧文案语义冲突
2. **DeleteSessionDialog → antd 写法** —— 命令式 `Modal.confirm()` 还是组件式 `<Modal>`？倾向命令式（LOC 更少），实施时确认与现有快捷键集成（Esc 关）是否一致
3. **Avatar source** —— Bubble 的 user / assistant avatar 用 `<Avatar icon={<UserOutlined />}>` 还是 ProfileFooter 的 profile 头像？倾向前者（与具体 profile 解耦，profile 信息留在底栏）
4. **`@ant-design/x-markdown` 对 dark mode 主题切换** —— 是否需要单独传 theme prop？文档查 + 实施时验证
5. **acceptance 测试 IPC mock 中 `mkSlot` 的字段迁移** —— 删 `streamingBuffer` / `flushedLength` 之后是否需要保留兼容字段以防其他测试引用？实施时 grep 确认引用面

以上 5 项不阻塞 propose / apply，留待实施阶段 in-block 决策。
