## 1. 类型与 store

- [ ] 1.1 `shared/agent-types.ts`：新增 `Attachment` 联合类型；扩展 `runAgent` 签名 `attachments?: Attachment[]`
- [ ] 1.2 `src/stores/chat.ts`：per-session 状态（messages / streamingBuffer / flushedLength / pendingApprovals 队列 / pendingAttachments / status）
- [ ] 1.3 store 暴露 actions：loadSessions / selectSession / createSession / renameSession / deleteSession / sendUserMessage / cancelStream / approveTool / rejectTool / updateSessionProfile
- [ ] 1.4 订阅 `window.api.chat.onChatStream(sessionId, cb)` 分发事件到对应 session state

## 2. Chat 页面骨架

- [ ] 2.1 `src/pages/Chat.tsx`：三栏布局 flex 容器；< 960px 自动折叠 SessionList
- [ ] 2.2 顶栏：当前 session title + profile 标签下拉 + 快捷键帮助 `?` icon
- [ ] 2.3 路由 `/chat` 激活 Chat.tsx（phase 1 占位移除）
- [ ] 2.4 空态引导：4 个预置 prompt 卡片（仅空 session 显示）

## 3. SessionList

- [ ] 3.1 `src/components/chat/SessionList.tsx`：顶部 "+" + 搜索框 + 列表
- [ ] 3.2 行渲染：title 单行截断 / 相对时间 / 删除 hover / active 3px 主色竖线
- [ ] 3.3 双击或右键重命名（inline input）；右键菜单重命名 / 删除 / 复制 session id
- [ ] 3.4 删除二次确认对话框
- [ ] 3.5 状态 badge：流式脉动点 / 后台 approval 红点 / 错误黄 icon
- [ ] 3.6 窄屏 48px icon-only 折叠模式

## 4. MessageList

- [ ] 4.1 `src/components/chat/MessageList.tsx`：按 role 分发渲染
- [ ] 4.2 `UserBubble` / `AssistantMarkdown`（react-markdown + remark-gfm）/ `ToolCallCard` / `ToolResultCard` 子组件
- [ ] 4.3 流式 rAF batching：`useStreamingText(sessionId)` hook；DOM 仅 append 文本节点
- [ ] 4.4 done 切换 markdown 渲染（pre → md）
- [ ] 4.5 自动滚动逻辑 + "新消息 ↓" 浮动按钮
- [ ] 4.6 消息操作条：复制 / 重试 / 引用
- [ ] 4.7 外链拦截：react-markdown `a` 组件 onClick 调 `shell.openExternal`

## 5. ChatInput

- [ ] 5.1 `src/components/chat/ChatInput.tsx`：textarea auto-grow 到 240px
- [ ] 5.2 键位：Enter 换行 / Cmd+Enter 发送 / Esc 取消流式
- [ ] 5.3 发送按钮状态（主色 / disabled / 停止）
- [ ] 5.4 底部 profile 标签 + "未配置" fallback
- [ ] 5.5 `@` 触发 QuickSwitcher（复用 phase 8）→ 选中插入 chip token + push attachment
- [ ] 5.6 attachments chips 列表紧贴 input 上方；X 移除

## 6. ApprovalPanel

- [ ] 6.1 `src/components/chat/ApprovalPanel.tsx`：右栏 320px 抽屉，transition 200ms
- [ ] 6.2 标题 / reason / 参数区 / 动作栏结构
- [ ] 6.3 update_frontmatter 两栏 before / after YAML diff（变更行着色）
- [ ] 6.4 其他工具 JSON `<pre>` + "编辑参数" 切换 textarea
- [ ] 6.5 同意 / 取消按钮 → 调 approveTool / rejectTool；编辑后的 JSON 作为 editedArgs
- [ ] 6.6 多条队列 + "还有 N 条待审"
- [ ] 6.7 E_APPROVAL_TIMEOUT 显示"已超时取消" 2 秒后移除

## 7. Agent-loop 扩展

- [ ] 7.1 `electron/agent/loop.ts`：`runAgent` 签名新增 `attachments?: Attachment[]`
- [ ] 7.2 实现 `collectAttachmentContext(attachments)`：file 走 fs.readFile（safeResolve 在 project root 内）/ clip 走 clip-store
- [ ] 7.3 每 attachment 20000 字截断；总量 80000 字再保底；拼成 pre-user message 插入 messages 数组但**不** append 到 session_messages
- [ ] 7.4 读取失败替换为 `[读取失败: <error>]` 块；不中断 loop
- [ ] 7.5 `electron/ipc/chat.ts` 的 `sendUserMessage` handler 透传 attachments 到 runAgent

## 8. 停止与错误 UI

- [ ] 8.1 Chat 顶栏 banner：E_MISSING_PROFILE → "请先在设置中配置 AI profile" + 链接 /settings/ai
- [ ] 8.2 E_BUSY toast "当前会话已在生成，请稍候"
- [ ] 8.3 E_STEP_LIMIT 对话末尾灰色消息"助手达到步骤上限，已停止"
- [ ] 8.4 E_NETWORK / E_SERVER 尾部灰消息 + "重试" 按钮（重发上一条 user message）

## 9. 键盘与可达性

- [ ] 9.1 `Cmd/Ctrl+N` 新建 session
- [ ] 9.2 `Cmd/Ctrl+K` 聚焦输入框并清空
- [ ] 9.3 `Cmd/Ctrl+/` 显示快捷键帮助弹窗
- [ ] 9.4 SessionList ↑↓ 切换 / Enter 激活 / Delete 删除（二次确认）

## 10. i18n

- [ ] 10.1 新增 `chat.*` keys：newSession / untitled / input.placeholder / send / stop / attach.file / attach.remove / approval.* / error.* / toolCall.folded / toolResult.folded / session.rename / session.delete / session.confirmDelete
- [ ] 10.2 中英文对照（zh-CN 必需，en 同步）

## 11. 验收

- [ ] 11.1 打开 /chat 无 session → 自动新建；空态引导 4 卡片可见
- [ ] 11.2 点 AppRail "松语" → 导航到 /chat；active 态正确
- [ ] 11.3 发送 "你好" → 流式出现 token；rAF 批处理；帧率稳定 ≥ 50fps
- [ ] 11.4 流式期间按 Esc → loop 中止；灰消息 "已停止"；已写入部分保留
- [ ] 11.5 发送 "@" → QuickSwitcher 弹出；选中 a.md → input 出现 @file:A chip；发送后 agent 可直接回答文件内容问题
- [ ] 11.6 发送 "把 a.md 的 rating 改成 5" → assistant 调 update_frontmatter → 右侧 ApprovalPanel 滑入；before/after diff 可见；点同意 → 执行；显示 tool.result 折叠卡片
- [ ] 11.7 连续触发 3 个 approval 需求 → 队列显示 "还有 N 条待审"；逐条处理
- [ ] 11.8 未配置 profile 时 Chat 顶栏显示 E_MISSING_PROFILE banner 与跳转链接
- [ ] 11.9 同 session 再次发送时有流式 → toast E_BUSY
- [ ] 11.10 切到其他 session 时 A session 后台继续流式 → A 行脉动点；完成后消失
- [ ] 11.11 SessionList 搜索 "笔记" → 过滤；右键重命名 / 删除生效
- [ ] 11.12 刷新应用 → sessions / messages 持久；未完成的 assistant 不被重建
- [ ] 11.13 attachment 正文 40000 字符 → pre-user message 截断为 20000 + "(已截断)"
- [ ] 11.14 attachment 路径不存在 → 对应块替换为读取失败提示；loop 正常完成
- [ ] 11.15 assistant markdown（列表、代码块、表格）正确渲染；流式期间以 pre-wrap 显示，done 后切 md
- [ ] 11.16 点击 assistant 消息里的链接 → shell.openExternal 打开；不在应用内新开窗口
- [ ] 11.17 顶栏切换 profile → session.profile_id 更新；下次 send 使用新 profile 与模型
- [ ] 11.18 `openspec validate phase-17-chat-ui-sessions --strict` 通过
