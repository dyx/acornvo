## Why

AI 链路当前完全手写：4 份 provider HTTP client（约 600 LOC）、手写 ReAct 循环、JSON 模式与工具调用 schema 双向转换、进程内 Map 审批门、markdown 代码块剥离 + Ajv 校验。这些都是无差异化的"管道工"代码，维护负担高，每次新增 provider 或调整 SSE 协议都要重写一遍。LangChain v1（2025-10）与 LangGraph v1 已稳定发布，可把 provider 适配、ReAct 循环、HITL、结构化输出整体下沉到上游库，并顺便用 SqliteSaver 拿到「重启后恢复挂起审批」的新能力。

## What Changes

- **新增依赖**：`langchain`、`@langchain/core`、`@langchain/openai`、`@langchain/anthropic`、`@langchain/ollama`、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-sqlite`
- **删除依赖（AI 链路内）**：`eventsource-parser`、`ajv`（业务别处保留）
- **删除 ~1100 LOC**：4 个 provider 文件、`parse-json.ts`、`parse-tool-args.ts`、`loop.ts`、`approval.ts`、`registry.ts`、`client.ts`、reviewer 旧实现
- **新增 ~360 LOC**：`runner.ts`、`stream-translator.ts`、`model-factory.ts`、`normalize-errors.ts`
- **5 个内置工具清白重写**为 `tool(fn, { schema: z.object(...) })`，删除 schema converter 与 Ajv 校验
- **HITL 由 `humanInTheLoopMiddleware` + SQLite checkpointer 替代**进程内 Map，`thread_id = session_id`
- **Reviewer 改用 `model.withStructuredOutput(zod)`** 一行替代 markdown 剥离 + Ajv 链路
- **新增 SQLite checkpointer 表**（`checkpoints` / `checkpoint_writes` / `checkpoint_blobs`），通过 migration `002_langgraph_checkpoints.sql` 显式登记
- **新能力：app 重启后扫描未 resolve interrupt 重 emit `tool.approval-needed`**（启动钩子）
- **行为差异（BREAKING 仅对内部 step.warning 事件）**：去除单工具串行约束，跟随 LangGraph v1 默认并行执行 tool_calls；不再 emit `step.warning`
- **AgentEvent IPC 契约保持不变**（K1）：stream-translator 在 runner 内部把 LangGraph 事件翻译回现有 AgentEvent，前端零改动
- **K1 例外清单第 2 条（additive 扩展）**：`tool.start` 与 `tool.result` 事件添加可选字段 `callId?: string`，由 stream-translator 透传 LangGraph 的 `tool_call_id`；旧前端消费者忽略字段无影响；新前端（phase-20 `bubbleSelectors`）据此把工具调用与结果按 callId 折叠进对应 assistant 消息的 ThoughtChain

## Capabilities

### New Capabilities

- `agent-checkpointer`: LangGraph SqliteSaver 集成 —— 表结构、`thread_id = session_id` 约定、级联删除、app 启动时恢复挂起 interrupt

### Modified Capabilities

- `llm-client`: provider 实现下沉到 `@langchain/*` 包；profile → `BaseChatModel` 工厂；错误归一化重写
- `llm-tool-use`: 工具描述从 JSON Schema + Ajv 迁到 Zod；不再需要双向 schema converter
- `ai-reviewer-service`: 改为 `withStructuredOutput(AiReviewSchema)` 调用，去除 markdown 代码块剥离与 Ajv 校验
- `agent-loop`: 手写 ReAct 循环替换为 `createAgent` + `agent.stream`；并行 tool_calls 不再被约束为串行；callId 来源改为 LangGraph interrupt id
- `agent-tool-registry`: 删除 registry 中间层与 schema converter，工具直接以数组传给 `createAgent({ tools })`
- `agent-tools-builtin`: 5 个内置工具重写为 `tool() + Zod schema`，行为对等
- `agent-approval`: 进程内 Map 审批门替换为 `humanInTheLoopMiddleware`；IPC 入口（`agent.approve` / `agent.reject` / `agent.cancel`）签名不变，内部走 `Command({ resume })`
- `agent-sessions`: 保持为 UI truth source；runner 在收到 stream-translator 事件时调用 `appendMessage` / `recordToolCall` / `finishToolCall`；session 删除时级联清理 checkpointer 中同 thread_id 的 3 张表
- `ai-prompts`: system prompt 从 `{ role: 'system', content }` 对象导出形式改为 string 导出（传给 `createAgent({ systemPrompt })`）
- `ai-usage-log`: 输入从手写 provider usage 字段切换为 LangChain `AIMessage.usage_metadata`；聚合与落库逻辑不变

## Impact

- **代码**：`electron/ai/**`、`electron/agent/**` 大规模重写；删除 5 个 provider 文件、loop / approval / registry / parse-json / parse-tool-args / 旧 client；新增 4 个文件
- **数据库**：新增 migration `002_langgraph_checkpoints.sql`；现有 `sessions` / `session_messages` / `tool_calls` 表 schema 与读写语义不变；现有用户数据完全保留无需迁移
- **依赖**：package.json 增 7 个 `@langchain/*` 包，减 `eventsource-parser` 与 AI 链路对 `ajv` 的依赖
- **IPC**：AgentEvent 契约不变（K1），前端 UI 无任何感知改动
- **测试**：删除 provider / parse-json / parse-tool-args / registry 单测；重写 reviewer / loop / approval 测试；新增 stream-translator / model-factory / normalize-errors / checkpointer-recovery 测试；acceptance 套件保持不动且全绿
- **新能力**：app 重启后恢复挂起审批
- **行为差异**：并行工具调用不再被约束为串行（`step.warning` 事件不再触发，前端处理代码可在子项目 B 一并清理）
- **非目标**：不改 UI 组件（属子项目 B）；不新增 provider；无 LangSmith / 远程 tracing；无多 agent 编排；无 RAG / 向量库
