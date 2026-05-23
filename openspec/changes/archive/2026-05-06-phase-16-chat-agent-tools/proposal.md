## Why

phase 15 完成了"对剪藏文章做一次性 AI 审读"的后台能力。phase 17 的"松语" chat UI 需要一个**带工具调用的对话后端**：用户可以在聊天里引用某个文件 / 搜索树林 / 让 AI 帮忙改 frontmatter / 生成摘要。没有统一的 **agent + tools + session** 层，phase 17 只能在 UI 里硬写 prompt。

PRD P-3 / S-11 要求"松语是树林的智能助手，能读文件、能搜索、能改文件（写前征求用户同意）"。这就是 Agent 层。

本阶段要搭骨架：

- 一个可扩展的 **tool registry**：内置工具列表（phase 16 内实装）：`search-files` / `read-file` / `list-tags` / `update-frontmatter` / `clip-summary`（复用 phase 15 reviewer）
- 一个 **agent loop** 在 main 进程内执行："LLM 说要调工具 → 我们执行 → 结果塞回 LLM → 继续"，直到 LLM 给最终回复
- 对有副作用的 tool（`update-frontmatter`）引入 **human-in-the-loop 确认**：agent 暂停，UI 弹 diff 确认，用户同意才执行
- **sessions** 表：每个会话含 messages + tool_calls 持久化
- 流式输出：`chat.stream({ sessionId, userText }) → stream events`（供 phase 17 UI 订阅）

本阶段**不**做 UI（phase 17 做），但提供完整 IPC + 可脚本验证的 agent 回路。

## What Changes

- 引入 `electron/agent/` 目录，核心：
  - `tools/`：每个 tool 实现一个文件；每个 tool 导出 `{ name, description, parameters: JSONSchema, execute(args, ctx) }`
  - `registry.ts`：注册内置 tools；按能力分组
  - `loop.ts`：agent loop（调 LLM tool-use 接口 → 解析 → 执行 → 再调 LLM）
  - `approval.ts`：副作用 tool 的人工确认门
- 新增 prompt：`chat-agent.system`（系统提示词，告诉 LLM 可用工具 + 响应格式）
- 扩展 `llm-client`（phase 15）：增加 `chatStream` 与 `chatWithTools` 能力
  - OpenAI / openai-compatible / Anthropic 原生支持 tool use；
  - Ollama 模型支持不均匀：用 prompt 内约定 + JSON 解析回退
- 新增 `sessions` 表 + `session_messages` 表：持久化对话
- IPC：`chat.sendUserMessage({sessionId, text})` / `chat.stream(sessionId)` / `chat.approveTool(callId)` / `chat.cancelStream(sessionId)` / `chat.sessions.list/create/delete`
- 每个工具调用写 `tool_calls` 表记录（audit trail）
- `update-frontmatter` 与其他副作用 tool 的执行前 SHALL 走 approval 流
- migration 009：`sessions` / `session_messages` / `tool_calls` 表
- 复用 phase 4 的原子写与 phase 5 的搜索基座；复用 phase 15 的 `llmClient`

## Capabilities

### New Capabilities

- `agent-tool-registry`: 工具定义契约与注册中心
- `agent-loop`: 主 loop（LLM ↔ tool execution）
- `agent-approval`: 副作用 tool 的人类确认门
- `agent-sessions`: sessions + session_messages + tool_calls 的持久化
- `agent-tools-builtin`: 本阶段实装的 5 个工具
- `agent-ipc`: chat / approval / sessions 相关 IPC 契约
- `llm-tool-use`: `llm-client` 的 tool use + 流式能力扩展

### Modified Capabilities

- `llm-client` (phase 15): 新增 `chatWithTools` / `chatStream` 方法

## Impact

- `package.json` 保持 fetch 路线，不引 SDK；新增 `eventsource-parser` 用于 SSE 解析
- `migrations/009_sessions.sql`
- `electron/agent/`：tools/\*、registry、loop、approval、sessions
- `electron/ai/client.ts` 扩展 tool use
- `shared/agent-types.ts`：`Tool` / `ToolCall` / `AgentEvent` / `ChatMessage` / `Session`
- `electron/ipc/chat.ts`
- preload 暴露 `window.api.chat.*`（不含 approval bypass）
- 依赖：phase 13 profiles、phase 15 llmClient、phase 4 file.write（update-frontmatter tool）
- phase 17 的 UI 将订阅 `chat.stream` 事件
