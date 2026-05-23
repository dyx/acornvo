## Context

前置：

- phase 4：`file.write(path, { body, frontmatter }, { expectedMtime })` 原子写
- phase 5：`files.list` 与 `files.get` 接口 + tags 表
- phase 8：FTS5 搜索 + quickSwitcher
- phase 13：AI profile + `getProfileDecryptedKey`
- phase 15：`llmClient.chat` / `chatJson`（非流式）

本阶段是"agent"第一次出现：LLM 不再只是生成一段文字，而是**主动调用应用能力**。

## Goals / Non-Goals

**Goals:**

- 明确的 tool 契约：schema-driven，每个 tool 可独立测试
- 安全门：副作用 tool 必须走用户确认
- session 持久化：关应用后下次打开同一 session 能接着聊
- 流式 UI 友好：phase 17 UI 订阅事件流即可
- 可扩展：新增一个 tool 等于加一个文件并 register

**Non-Goals:**

- 不做 RAG / 向量检索（phase 17 如需再加；本阶段 search-files 走 FTS5 就够）
- 不做多 agent / agent 间通信
- 不做 function calling 的并行多 tool（一次 step 最多一个工具；避免复杂）
- 不做超出树林范围的操作（tool 不暴露系统 shell / 网络抓取外站）
- 不做 web browsing tool（phase 11 的浏览器独立；agent 本阶段不接入）
- 不做"撤销助手操作"历史（副作用走 phase 10 ops_log，用户可手动回滚）
- 不做自动调用频率限制/成本上限（phase 18 做）

## Decisions

### D1: Tool 契约

```ts
interface Tool<TArgs = any, TResult = any> {
  name: string // snake_case
  description: string // LLM 看得见
  parameters: JSONSchema // OpenAI function calling 格式
  sideEffect: boolean // true 则走 approval
  execute(args: TArgs, ctx: ToolCtx): Promise<TResult>
}

interface ToolCtx {
  sessionId: string
  vaultRoot: string
  log: (level, msg) => void
  cancel: AbortSignal
}
```

**内置 tools（本阶段）**：

- `search_files({ query, limit? })`：调 phase 8 FTS5 → 返回 `{ items: [{ path, title, snippet }] }`；sideEffect=false
- `read_file({ path })`：读 md 文件，返回 `{ frontmatter, body }`（path 经 safeResolve）；sideEffect=false
- `list_tags({ prefix?, limit? })`：读 phase 5 tags 表；sideEffect=false
- `update_frontmatter({ path, patch, reason })`：合并 patch 到现有 frontmatter 并 phase 4 写回；**sideEffect=true** → 经 approval 门
- `clip_summary({ clipId, force? })`：调用 phase 15 `reviewer.reviewClip`；返回 summary 字段；**sideEffect=false**（写回 frontmatter 是 reviewer 内部行为，但它有 mtime 乐观锁；此处 agent 视为查询：审读已存在则直接返回 frontmatter 现值）

read_file 对于不存在的路径返回 `{ ok: false, error: 'E_NOT_FOUND' }`（让 LLM 能看到结构化失败）。

### D2: LLM tool use 映射

- **OpenAI / openai-compatible**：用 `tools` + `tool_choice: 'auto'` + `response.tool_calls[]`
- **Anthropic**：Messages API `tools: [...]`；响应的 `content[].type === 'tool_use'`
- **Ollama**：大多数本地模型不原生支持 tool use；fallback 策略：
  - prompt 内告诉模型"若要用工具，回 `{\"tool\": <name>, \"args\": {...}}` 单行 JSON；否则正常回复"
  - 解析每一条 chunk；尝试 JSON → 判断是否 tool call
  - 若 Ollama 模型本身支持 function calling（如 llama3.1-instruct 的 tool use 格式），也兼容；优先检测结构化字段

**统一表示**：llmClient 把 tool_calls 解析后返回

```ts
{
  text?: string;               // assistant 文本内容
  toolCalls: { id, name, args }[];  // 结构化
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: TokenUsage;
}
```

### D3: agent loop 伪代码

```ts
async function runAgent(sessionId, userText, streamWriter) {
  // 1. 取 session history
  const history = await sessions.getMessages(sessionId);
  history.push({ role: 'user', content: userText });
  await sessions.appendMessage(sessionId, { role: 'user', content: userText });
  streamWriter.emit({ type: 'message.appended', message });

  const maxSteps = 8;
  for (let step = 0; step < maxSteps; step++) {
    streamWriter.emit({ type: 'step.start', step });

    const r = await llmClient.chatWithTools({
      profileId,
      messages: [systemPrompt(), ...history],
      tools: registry.openApiDefinitions(),
      stream: true,
      onToken: (t) => streamWriter.emit({ type: 'token', text: t }),
    });

    if (r.finishReason !== 'tool_calls') {
      // 普通回复
      await sessions.appendMessage(sessionId, { role:'assistant', content: r.text });
      streamWriter.emit({ type: 'message.appended', ... });
      streamWriter.emit({ type: 'done' });
      return;
    }

    // tool_calls：本阶段只处理第一个（单工具 per step）
    const tc = r.toolCalls[0];
    await sessions.appendMessage(sessionId, { role:'assistant', content: r.text ?? '', toolCalls: [tc] });
    const tool = registry.get(tc.name);
    if (!tool) { /* 失败消息塞回 history */ continue; }

    // sideEffect → 等 approval
    let args = tc.args;
    if (tool.sideEffect) {
      const callId = await approval.register(sessionId, tc);
      streamWriter.emit({ type: 'tool.approval-needed', callId, tool: tc.name, args });
      const approved = await approval.await(callId);   // 用户按 approve 前 Promise 挂起
      if (!approved.ok) { /* 失败塞回，break */ }
      args = approved.args;   // 用户可能在 UI 编辑 args
    }

    streamWriter.emit({ type: 'tool.start', tool: tc.name, args });
    const result = await tool.execute(args, { sessionId, ... });
    streamWriter.emit({ type: 'tool.result', tool: tc.name, result });
    await sessions.appendMessage(sessionId, {
      role: 'tool',
      toolCallId: tc.id,
      content: JSON.stringify(result).slice(0, 8000)
    });
    history.push(...);
  }
  // step 上限
  streamWriter.emit({ type: 'error', error: 'E_STEP_LIMIT' });
}
```

**单 tool per step** 的原因：approval UX 更清晰；错误处理简单。

### D4: approval 门

`electron/agent/approval.ts`：

- `register(sessionId, toolCall) → callId`（UUID）
- 内部 Map `pending: callId → { resolve, reject, sessionId, toolCall, createdAt }`
- 事件 `approval.requested` 广播到 renderer
- 用户点同意 / 取消时 renderer 调 IPC `chat.approveTool(callId, { editedArgs? })` → resolve
- 超时（30 分钟）自动 reject
- `approval.await(callId)` → 返回 `{ ok: true, args } | { ok: false, error }`

UI（phase 17 实装）SHALL 展示：工具名、参数 diff（特别 update_frontmatter 时展示 before/after JSON）、reason、两个按钮 "同意" / "取消"；可编辑参数再同意。

### D5: session schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,                    -- 首次用户消息截 40 字；可后续改
  profile_id TEXT,               -- 该 session 绑定的 profile（可变）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,            -- 'user' | 'assistant' | 'tool' | 'system'
  content TEXT,                  -- 对 tool role: JSON stringify 的 result
  tool_calls_json TEXT,          -- assistant 时可选：JSON of ToolCall[]
  tool_call_id TEXT,             -- tool role 时：对应 assistant tool call 的 id
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_messages_session ON session_messages(session_id, id);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id INTEGER,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_json TEXT,
  approved INTEGER,              -- 0/1/NULL（无需 approval 时为 NULL）
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);
```

删除 session → ON DELETE CASCADE 连带清 messages；tool_calls 另外用触发器同步。

### D6: 流式 IPC 模型

- IPC 不能直接 stream；用 `ipcMain.on(channel, listener)` + `webContents.send(channel + ':<sessionId>', event)`
- renderer 调 `chat.sendUserMessage({ sessionId, text })`（一次性 IPC）；main 启动 agent loop → 通过 `chat.stream:<sessionId>` 频道推送事件
- renderer 在发送前先 `chat.subscribeStream(sessionId)` 登记
- `chat.cancelStream(sessionId)`：设置 AbortController → loop 检查 cancel → 发送最后 `{type:'canceled'}` 事件

### D7: 系统提示词

`electron/ai/prompts/chat-agent.ts`：

```
你是 Acornvo 的内置助手"松语"。你能读写当前"树林"内的文档。你的原则：
- 尽量用工具验证事实；不要凭空猜测文件内容。
- 修改文件前必须说明原因（reason），并接受用户确认。
- 回答简洁；引用文件时用相对路径。
- 只处理用户树林内的内容；拒绝越界请求。
```

每个 session 初次创建时 system message 被预置为该 prompt；发送给 LLM 时动态合入。

### D8: 错误处理与恢复

- tool 执行抛错 → 不打断 loop，而是把 `{ ok: false, error: msg }` 塞回 history 作为 tool role 的 content；LLM 下一步可能道歉或换策略
- LLM 返回非法 JSON 工具调用 → 塞 "invalid tool call" 消息；让 LLM 再尝试
- step 超 8 次仍未 stop → emit `{type:'error', error:'E_STEP_LIMIT'}`
- profile 缺失 / 401 / 网络 → 和 phase 15 错误归一化一致；emit `{type:'error', error: code}`；session 保留已 append 的消息

### D9: 工具权限

本阶段所有 tools 都作用在 **当前树林**；path 参数 MUST 经 safeResolve 沙箱。任何 escape 尝试（`../` / absolute）→ tool 返回 `E_PATH_ESCAPE`，LLM 能看到并调整。

### D10: 持久化与隐私

- session_messages 存明文；未加密（与 vault 内容同等敏感度，但 vault 本身也是明文 md）
- 用户在 settings 可"清空所有 sessions"（本阶段不做 UI，phase 17 做）
- LLM 调用的 usage 数据仍走 phase 15 `ai_usage` 表；追加 `session_id` 字段关联

### D11: 并发

- 一个 session 同一时刻 MUST 只有一个活跃 agent loop；`chat.sendUserMessage` 时若检测已有 loop 正在跑 → 返回 `E_BUSY`
- 多 session 之间可并发；limit：最多 4 个并发 loop（避免 LLM 速率压力）

### D12: i18n key

```
chat.approval.title
chat.approval.reason
chat.approval.args
chat.approval.approve / cancel / edit
chat.tool.search_files / read_file / list_tags / update_frontmatter / clip_summary
chat.error.step_limit / missing_profile / busy / ...
```

## Risks / Trade-offs

- [LLM tool use 语义在各 provider 不一致] → 统一抽象 + 每个 provider 单独适配；边界 case 用 prompt fallback
- [user 在 approval 时应用关掉] → 下次打开时 pending approval 视为超时（运行时 Map 丢失）；调用方 loop 在 await 时若取消 MUST `{ok:false, error:'E_APPROVAL_TIMEOUT'}`
- [LLM 幻觉工具名] → registry 不存在 → 注入错误消息；LLM 重试
- [超长 tool result 压 context] → slice(0, 8000)；rely on user 引导更精确
- [副作用 tool 失败后 LLM 继续胡来] → step_limit 兜底；approval 门挡大多数危险
- [8 step 不够] → 日常够；可调 config（未暴露为 user setting，开发者常量）

## Migration Plan

- migration 009 建 sessions / session_messages / tool_calls 表
- 回滚：删 migration 009；IPC 断开；phase 17 UI 直接不可用但不影响其他 phase

## Open Questions

- 是否在本阶段提供 `web_search` tool？→ 否；phase 后续可接入 DuckDuckGo
- Anthropic 的 prompt caching 是否利用？→ phase 18 优化
- 大型 context 摘要（超 128k）如何处理？→ 当前模型都足够；若需要可在 D3 agent loop 内插一步 history 压缩，phase 后续做
