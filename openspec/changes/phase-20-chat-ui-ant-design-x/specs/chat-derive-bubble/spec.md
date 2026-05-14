## ADDED Requirements

### Requirement: bubbleSelectors 派生函数
`src/components/chat/bubbleSelectors.ts` SHALL 导出函数 `deriveBubbleItems(messages: ChatMessage[], pendingApprovals: PendingApproval[]): BubbleItem[]`。类型契约：

```ts
type BubbleItem = {
  key: string;
  role: 'user' | 'assistant';
  content: string | { text: string; toolSteps: ToolStep[] };
  streaming?: boolean;
  loading?: boolean;
};

type ToolStep = {
  call: { id: string; name: string; args: unknown };
  result?: { ok: true; data: unknown } | { ok: false; error: string };
  pendingApproval?: PendingApproval;
};
```

selector MUST 是**纯函数**且无副作用；引用稳定性由调用方（chat page）用 `useMemo` 包裹保证。

#### Scenario: 纯文本 user 消息
- **WHEN** messages 包含 `{ id: 'm1', role: 'user', text: 'hi', status: 'done' }`
- **THEN** 输出 item `{ key: 'm1', role: 'user', content: 'hi' }`

#### Scenario: 纯文本 assistant 消息
- **WHEN** messages 包含 `{ id: 'm2', role: 'assistant', text: 'hello', status: 'done' }`
- **THEN** 输出 item `{ key: 'm2', role: 'assistant', content: 'hello', streaming: false, loading: false }`

### Requirement: tool 消息按 callId 折叠
当 assistant 消息含 `toolCalls: [{ id, name, args }, ...]` 时，selector SHALL 把后续 `role: 'tool'` 消息按 `toolCallId === call.id` 折叠为 ThoughtChain 的 toolSteps 数组；折叠后的 tool 消息**不产生独立 BubbleItem**。

phase-19 K1 已扩 `tool.start.callId?` / `tool.result.callId?`；store reducer 收到这两个事件时 MUST 把 callId 写入 ChatMessage.toolCallId（tool 消息）或合并进 assistant 消息的 toolCalls（assistant 消息）。selector 据此完成折叠。

如果 toolCallId 字段缺失（IPC 老协议下落或测试 mock 不完整），selector SHALL 按位置匹配作 fallback（首个未匹配的 tool 消息归到首个未配 result 的 toolCall），但单测 MUST 覆盖优先用 callId 匹配的情形。

#### Scenario: 单工具按 callId 折叠
- **WHEN** messages = `[user, assistant(toolCalls=[{id:'A',...}]), tool(toolCallId='A', result={ok:true, data:...})]`
- **THEN** 输出 = `[user item, assistant item with toolSteps=[{ call:{id:'A',...}, result:{ok:true,...} }]]`；tool 不独立出 item

#### Scenario: 并行工具折叠
- **WHEN** messages = `[user, assistant(toolCalls=[{id:'A'},{id:'B'}]), tool(toolCallId='A'), tool(toolCallId='B')]`
- **THEN** assistant item 的 toolSteps 含两步：`[{ call: A, result: ... }, { call: B, result: ... }]`；顺序按 toolCalls 数组顺序（NOT tool 消息到达顺序）

#### Scenario: 工具结果未到达
- **WHEN** assistant 含 toolCalls=[{id:'A'}] 但后续 tool 消息尚未到达
- **THEN** toolSteps=[{ call: A, result: undefined }]；UI 该 step 显示 loading 态

### Requirement: 待审批合并到 toolStep
当 `pendingApprovals` 中有 `p.callId === toolCalls[i].id` 时，对应 ToolStep SHALL 含 `pendingApproval: p` 字段；UI（ThoughtChain step）据此渲染 inline `ApprovalInlineActions`。

#### Scenario: 单待审
- **WHEN** assistant 含 toolCalls=[{id:'A'}]，pendingApprovals=[{ callId:'A', toolName:..., args:..., reason:..., receivedAt:... }]
- **THEN** toolSteps=[{ call: A, pendingApproval: {...} }]；该 step UI 显示 Approve / Reject / Edit

#### Scenario: 多待审独立
- **WHEN** assistant 含 toolCalls=[{id:'A'},{id:'B'}]，两个均待审
- **THEN** 两个 toolSteps 各自含 pendingApproval；用户可独立 approve / reject

### Requirement: streaming / loading 标记派生
selector SHALL 派生 BubbleItem 的 `streaming` / `loading` 字段：

- `streaming = (message.status === 'streaming')`
- `loading = (message.status === 'streaming' && !message.text && (!message.toolCalls || message.toolCalls.length === 0))`

#### Scenario: 流式中有 token
- **WHEN** message.status='streaming' 且 message.text='hel'
- **THEN** BubbleItem.streaming=true、loading=false

#### Scenario: 流式开始无 token
- **WHEN** message.status='streaming' 且 message.text='' 且无 toolCalls
- **THEN** BubbleItem.streaming=true、loading=true（UI 显示 "Thinking..." 占位）

#### Scenario: 完成态
- **WHEN** message.status='done'
- **THEN** BubbleItem.streaming=false、loading=false
