## ADDED Requirements

### Requirement: approval 门
`electron/agent/approval.ts` SHALL 暴露：
- `register(sessionId, toolCall): string`（返回 callId=UUID；记录到内存 Map）
- `await(callId): Promise<{ ok: true, args } | { ok: false, error }>`（调用方等待用户决定）
- `approve(callId, { editedArgs? })` / `reject(callId, reason?)`：IPC handler 调用

sideEffect=true 的工具执行前 MUST 经此门；非 sideEffect 工具 MUST NOT 调。

#### Scenario: 注册 pending
- **WHEN** loop 调 `approval.register(sid, tc)`
- **THEN** 返回 UUID；Map 中有对应条目 `{ resolve, toolCall, sessionId, createdAt }`

#### Scenario: approve 解决
- **WHEN** 用户 IPC `chat.approveTool(callId)` 无 editedArgs
- **THEN** `approval.await` 解决为 `{ ok: true, args: <原 toolCall.args> }`

#### Scenario: approve 改参
- **WHEN** IPC `approveTool(callId, { editedArgs: { path:'b.md', patch:{...} } })`
- **THEN** await 解决为 `{ ok: true, args: <editedArgs> }`；execute 使用新 args

#### Scenario: reject
- **WHEN** IPC `chat.rejectTool(callId, { reason:'太危险' })`
- **THEN** await 解决为 `{ ok: false, error: 'E_USER_REJECTED', reason:'太危险' }`；loop 把它塞回 LLM 作为 tool 错误

### Requirement: 超时自动拒绝
pending 超过 30 分钟 SHALL 自动 reject（error='E_APPROVAL_TIMEOUT'）。主进程退出时所有 pending MUST 被 reject（或视为 loop 自然 abort，已由 cancel 处理）。

#### Scenario: 30min 后超时
- **WHEN** 用户一直不操作，30 分钟过去
- **THEN** await 解决为 `{ ok:false, error:'E_APPROVAL_TIMEOUT' }`

### Requirement: 事件广播
`register` 时 SHALL 触发 loop 的 `streamWriter.emit({type:'tool.approval-needed', callId, tool: toolCall.name, args: toolCall.args})`。UI 据此弹确认。

#### Scenario: UI 收到请求
- **WHEN** loop 到达副作用工具
- **THEN** 订阅 `chat.stream:<sessionId>` 的 renderer 在 100ms 内收到 approval-needed 事件；payload 含 callId / tool / args

### Requirement: 参数 diff 语义（update_frontmatter）
对 `update_frontmatter` 工具的 approval，UI SHALL 展示 diff：`before = 现有 frontmatter`，`after = merge(before, patch)`。用户可在 UI 中修改 after（等价于 editedArgs.patch 的变更），提交时把修改后的 patch 回传。本规格不规定 UI（phase 17），但 args 的语义 MUST 保持 `{ path, patch, reason }`，approval 后允许 editedArgs.patch 修改。

#### Scenario: 编辑 patch 后同意
- **WHEN** 原 patch = `{ tags: ['a','b'] }`；用户在 UI 改成 `{ tags: ['a'] }` 然后同意
- **THEN** approve 被调时 editedArgs = `{ path, patch: { tags: ['a'] }, reason }`；execute 使用新 patch
