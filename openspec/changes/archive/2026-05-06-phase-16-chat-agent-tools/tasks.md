## 1. Schema 与类型

- [x] 1.1 `migrations/009_sessions.sql`：三表 + 索引 + `ALTER TABLE ai_usage ADD COLUMN session_id TEXT`；`user_version = 9`
- [x] 1.2 `shared/agent-types.ts`：`Tool` / `ToolCall` / `ToolResult` / `Session` / `SessionMessage` / `AgentEvent`
- [x] 1.3 `package.json` 添加 `eventsource-parser`

## 2. llm-client 扩展

- [x] 2.1 `electron/ai/client.ts`：`chatStream` 与 `chatWithTools` 签名
- [x] 2.2 providers/openai.ts：tool_calls 请求 + SSE 解析
- [x] 2.3 providers/anthropic.ts：tools 请求 + stream messages 解析
- [x] 2.4 providers/openai-compatible.ts：复用 openai
- [x] 2.5 providers/ollama.ts：原生 tool 检测 + 纯文本 fallback
- [x] 2.6 args 统一 parse + Ajv validate（registry 注入 validator）

## 3. Agent 核心

- [x] 3.1 `electron/agent/registry.ts`：`register / get / list / openApiDefinitions / anthropicDefinitions`
- [x] 3.2 `electron/agent/approval.ts`：Map + 30min 超时 + 事件桥接
- [x] 3.3 `electron/agent/loop.ts`：runAgent 实现；step ≤ 8；单 tool per step
- [x] 3.4 system prompt 模板 `electron/ai/prompts/chat-agent.ts`

## 4. 内置工具实现

- [x] 4.1 `electron/agent/tools/search_files.ts`
- [x] 4.2 `electron/agent/tools/read_file.ts`（body 60k 截断 + safeResolve）
- [x] 4.3 `electron/agent/tools/list_tags.ts`
- [x] 4.4 `electron/agent/tools/update_frontmatter.ts`（sideEffect=true，null→删）
- [x] 4.5 `electron/agent/tools/clip_summary.ts`（复用 phase 15 reviewer）
- [x] 4.6 启动时 register 5 个 tool；启动自检（description / parameters 非空）

## 5. Sessions 持久化

- [x] 5.1 `electron/agent/sessions.ts`：createSession / list / delete / rename / getMessages / appendMessage / recordToolCall / finishToolCall / 自动 title
- [x] 5.2 `ai_usage.session_id` 在 phase 15 + phase 16 两路写入点更新

## 6. IPC

- [x] 6.1 `electron/ipc/chat.ts`：sessions CRUD / sendUserMessage / cancelStream / approveTool / rejectTool / subscribe/unsubscribe
- [x] 6.2 main 并发保护：per-session lock + 全局 ≤4 loop
- [x] 6.3 preload：`window.api.chat.*` + `onChatStream(sessionId, cb)`（事件 channel 按 sid 分流）

## 7. 事件流

- [x] 7.1 `streamWriter` 写事件到 `chat.stream` channel 按 sessionId 携带
- [x] 7.2 Abort 链路：cancelStream → AbortController → loop + fetch 双传

## 8. i18n

- [x] 8.1 `chat.*` keys（见 design D12）

## 9. 验收（可无 UI 用开发者测试脚本）

- [x] 9.1 migration 009 后三表 + ai_usage.session_id 列存在
- [x] 9.2 启动后 `registry.list()` 含 5 个 tool
- [x] 9.3 创建 session + sendUserMessage "搜索一下我笔记里有没有 attention" → agent 调 search_files → LLM 基于结果回答；session_messages 完整保存（user / assistant(tool_call) / tool / assistant）
- [x] 9.4 用户问"把 notes/a.md 的 rating 改成 5" → agent 调 update_frontmatter → IPC 发 approval-needed → renderer 调 approve → tool 执行成功 → LLM 回确认
- [x] 9.5 update_frontmatter 未传 reason → tool 返回 E_MISSING_REASON → LLM 重试带 reason
- [x] 9.6 路径越狱 `../../etc/passwd` → read_file 返回 E_PATH_ESCAPE
- [x] 9.7 reject 一个 approval → tool 结果是 E_USER_REJECTED；LLM 下一步不执行
- [x] 9.8 超时 30min 未 approve → tool 结果 E_APPROVAL_TIMEOUT
- [x] 9.9 cancelStream → agent loop 提前结束；emit canceled；已写入 message 保留
- [x] 9.10 同 sid 再次 sendUserMessage 时有 loop 运行 → E_BUSY
- [x] 9.11 4 个不同 sid 并发 loop 下，发起第 5 个 → E_GLOBAL_BUSY
- [x] 9.12 LLM 返回非法 JSON tool call → loop 塞错误给 LLM 让它重试
- [x] 9.13 step 达到 8 仍未 stop → emit E_STEP_LIMIT
- [x] 9.14 Ollama（本地 llama3）下 clip_summary → fallback 解析工具调用成功
- [x] 9.15 ai_usage 新增行 session_id 填充正确
- [x] 9.16 tool_calls 表记录每次工具调用（args / result / started_at / finished_at / approved）
- [x] 9.17 `openspec validate phase-16-chat-agent-tools --strict` 通过
