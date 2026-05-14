## REMOVED Requirements

### Requirement: chatWithTools 接口
**Reason**: 工具调用链路下沉到 LangGraph `createAgent`。`agent.stream(...)` 直接产出统一的 model/tools 事件，调用方无需经一个我们自维护的 `chatWithTools` API。tool schema、provider 适配、tool_calls 解析全部由 `@langchain/*` 包负责。
**Migration**: 调用方改为 `createAgent({ model: buildChatModel(profile), tools, middleware: [hitl], checkpointer }).stream(...)`；通过 stream-translator 将 LangGraph 事件翻译为现有 `AgentEvent`（见 agent-loop 规格）。

### Requirement: 流式文本
**Reason**: 流式 token 由 LangGraph `streamMode: ['updates', 'messages']` 的 `messages` 频道发出 `AIMessageChunk`，由 stream-translator 翻译为 `token { text }` 事件。`eventsource-parser` 等手写 SSE 解析不再需要。
**Migration**: stream-translator 监听 `["messages", [AIMessageChunk, metadata]]`（仅 model 节点）并转 emit `token` 事件；外部 IPC 契约不变。

### Requirement: Ollama 无原生 tool 支持的 fallback
**Reason**: LangChain `ChatOllama` 直接对接 Ollama 原生 tool 支持，主流模型（llama3.1+、qwen2.5+）已稳定支持 tool calling。自写 system prompt 注入 fallback 在 LangChain 抽象下难以保留，且增加 stream-translator 复杂度。
**Migration**: 用户需在 settings 选择支持 tool 的 Ollama 模型；不支持 tool 的模型在工具调用场景下行为退化为普通对话（与现行 fallback 在产品体验上接近）。在 release notes 提示。

### Requirement: args 解析与 Ajv validate
**Reason**: 工具参数 schema 改用 Zod；LangChain `tool(fn, { schema: z.object(...) })` 调用前自动 Zod 校验。Ajv 在 AI 链路完全移除。
**Migration**: 工具 schema 重写为 Zod；validate 失败时 LangChain 抛 `ZodError` → tool message 含 error → LLM 重试（行为等价）。
