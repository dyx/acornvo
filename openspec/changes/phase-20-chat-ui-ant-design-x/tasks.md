## 0. 前置依赖确认（开工前阻塞 gate）

- [x] 0.1 确认 phase-19 已 archive 且主线已合 K1 callId 扩展（`tool.start.callId?` / `tool.result.callId?` 字段在 `shared/agent-types.ts` 中存在）
- [x] 0.2 确认 phase-19 stream-translator 已把 LangGraph `tool_call_id` 透传到 `tool.start.callId` / `tool.result.callId`（读 `electron/agent/stream-translator.ts` 验证）
- [x] 0.3 grep 全局确认 `chat` 范围外是否仍用 `react-markdown` / `remark-gfm` / `@radix-ui/react-dialog` / `@radix-ui/react-dropdown-menu`；列出 chat 域内可清理引用 vs 保留 package 的判断

## 1. 基础设施（block 1）

- [x] 1.1 package.json 添加 `antd`、`@ant-design/x-markdown`、`@ant-design/icons`、`dayjs`；锁版本
- [x] 1.2 `npm install` 并验证 Electron 打包不破（`npm run dev` 启动正常、`npm run build:unpack` 通过）
- [x] 1.3 新建 `src/lib/theme.ts`：导出 `themeTokens` 对象（含 `colorBgContainer` / `colorBgLayout` / `colorBorder` / `colorText` / `colorTextSecondary` / `fontFamily` / `borderRadius`，按 design.md §B-Th1 表）
- [x] 1.4 修改 `src/App.tsx`：顶层用 `XProvider` 包根；传入 `theme: { token: themeTokens, components: { Bubble: {...}, Sender: {...} } }` 与 `locale={antdLocale}`
- [x] 1.5 实现 antd locale 桥：以 `i18n.language` 起头 `zh*` 切 `zhCN` 否则 `enUS`；通过 useTranslation 或订阅 `i18n.on('languageChanged')` 触发 XProvider re-render
- [x] 1.6 写 `src/lib/theme.test.ts`：烟雾测试 5 个 token 映射（CSS 变量字符串透传 + borderRadius/fontFamily 字面值）
- [x] 1.7 非 chat 页冒烟：Library / Browse / Editor 视觉无变化（手测 + 跑既有 e2e 套件）
- [x] 1.8 暗色模式手测：切换 dark mode，chat 页 antd 组件背景与文字色跟随 CSS 变量；记录派生 hover 色不跟随的已知 trade-off

## 2. 派生层与 roles（block 2）

- [x] 2.1 新建 `src/components/chat/bubbleSelectors.ts`：实现 `deriveBubbleItems(messages, pendingApprovals): BubbleItem[]`；按 `toolCallId === toolCalls[i].id` 折叠 tool 消息进 toolSteps；fallback 按位置匹配；纯函数无副作用
- [x] 2.2 写 `src/components/chat/bubbleSelectors.test.ts`：覆盖 chat-derive-bubble 规格的 11 个 scenario（纯文本 user / assistant、单工具按 callId 折叠、并行工具折叠、工具结果未到达、单待审、多待审独立、流式有 token、流式开始无 token、完成态）
- [x] 2.3 新建 `src/components/chat/chatRoles.tsx`：顶层 stable 导出 `chatRoles: BubbleListProps['role']`；user/assistant placement 与 avatar；assistant `contentRender` 复合 ThoughtChain + XMarkdown + 条件 `ApprovalInlineActions`；footer 渲 `Actions`
- [x] 2.4 新建 `src/components/chat/ExternalLinkAnchor.tsx`：XMarkdown 的 `a` 标签 override；onClick 阻止默认 + 调 `ipc.file.openExternal(url)`
- [x] 2.5 写 `src/components/chat/chatRoles.test.tsx`：role.contentRender 快照测试三种情形（user 简单、assistant 含 toolCalls、assistant 含 pendingApproval）
- [x] 2.6 写 `src/components/chat/ExternalLinkAnchor.test.tsx`：click 触发 `ipc.file.openExternal` 调用断言；阻止默认行为断言

## 3. Conversations + Sender（block 3）

- [x] 3.1 新建 `src/components/chat/ConversationsAdapter.tsx`：用 antd-x `Conversations` 渲染 store sessions；activeKey/onActiveChange 与 `chat.selectSession` 双向绑；`groupable=true`；`creation` 入口调 `chat.createSession`
- [x] 3.2 写 `src/lib/date-utils.ts` 中 `groupSession(updatedAt: number): 'today' | 'thisWeek' | 'earlier'` helper + 单测
- [x] 3.3 在 ConversationsAdapter 内实现菜单：rename 内联编辑 antd `Input`（Enter 提交调 `chat.renameSession` / Esc 取消）；delete 弹 `Modal.confirm` 调 `chat.deleteSession`
- [x] 3.4 实现折叠态桥：窗口宽 <960px 时切窄列表 mode（图标 + 截断标题 ≤8 字符）；用 `useMediaQuery` 或 ResizeObserver 检测；新建按钮仍可见
- [x] 3.5 实现后台 session 待审红点：state 从 store derive（`bySession[sid].pendingApprovals.length > 0 && sid !== activeSessionId`）；用 antd `Badge` dot 渲染
- [x] 3.6 写 `src/components/chat/ConversationsAdapter.test.tsx`：覆盖 chat-session-list 规格的 12 个 scenario
- [x] 3.7 新建 `src/components/chat/ChatInputArea.tsx`：用 antd-x `Sender`；`onSubmit` 调 `chat.sendUserMessage`；`onCancel` 调 `chat.cancelStream`；`loading` 绑 `status==='streaming'`；订阅 `focusInputBump` 触发 focus
- [x] 3.8 实现 ChatInputArea 中 prefix paperclip 按钮：触发 Attachments select；新建 `src/components/chat/AttachmentsAdapter.tsx` 嵌入 `Sender.Header`（pendingAttachments 非空时显示）
- [x] 3.9 ChatInputArea 中处理 Esc 取消快捷键（onKeyDown 透传 + 调 `chat.cancelStream`）
- [x] 3.10 写 `src/components/chat/ChatInputArea.test.tsx`：覆盖 chat-input 规格 8 个 scenario
- [x] 3.11 写 `src/components/chat/AttachmentsAdapter.test.tsx`：覆盖 chat-attachments 规格 5 个 scenario

## 4. Bubble.List + ThoughtChain（block 4）

- [x] 4.1 新建 `src/components/chat/BubbleListAdapter.tsx`：消费 bubbleSelectors 输出 + `useMemo` 包派生结果；用 chatRoles 渲 Bubble.List；启用 `autoScroll`
- [x] 4.2 在 chatRoles.assistant.contentRender 内完善 ThoughtChain：把 `BubbleItem.content.toolSteps` 转 ThoughtChain items（step icon / name / args 可折叠 / result 可折叠 / loading 态 / 待审 inline Actions）
- [x] 4.3 在 chatRoles.assistant.contentRender 内集成 `XMarkdown` 渲 `content.text`；通过 `components={{ a: ExternalLinkAnchor }}` 重写外链
- [x] 4.4 实现 "新消息 ↓" 浮动按钮：如 X 内置 autoScroll 不达 80px 阈值则用 wrapper 检测滚动位置；smooth scroll 跳回 + 恢复 autoScroll
- [x] 4.5 实现 chatRoles.assistant.footer 的 Actions：`Actions.Copy` + 自定义 Retry（最后一条失败 assistant）+ 自定义 Quote
- [x] 4.6 写 `src/components/chat/streaming-markdown.smoke.test.tsx`：XMarkdown streaming 烟雾测试（未闭合 fenced code、半行 table、未闭合 `**`）；断言不抛错且最终态正确
- [x] 4.7 写 `src/components/chat/BubbleListAdapter.test.tsx`：覆盖 chat-message-list 规格 scenario（user 渲染、assistant 含 toolCalls、tool 折叠、流式不掉帧、done 切完成态、markdown 基本元素、外链打开、自动滚动 3 case、复制、失败重试）

## 5. 审批 inline + Drawer（block 5）

- [x] 5.1 新建 `src/components/chat/ApprovalInlineActions.tsx`：antd-x `Actions` 渲 Approve / Reject / Edit 三按钮；Approve / Reject 直接调 store；Edit 设 drawerOpen=true 并渲 ApprovalDrawer
- [x] 5.2 新建 `src/components/chat/ApprovalDrawer.tsx`：antd `Drawer` width=520；标题 + 待审 `Tag`；Reason 区；条件渲 `FrontmatterDiff`（update_frontmatter）或 `JsonArgsEditor`（其他）；Footer 含取消 + 确认并同意
- [x] 5.3 ApprovalDrawer.onSubmit 调 `chat.approveTool(sessionId, callId, editedArgs)`；JSON 解析失败时 antd `message.error` 不关 Drawer
- [x] 5.4 在 chatRoles.assistant.contentRender 中：当 toolStep 含 pendingApproval 时渲 `ApprovalInlineActions`（已在 task 4.2 通过 ThoughtChain step 内嵌）
- [x] 5.5 重写 `src/pages/Chat.tsx`：两栏布局（左 ConversationsAdapter，右 Flex { BubbleListAdapter + ChatInputArea + ProfileFooter }）；删除右栏 ApprovalPanel 引用；空态渲 `Welcome` + `Prompts`
- [x] 5.6 写 `src/components/chat/ApprovalInlineActions.test.tsx`：覆盖 chat-approval-panel 规格 inline 部分 scenario（收到 approval 渲染 inline、非当前 session 不渲、处理后消失、单消息多并行待审、多消息各自待审、超时取消）
- [x] 5.7 写 `src/components/chat/ApprovalDrawer.test.tsx`：覆盖 Drawer 部分 scenario（update_frontmatter diff、编辑参数后同意、编辑无效 JSON、关闭 Drawer 不提交）

## 6. Store 瘦身（block 6）

- [ ] 6.1 修改 `src/stores/chat.ts`：删 `SessionState.streamingBuffer` 与 `flushedLength` 字段；从 `emptySession()` 移除；从 `sendUserMessage` reducer 移除
- [ ] 6.2 修改 `ChatMessage` interface：增 `status?: 'pending' | 'streaming' | 'done' | 'error'` 字段；`toChatMessage` 从 DB 加载时 status='done'
- [ ] 6.3 改 `token` reducer：懒创建 streaming assistant（首个 token 时若末位非 streaming assistant 则 push 一条 `{id, role:'assistant', text:event.text, status:'streaming', createdAt}`）；后续 token 追加 text
- [ ] 6.4 改 `message.appended` reducer：assistant 消息若末位已有 streaming assistant 占位则合并（替换 id 为后端 AIMessage.id、补 toolCalls、保留累积 text）；其他角色直接 push
- [ ] 6.5 改 `done` reducer：把最新 assistant 消息 status 改为 'done'；删除 streamingBuffer 落最终消息的旧逻辑
- [ ] 6.6 改 `tool.start` reducer：消费 `event.callId`（phase-19 K1 扩展）；如有则 push tool message 时 toolCallId=event.callId；同时把 callId 写入对应 assistant 消息的 toolCalls[i].id（如尚未写入）
- [ ] 6.7 改 `tool.result` reducer：消费 `event.callId`；如有则 push tool message 时 toolCallId=event.callId
- [ ] 6.8 实现 token 16ms 合批：reducer 用 microtask + setTimeout(16) 合并；提供 `__chatTokenBatching` 全局开关（默认 true，测试可关）
- [ ] 6.9 修改 `src/stores/chat.test.ts`：删 streamingBuffer 用例；新增 status 字段断言、token 懒创建、message.appended 合并、tool.start/result 带 callId、token 合批关闭后的逐 token 断言场景
- [ ] 6.10 删除 `src/hooks/useStreamingText.ts` 与 `src/hooks/useStreamingText.test.ts`
- [ ] 6.11 grep 项目内所有 `useStreamingText` / `streamingBuffer` / `flushedLength` 引用，清零

## 7. 清理（block 7）

- [ ] 7.1 删除旧组件文件：`SessionList.tsx`、`SessionListRow.tsx`、`SessionContextMenu.tsx`、`MessageList.tsx`、`UserBubble.tsx`、`AssistantMarkdown.tsx`、`ToolCallCard.tsx`、`ToolResultCard.tsx`、`ChatInput.tsx`、`AttachmentChips.tsx`、`ApprovalPanel.tsx`、`MessageOps.tsx`、`DeleteSessionDialog.tsx`、`ShortcutsDialog.tsx`、`ChatBanner.tsx`、`SessionStatusBadge.tsx`
- [ ] 7.2 删除旧组件单测：`SessionList.test.tsx`、`MessageList.test.tsx`、`AttachmentChips.test.tsx`、`ApprovalPanel.test.tsx`、`ChatInput.test.tsx`
- [ ] 7.3 把 `ChatBanner` 用法替换为 antd `Alert`（error 事件展示）；保留行为
- [ ] 7.4 把 `SessionStatusBadge` 用法替换为 antd `Badge`
- [ ] 7.5 把 `ShortcutsDialog` 用法替换为 antd `Modal`（组件式或 `Modal.useModal` 命令式，按 design.md Open Question 5 实施期决定）
- [ ] 7.6 grep + 清理 chat 域内 `@radix-ui/react-dialog` / `@radix-ui/react-dropdown-menu` 引用；按 0.3 grep 结果决定是否从 package.json 移除（chat 域外仍用则保留）
- [ ] 7.7 改写 `src/__acceptance__/chat-acceptance.test.tsx`：`mkSlot` 删 streamingBuffer/flushedLength + 加 status；选择器从 `data-testid` 改为 ARIA role + i18n name；流式断言改用 store status 而非 DOM textContent；IPC mock 表面（K1）不动；保留全部业务断言
- [ ] 7.8 验证 `ProfileFooter.test.tsx` 仅微调（antd token 视觉差不影响断言）；保留
- [ ] 7.9 验证 `FrontmatterDiff.test.tsx` 保留无修改
- [ ] 7.10 在 `JsonArgsEditor` 内适配 antd token（输入框边框 / 字体）；功能不变

## 8. 验证（block 7 收尾）

- [ ] 8.1 跑 `npm test -- src/__acceptance__/chat-acceptance.test.tsx` 全绿
- [ ] 8.2 跑 `npm test` 全套，确认非 chat 单测全绿
- [ ] 8.3 跑 `npm run typecheck` 无错误
- [ ] 8.4 跑 `npm run lint` 无错误
- [ ] 8.5 手测 PRD §13 的 15 项行为对等清单（空态 / 普通对话流式 / 长对话滚动 / 工具调用展示 / 待审批 / 编辑 args / cancel / 切换 session / 删除 session / profile 切换 / 附件 / 暗色模式 / 快捷键 / 删除会话确认 / 错误）
- [ ] 8.6 手测附件多文件添加 / 单个移除 / 发送清空全链路
- [ ] 8.7 手测窗口缩放折叠态（≥960 / <960 互切；点击切换在两种模式下均生效）
- [ ] 8.8 检查 bundle size 变化（与 baseline 对比 `npm run build` 后 dist 大小）；如显著增加则评估 antd / antd-x tree-shaking 与 babel-plugin-import 等优化
- [ ] 8.9 跑 `openspec validate phase-20-chat-ui-ant-design-x` 无错误
- [ ] 8.10 暗色模式 + 中英 i18n 全链路冒烟（两遍 §8.5 清单各一次）
