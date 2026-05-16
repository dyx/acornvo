## Purpose
Spec for agent-approval capability.
## Requirements
### Requirement: approval 门
副作用工具的审批 SHALL 由 LangChain `humanInTheLoopMiddleware` 实现，并以中间件形式注入 `createAgent({ middleware: [hitl] })`：

```ts
const hitl = humanInTheLoopMiddleware({
  interruptOn: {
    update_frontmatter: {
      allowAccept: true,
      allowEdit:   true,
      allowRespond: false,
      allowReject: true,
      description: '修改 frontmatter 需用户确认',
    },
    // 其余 4 个工具默认 false（不审批）
  },
  descriptionPrefix: '工具执行待审批',
});
```

外部 IPC 入口签名保持不变：
- `agent.approve({ sessionId, callId, editedArgs? })` —— 内部转 `agent.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), { configurable: { thread_id: sessionId } })`；`editedArgs` 非空则 `{ type: 'edit', editedAction: { name, args: editedArgs } }`
- `agent.reject({ sessionId, callId, reason? })` —— 转 `{ type: 'reject', message: reason ?? 'user rejected' }`
- `agent.cancel({ sessionId })` —— `AbortController.abort()`；checkpointer 状态保留（见 agent-checkpointer §cancel 后 thread 保留 24h）

`callId` 来源 SHALL 从原 UUID 改为 LangGraph interrupt 自带 id；前端无感知（callId 仅作不透明字符串）。

#### Scenario: HITL 触发 interrupt
- **WHEN** LLM 调 `update_frontmatter`
- **THEN** middleware 在工具执行前触发 interrupt；graph 暂停；stream-translator 收到 `__interrupt__` 翻译为 `tool.approval-needed { callId, tool, args }` 事件

#### Scenario: approve 解决
- **WHEN** 用户 IPC `agent.approve({ sessionId, callId })` 无 editedArgs
- **THEN** runner 调 `agent.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), { configurable: { thread_id: sessionId } })`；graph 续跑；工具用原 args 执行

#### Scenario: approve 改参
- **WHEN** IPC `agent.approve({ sessionId, callId, editedArgs: { path:'b.md', patch:{...}, reason:'...' } })`
- **THEN** runner 调 `agent.invoke(new Command({ resume: { decisions: [{ type: 'edit', editedAction: { name: 'update_frontmatter', args: editedArgs } }] } }), { configurable: { thread_id: sessionId } })`；工具用新 args 执行

#### Scenario: reject
- **WHEN** IPC `agent.reject({ sessionId, callId, reason:'太危险' })`
- **THEN** runner 调 `agent.invoke(new Command({ resume: { decisions: [{ type: 'reject', message: '太危险' }] } }), { configurable: { thread_id: sessionId } })`；graph 续跑；ToolMessage 含拒绝原因塞回；LLM 可改用其他工具或放弃

#### Scenario: 非副作用工具不触发 HITL
- **WHEN** LLM 调 `search_files` / `read_file` / `list_tags` / `clip_summary`
- **THEN** 这些工具不在 `interruptOn` 中；graph 直接执行；不 emit `tool.approval-needed`

### Requirement: 事件广播
HITL middleware 触发 interrupt 时 stream-translator SHALL emit `{type:'tool.approval-needed', callId, tool: name, args}`。UI 据此弹确认。`callId` 取 LangGraph interrupt id。

#### Scenario: UI 收到请求
- **WHEN** runner 到达副作用工具触发 interrupt
- **THEN** 订阅 `chat.stream:<sessionId>` 的 renderer 在 100ms 内收到 approval-needed 事件；payload 含 callId / tool / args

### Requirement: 参数 diff 语义（update_frontmatter）
对 `update_frontmatter` 工具的 approval，UI SHALL 展示 diff：`before = 现有 frontmatter`，`after = merge(before, patch)`。用户可在 UI 中修改 after（等价于 editedArgs.patch 的变更），提交时通过 `agent.approve(..., { editedArgs })` 回传。args 的语义 MUST 保持 `{ path, patch, reason }`，approval 后允许 editedArgs 修改任意字段。

`humanInTheLoopMiddleware` 的 `allowEdit: true` 选项 SHALL 启用以接受 `{ type: 'edit', editedAction: { name, args } }` decision。

#### Scenario: 编辑 patch 后同意
- **WHEN** 原 patch = `{ tags: ['a','b'] }`；用户改 patch 为 `{ tags: ['a'] }` 然后同意
- **THEN** `agent.approve` 被调时 editedArgs = `{ path, patch: { tags: ['a'] }, reason }`；runner 转 `Command({ resume: { decisions: [{ type:'edit', editedAction:{ name:'update_frontmatter', args: editedArgs } }] } })`；execute 使用新 patch

