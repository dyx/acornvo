# agent-loop Specification

## Purpose

Agent 主循环：接收用户消息与附件，驱动 LLM 多步工具调用，流式输出事件。

## Requirements

### Requirement: loop 主函数

`electron/agent/runner.ts` SHALL 暴露 `runAgent({ sessionId, userText, attachments?, streamWriter, cancel }) → Promise<void>`，替代原 `electron/agent/loop.ts`：

1. 读 session 历史 message；首次对话时把 system prompt（`prompts/chat-agent.ts` 导出 string）通过 `createAgent({ systemPrompt })` 传入，**不再** append 到 session_messages
2. append 用户输入 text 到 session_messages + stream emit `message.appended`（不含 attachment body）
3. 若 `attachments` 非空 → 调 `electron/agent/attachments.ts` 的 `collect(attachments)` 生成 pre-user message（同现行截断规则：单条 ≤20000 字，总量 ≤80000 字；超限附 `(已截断)`）；此 pre-user message **MUST NOT** append 到 session_messages
4. 构造 `messages := [pre-user?, ...session_messages_history]`（含刚 append 的 userMsg）
5. 调 `agent.stream({ messages }, { configurable: { thread_id: sessionId, vaultRoot, clipsGet }, streamMode: ['updates', 'messages'], signal: cancel, recursionLimit })`，其中 `agent` 由 `createAgent({ model: buildChatModel(profile), tools, middleware: [hitl], checkpointer })` 构造（单例缓存）
6. 对每个 stream chunk 调 `stream-translator` 翻译为 AgentEvent[]，依次通过 streamWriter emit
7. 在 user-visible 消息事件中调 `sessions.appendMessage / recordToolCall / finishToolCall` 持久化，按 LangGraph `AIMessage.id` **幂等去重**

每轮 SHALL 采用 **Stateless invocation**：显式传完整 messages 数组；MUST NOT 依赖 checkpointer 携带历史。

#### Scenario: 无工具直接回答

- **WHEN** LLM 返回单一 AIMessage 无 tool_calls
- **THEN** stream-translator emit `message.appended`（assistant）+ `usage` + `done`；session_messages 新增一条 assistant 行

#### Scenario: 一步工具 + 最终回答

- **WHEN** 第 1 步 model 节点返回含 1 个 tool_call 的 AIMessage；tools 节点产出 ToolMessage；第 2 步 model 节点产出最终 AIMessage
- **THEN** 事件序列：`message.appended(assistant+toolCalls)` → `tool.start` → `tool.result` → `message.appended(assistant)` → `done`；session_messages 含 user/assistant/tool/assistant 4 行

#### Scenario: 带 attachments 调用

- **WHEN** runAgent 被调用时 attachments=[{type:'file', path:'notes/a.md', title:'A'}]
- **THEN** attachments.collect 读取并截断；pre-user message 注入 messages 数组首位；session_messages 仅保存用户实际输入的 text（不含 body）

#### Scenario: attachment 超长截断

- **WHEN** 某 attachment 原文 40000 字符
- **THEN** 截至 20000 字符并附 `(已截断)`；多个 attachment 总量 > 80000 字时整体截断并附提示

#### Scenario: attachment 读取失败不中断

- **WHEN** attachment path 不存在或读取抛异常
- **THEN** 对应块替换为 `--- <path>\n[读取失败: <error>]\n---`；runner 继续；用户消息仍正常发送给 LLM

#### Scenario: 达到 recursionLimit

- **WHEN** LangGraph 触发 `GraphRecursionError`
- **THEN** runner 捕获并 emit `{ type: 'error', error: 'E_STEP_LIMIT' }`，停止本轮

### Requirement: tool 执行与结果塞回

非副作用 tool SHALL 由 LangGraph tools 节点直接执行；副作用 tool SHALL 走 `humanInTheLoopMiddleware` 中断（见 agent-approval 规格）。工具 execute 的返回值由 LangChain 自动包装为 ToolMessage（`role: 'tool'`），stream-translator 收到后调 `sessions.finishToolCall` 持久化，并 emit `tool.result`。

工具返回内容长度限制（≤8000 字符 stringify）SHALL 在工具 execute 内部实现（迁移自现行 loop 逻辑），保持现有行为。

#### Scenario: 非副作用直接执行

- **WHEN** LLM 调 search_files
- **THEN** tools 节点同步执行；stream-translator emit `tool.result`；ToolMessage 进入 LangGraph state；下一轮 model 节点接收到该 tool 结果

#### Scenario: 副作用经 approval

- **WHEN** LLM 调 update_frontmatter
- **THEN** HITL middleware 触发 interrupt → stream-translator emit `tool.approval-needed` → 等用户决定 → runner 调 `agent.invoke(new Command({ resume }))` 续跑 → 用 approved.args 执行工具

### Requirement: 错误不中断 loop

工具 execute 抛异常或返回 `{ok:false, error}` SHALL 不抛出整个 runner，而是把错误信息作为 ToolMessage（LangChain 默认行为）塞回，graph 继续下一步；LLM 可据此恢复或放弃。runner 仅对 LangGraph 自身抛出的非 AbortError 异常调用 normalize-errors 并 emit `error` 事件。

#### Scenario: 工具返回 E_NOT_FOUND

- **WHEN** read_file 调用的 path 不存在，工具返回 `{ok:false, error:'E_NOT_FOUND'}`
- **THEN** LangChain 包装为 ToolMessage；下一步 model 节点接收到错误信息；LLM 下一步可选其他路径

#### Scenario: execute 抛未捕获异常

- **WHEN** tool.execute 抛 `TypeError('...')`
- **THEN** LangChain 默认捕获并转为 ToolMessage（含错误描述）；graph 继续；runner 不 emit `error`

#### Scenario: graph 自身异常

- **WHEN** LangGraph 抛非 AbortError 异常（如模型返回 401）
- **THEN** runner 捕获 → normalize-errors 映射 → emit `{ type: 'error', error: 'E_AUTH' }`

### Requirement: cancel 语义

`cancel: AbortSignal` MUST 传给 `agent.stream(..., { signal })`：

- LangChain 内部把 signal 传给 fetch / model 调用
- 工具 execute 通过 `config.signal` 接收
- 当 abort 触发时 runner SHALL emit `{type:'canceled'}` 并立即返回；未完成的 message 仍保留已入库部分
- checkpointer 中的 thread 状态 SHALL 保留 24h（见 agent-checkpointer 规格）

#### Scenario: 中途取消

- **WHEN** runner 在 model 节点流式输出中收到 cancel
- **THEN** emit `canceled`；assistant 消息仅保留已写入部分；下次 sendUserMessage 开新一轮

### Requirement: 事件协议

runner SHALL 通过 `streamWriter.emit(event)` 按发生时序发送以下事件类型（按需出现，未发生的类型 MUST 省略）：

- `step.start { step }`
- `token { text }`（流式文本片段）
- `tool.start { tool, args, callId? }`
- `tool.approval-needed { callId, tool, args }`
- `tool.result { tool, result, callId? }`
- `message.appended { message }`
- `usage { promptTokens, completionTokens, model }`
- `canceled`
- `done`
- `error { error }`

事件协议 MUST 保持与现行 IPC 契约完全一致（K1），**除以下两项 additive 例外**：

1. `step.warning` 事件类型保留在协议中以兼容旧 renderer 解析逻辑，但 runner **不再** emit 该事件（见下文「并行工具调用」决策）
2. `tool.start` 与 `tool.result` 事件添加可选字段 `callId?: string`：由 stream-translator 透传 LangGraph 的 `tool_call_id`（`tool.start.callId` = `AIMessage.tool_calls[i].id`；`tool.result.callId` = `ToolMessage.tool_call_id`）。旧前端消费者忽略字段无影响；phase-20 `bubbleSelectors` 据此按 callId 折叠工具调用与结果。`shared/agent-types.ts` 中类型同步扩展。

#### Scenario: 事件顺序

- **WHEN** 一步非工具回答
- **THEN** 事件顺序为 `step.start` → 多个 `token` → `message.appended` → `usage` → `done`

#### Scenario: AgentEvent 契约稳定

- **WHEN** 现有 acceptance 测试 mock streamWriter 检查事件序列
- **THEN** 全套 acceptance 测试通过；事件 payload 字段名与类型均不变
