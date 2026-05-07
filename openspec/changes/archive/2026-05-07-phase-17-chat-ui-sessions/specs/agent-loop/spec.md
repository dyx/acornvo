## MODIFIED Requirements

### Requirement: loop 主函数
`electron/agent/loop.ts` SHALL 暴露 `runAgent({ sessionId, userText, attachments?, streamWriter, cancel }) → Promise<void>`：
1. 读 session 历史 message；若 session 为空则写入 system prompt
2. 若 `attachments` 非空 → 为每个 attachment 读取内容（`type='file'` 走 fs.readFile / `type='clip'` 走 clip-store 取 body），超长按每个 20000 字符截断并附 `(已截断)`；多个 attachment 总量再保底 80000 字符；拼成一段 `role:'user'` 的"pre-user message"放入运行时 messages 数组；此 pre-user message **MUST NOT** append 到 `session_messages`
3. append 用户输入 text 到 session_messages + stream emit（不含 attachment body）
4. 进入步骤循环（上限 8 步）：
   - 调 `llmClient.chatWithTools` 得到 `{ text, toolCalls, finishReason, usage }`
   - `finishReason === 'stop'` → append assistant message → emit done → return
   - `finishReason === 'tool_calls'` → 处理首个 tool call（见下）
5. 步数超限 → emit `{type:'error', error:'E_STEP_LIMIT'}`

#### Scenario: 无工具直接回答
- **WHEN** LLM 返回 finishReason='stop'、text 非空、toolCalls 空
- **THEN** 消息 append；stream 发 `done` 事件；循环结束

#### Scenario: 一步工具 + 最终回答
- **WHEN** 第 1 步 LLM 返回一个 search_files 工具调用；第 2 步返回 text
- **THEN** 共 2 次 LLM 调用；最终 stop；对话历史含 user / assistant / tool / assistant

#### Scenario: 达到步数上限
- **WHEN** 连续 8 步都 finishReason='tool_calls'
- **THEN** 第 9 步前循环退出；stream emit `{type:'error', error:'E_STEP_LIMIT'}`

#### Scenario: 带 attachments 调用
- **WHEN** runAgent 被调用时 attachments=[{type:'file', path:'notes/a.md', title:'A'}]
- **THEN** 读取 notes/a.md 内容（最多 20000 字）→ 拼成 pre-user message "以下是我附加的内容供你参考：\n--- notes/a.md\n<body>\n---"；运行时 messages 包含此条；session_messages 仅保存用户实际输入的 text（不含 body）

#### Scenario: attachment 超长截断
- **WHEN** 某 attachment 原文 40000 字符
- **THEN** 拼接时截至 20000 字符并附 `(已截断)` 标记；多个 attachment 总量 > 80000 字时再整体截断并附提示

#### Scenario: attachment 读取失败不中断
- **WHEN** attachment path 不存在或读取抛异常
- **THEN** 对应块替换为 `--- <path>\n[读取失败: <error>]\n---`；loop 继续；用户消息仍正常发送给 LLM
