## ADDED Requirements

### Requirement: chat IPC 命名空间
`shared/ipc-contract.ts` SHALL 声明 `chat`：
- `sessions.list({ limit, offset }) → { items, total }`
- `sessions.create({ title?, profileId? }) → { id }`
- `sessions.delete(id) → { ok }`
- `sessions.rename(id, title) → { ok }`
- `sessions.getMessages(id) → { messages: SessionMessage[] }`
- `subscribeStream(sessionId)` / `unsubscribeStream(sessionId)`：renderer 登记订阅
- `sendUserMessage({ sessionId, text }) → { ok } | { error: 'E_BUSY' | 'E_MISSING_PROFILE' }`
- `cancelStream(sessionId) → { ok }`
- `approveTool(callId, { editedArgs? }) → { ok } | { error: 'E_CALL_NOT_FOUND' }`
- `rejectTool(callId, { reason? }) → { ok } | { error }`

#### Scenario: 创建 session
- **WHEN** renderer 调 `chat.sessions.create()`
- **THEN** 返回 `{ id }`；sessions 表新增一行

#### Scenario: 发送消息
- **WHEN** 调 `chat.sendUserMessage({ sessionId, text: 'hi' })`
- **THEN** main 启动 agent loop；返回 `{ ok:true }`；若已有 loop 在跑 → `{ error:'E_BUSY' }`

#### Scenario: 取消
- **WHEN** 调 `chat.cancelStream(sid)`
- **THEN** loop 的 AbortController abort；stream 最终 emit `canceled`

### Requirement: stream 事件通道
main 在 agent loop 中 SHALL 通过 `webContents.send('chat.stream', { sessionId, event })` 把事件推送到所有已 subscribeStream(sessionId) 的 renderer。renderer 通过 preload 暴露的 `onChatStream(sessionId, listener)` 订阅。

事件类型遵循 agent-loop 规格定义。

#### Scenario: 订阅接收
- **WHEN** renderer A 订阅 sid=1，renderer B 未订阅；main 发 event
- **THEN** A 收到事件；B 不收

#### Scenario: 多 renderer 共享
- **WHEN** 同一 sid 被两个 renderer（主窗 + devtool windows）订阅
- **THEN** 两者都收到

### Requirement: 并发保护
同一 sessionId 同时只允许一个活跃 loop；`sendUserMessage` 在检测到现有 loop 时 SHALL 返回 `{ error: 'E_BUSY' }`。最多 4 个全局并发 loop；超过 → `{ error: 'E_GLOBAL_BUSY' }`。

#### Scenario: 同 session 并发
- **WHEN** session A 正在跑 loop；renderer 再 sendUserMessage(A)
- **THEN** 返回 `E_BUSY`

#### Scenario: 全局上限
- **WHEN** 已有 4 个不同 session 的 loop 在跑，发起第 5 个
- **THEN** 返回 `E_GLOBAL_BUSY`

### Requirement: approval IPC 契约
`chat.approveTool` SHALL 仅接受 pending 的 callId：
- callId 不存在或已解决 → `{ error: 'E_CALL_NOT_FOUND' }`
- sessionId 已被 cancelStream → 约 callId 视为失效 → `{ error: 'E_CANCELED' }`
- editedArgs 若非空 MUST 先经 tool.parameters 的 Ajv validate；失败 → `{ error: 'E_INVALID_ARGS', details }`

`chat.rejectTool` 与 approveTool 对称。

#### Scenario: editedArgs 校验
- **WHEN** editedArgs 缺 required 字段
- **THEN** 返回 E_INVALID_ARGS；pending 仍保留；UI 仍可重提

#### Scenario: 过期 callId
- **WHEN** callId 对应的 await 已被超时 reject
- **THEN** approveTool 返回 E_CALL_NOT_FOUND
