## ADDED Requirements

### Requirement: loop 主函数
`electron/agent/loop.ts` SHALL 暴露 `runAgent({ sessionId, userText, streamWriter, cancel }) → Promise<void>`：
1. 读 session 历史 message；若 session 为空则写入 system prompt
2. append 用户消息到 session_messages + stream emit
3. 进入步骤循环（上限 8 步）：
   - 调 `llmClient.chatWithTools` 得到 `{ text, toolCalls, finishReason, usage }`
   - `finishReason === 'stop'` → append assistant message → emit done → return
   - `finishReason === 'tool_calls'` → 处理首个 tool call（见下）
4. 步数超限 → emit `{type:'error', error:'E_STEP_LIMIT'}`

#### Scenario: 无工具直接回答
- **WHEN** LLM 返回 finishReason='stop'、text 非空、toolCalls 空
- **THEN** 消息 append；stream 发 `done` 事件；循环结束

#### Scenario: 一步工具 + 最终回答
- **WHEN** 第 1 步 LLM 返回一个 search_files 工具调用；第 2 步返回 text
- **THEN** 共 2 次 LLM 调用；最终 stop；对话历史含 user / assistant / tool / assistant

#### Scenario: 达到步数上限
- **WHEN** 连续 8 步都 finishReason='tool_calls'
- **THEN** 第 9 步前循环退出；stream emit `{type:'error', error:'E_STEP_LIMIT'}`

### Requirement: 单工具 per step
每个 LLM 返回的 toolCalls 数组中 loop SHALL 只执行**第一个**（忽略其余）。忽略时 MUST 在 emit `step.warning` 告知 UI；同时把忽略的 call id 在 assistant 消息里保留（供 LLM 重试认知）。

#### Scenario: 多工具降级
- **WHEN** 一次返回 3 个 toolCalls
- **THEN** 执行第 1 个；emit warning；其余被丢弃

### Requirement: tool 执行与结果塞回
非副作用 tool SHALL 直接执行；副作用 tool SHALL 走 agent-approval 门。工具 execute 的返回 MUST `JSON.stringify(result).slice(0, 8000)` 后作为 `role:'tool', toolCallId: <tc.id>, content` append 到 messages，并 emit `tool.result`。

#### Scenario: 非副作用直接执行
- **WHEN** LLM 调 search_files
- **THEN** 直接 execute；结果塞回；继续下一 step

#### Scenario: 副作用经 approval
- **WHEN** LLM 调 update_frontmatter
- **THEN** loop 暂停 → emit `tool.approval-needed` → 等待 approval resolve → 用 approved.args 执行

### Requirement: 错误不中断 loop
工具 execute 抛异常或返回 `{ok:false, error}` SHALL 不抛出整个 loop，而是把错误序列化成 tool message 塞回，继续下一步；LLM 可据此恢复或放弃。

#### Scenario: 工具返回 E_NOT_FOUND
- **WHEN** read_file 调用的 path 不存在
- **THEN** tool 返回 `{ok:false, error:'E_NOT_FOUND'}`；此 JSON 被 stringify 进 tool message；loop 继续；LLM 下一步可能选择别的路径

#### Scenario: execute 抛未捕获异常
- **WHEN** tool.execute 抛 `TypeError('...')`
- **THEN** loop 捕获；塞入 `{ok:false, error:'EXECUTE_THREW', message}`；下一步 LLM 可接收此信息

### Requirement: cancel 语义
`cancel: AbortSignal` MUST 贯穿整个 loop：
- LLM 调用使用 signal
- 工具 execute 接收 ctx.cancel
- 当 abort 触发时 loop SHALL emit `{type:'canceled'}` 并立即返回；未完成的 message 仍保留已入库部分

#### Scenario: 中途取消
- **WHEN** loop 在第 3 step 的 LLM 流式输出中收到 cancel
- **THEN** emit `canceled`；assistant 消息仅保留已写入部分；下次 sendUserMessage 开新一轮

### Requirement: 事件协议
loop SHALL 通过 `streamWriter.emit(event)` 按发生时序发送以下事件类型（按需出现，未发生的类型 MUST 省略）：
- `step.start { step }`
- `token { text }`（流式文本片段）
- `tool.start { tool, args }`
- `tool.approval-needed { callId, tool, args }`
- `tool.result { tool, result }`
- `message.appended { message }`
- `step.warning { reason, detail? }`
- `usage { promptTokens, completionTokens, model }`
- `canceled`
- `done`
- `error { error }`

事件 MUST 按发生时序发送；renderer 按事件更新 UI。

#### Scenario: 事件顺序
- **WHEN** 一步非工具回答
- **THEN** 事件顺序为 `step.start` → 多个 `token` → `message.appended` → `usage` → `done`
