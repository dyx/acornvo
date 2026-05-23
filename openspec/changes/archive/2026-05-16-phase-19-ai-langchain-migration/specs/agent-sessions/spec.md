## MODIFIED Requirements

### Requirement: CRUD

`agent-sessions` 模块 SHALL 提供（API 完全保持现行签名）：

- `createSession({ title?, profileId? }) → { id }`；默认 title='新对话'；profileId 缺省用 settings.ai.defaultProfileId
- `listSessions({ limit, offset }) → { items, total }`，按 updated_at DESC
- `getSession(id)` / `deleteSession(id)`
- `appendMessage(sessionId, message)`；同时更新 session.updated_at；返回插入行
- `getMessages(sessionId)`：按 id ASC 返回全部
- `updateTitle(id, title)`
- `recordToolCall({ sessionId, messageId, toolName, args, callId? })`：`callId` 可选，新版由 runner 传入 LangGraph interrupt id（替代原 UUID）
- `finishToolCall(callId, { result?, error?, approved? })`：更新 finished_at、result_json/error、approved 字段

新增约束：

- `deleteSession(id)` SHALL 在同一事务中同时删除 `checkpoints` / `checkpoint_writes` / `checkpoint_blobs` 表中 `thread_id = id` 的所有行（见 agent-checkpointer 规格）
- runner 在调用 `appendMessage` / `recordToolCall` 前 SHALL 以 LangGraph 消息 id 幂等去重，避免 HITL resume 后重复 append

#### Scenario: 创建 session

- **WHEN** 调 `createSession()`
- **THEN** 新行插入；返回 id；默认 title='新对话'；profileId=defaultProfileId（可为 null）

#### Scenario: 首条消息自动设置 title

- **WHEN** session title='新对话' 时用户 append 第一条 user message
- **THEN** sessions.title 被自动更新为该 content 的前 40 字（可带省略号）

#### Scenario: 删除 session 级联清理 checkpointer

- **WHEN** 调 `deleteSession('abc')`
- **THEN** sessions / session_messages / tool_calls 中 session_id='abc' 的行被删除，且 checkpoints / checkpoint_writes / checkpoint_blobs 中 thread_id='abc' 的行也被删除；整个删除在同一事务内

#### Scenario: 幂等去重

- **WHEN** runner 收到 stream-translator emit 的 message.appended，但 LangGraph AIMessage.id 已写入过
- **THEN** runner 跳过 `appendMessage` 调用，不重复入库

### Requirement: ai_usage 关联

每次 LLM 调用（agent runner 或 reviewer 内部）MUST 在 `ai_usage` 插入行，`session_id` 字段填当前 sessionId（reviewer 在非 agent 上下文时为 null）。usage 数据来源 SHALL 从手写 provider usage 字段切换为 LangChain `AIMessage.usage_metadata`（`input_tokens` / `output_tokens` / `total_tokens`），由 `electron/ai/usage.ts` 转换为现有 `aiUsage.insert(row)` 行的 `prompt_tokens` / `completion_tokens` 字段。

聚合逻辑与表 schema 不变。

#### Scenario: 一次对话 3 步 LLM

- **WHEN** 一次 sendUserMessage 导致 3 次 LLM 调用（含 tool 反馈循环）
- **THEN** ai_usage 新增 3 行，每行 session_id = 当前 sessionId；usage 来自 LangChain `AIMessage.usage_metadata`
