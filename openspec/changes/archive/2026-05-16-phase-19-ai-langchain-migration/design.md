## Context

项目当前 AI 链路完全手写：`electron/ai/providers/{openai,anthropic,ollama,openai-compatible}.ts`（4 份 HTTP client 约 600 LOC）、`electron/ai/client.ts` 顶层 dispatcher、`electron/ai/reviewer.ts` + `parse-json.ts` + `parse-tool-args.ts` 结构化输出链路、`electron/agent/loop.ts` 手写 ReAct 循环（185 行）、`electron/agent/approval.ts` 进程内 Map 审批门、`electron/agent/registry.ts` 工具注册与 JSON Schema 双向转换。

行为正确，但维护负担高，provider 适配是无差异化工作。LangChain v1（2025-10）与 LangGraph v1 已稳定发布，把 provider 适配、ReAct 循环、HITL、结构化输出整体下沉到上游库，并顺便用 SqliteSaver 拿到「重启后恢复挂起审批」的新能力。

**约束**：

- IPC 契约（`AgentEvent`）必须保持稳定 —— 前端 UI 改造属子项目 B，不在本次范围
- session_messages 已是 UI truth source，不能被 checkpointer 取代
- 现有用户数据完全保留，不强制 schema 升级
- 5 个内置工具的对外行为（参数 schema、副作用语义、错误码）保持等价

## Goals / Non-Goals

**Goals:**

- Provider 层从代码库消失，由 `@langchain/openai` / `@langchain/anthropic` / `@langchain/ollama` 替代
- Agent loop 由 `createAgent` + `agent.stream` 替代
- HITL 由 `humanInTheLoopMiddleware` + SqliteSaver checkpointer 替代
- 工具描述 Zod 化；删除 JSON Schema → provider schema 双向转换
- Reviewer 改用 `model.withStructuredOutput(zod)` 一行替代 markdown 剥离 + Ajv
- 净减约 700–800 LOC + 删除 5 个 provider 文件
- 新增：app 重启后恢复挂起审批

**Non-Goals:**

- UI 组件改动（属子项目 B）
- 新 provider（Azure / Gemini / Bedrock 留作未来）
- LangSmith / 远程 tracing
- 多 agent / sub-agent 编排
- RAG / 向量库
- 改 IPC 契约（K1 决策）

## Decisions

### L1 · HITL 实现方式

**决策**：拥抱 LangGraph **interrupt** + **SQLite checkpointer**（`@langchain/langgraph-checkpoint-sqlite`）。

**理由**：
- 与 v1 中间件机制对齐，是 LangChain 团队推荐的 HITL 模式
- 自动持久化挂起状态，免费获得「app 重启恢复审批」能力
- 删掉自写 Map gate（87 LOC + 测试）

**替代方案**：
- 保留自写 ApprovalGate 仅在执行 tool 前查表 —— 拒绝。则失去 v1 默认的 `Command({ resume })` 一致性，且 SqliteSaver 仍需引入以支持其他持久化需求。

### S1 · session_messages 表与 checkpointer 的关系

**决策**：**双库共存**。`thread_id = session_id`。
- `session_messages` 表保持为 UI truth source 不变（renderer 仍按它渲染）
- checkpointer 是 LangGraph 运行时实现细节（仅 HITL resume 时被读）
- runner 作桥梁：从 stream-translator 收到 user-visible 事件时同步写 session_messages
- 普通对话轮采用 **Stateless invocation**：`agent.stream({ messages: [...完整历史] }, { configurable: { thread_id } })` —— 每轮显式传完整 messages，**不依赖 checkpointer 携带历史**
- 只有 HITL resume 轮 `agent.invoke(new Command({ resume }), { configurable: { thread_id } })` 才让 checkpointer 加载暂停状态

**理由**：避免两份历史不一致；UI 仍只读一个表；checkpointer 仅承担 HITL 暂停态。

**替代方案**：
- A. 全量依赖 checkpointer 取消 session_messages —— 拒绝，UI 改动巨大且超出本次范围
- B. 让 checkpointer 与 session_messages 双向同步 —— 拒绝，易产生分歧 bug；本方案保持单向流（runner → session_messages）

**幂等约束**：stream-translator 持久化新消息时需以 LangGraph `AIMessage.id` 为键去重，避免 resume 后重复 append。

### K1 · IPC 契约（AgentEvent）演进

**决策**：**保持不变**。stream-translator 在 runner 内部把 LangGraph 事件翻译回现有 AgentEvent。子项目 B 如需新事件类型再扩 IPC。

**理由**：前端 UI 已稳定；本次只换内核不动外壳；acceptance 测试不动是迁移正确性的核心证据。

**例外清单**：

1. 内部 `step.warning` 事件不再触发（因并行工具决策见下），但事件类型保留在协议中以避免 renderer 解析失败
2. **`tool.start` 与 `tool.result` 事件添加可选字段 `callId?: string`**（additive 扩展）：由 stream-translator 透传 LangGraph 的 `tool_call_id`（`tool.start.callId` = `AIMessage.tool_calls[i].id`；`tool.result.callId` = `ToolMessage.tool_call_id`）。旧前端消费者忽略字段无影响；phase-20 `bubbleSelectors` 据此把工具调用与结果按 callId 精准折叠进对应 assistant 消息的 ThoughtChain（替代旧实现的本地 nextMsgId 生成）。`shared/agent-types.ts` 中相应类型同步扩展。

### T1 · 工具迁移路径

**决策**：**清白重写** 5 个内置工具为 `tool(fn, { schema: z.object(...) })`。删除 registry 的 schema converter 与 Ajv 校验。

**理由**：
- 现 registry 38 LOC 全部是 JSON Schema 双向转换的样板，重写比适配更短
- Zod schema 由 LangChain 自动转给具体 provider 的 schema 格式
- `safeResolve` 路径沙箱、`E_*` 错误码、副作用语义都不变

**替代方案**：
- 写适配器把现有 JSONSchema 包成 LangChain Tool —— 拒绝，等于把样板代码原地保留

### 并行工具调用

**决策**：**去掉单工具串行约束**，跟随 LangGraph v1 默认并行。

**理由**：
- 当前 loop 强制只执行 `toolCalls[0]` 并 emit `step.warning` 是手写循环的折中，非产品需求
- 并行使「读 3 个文件 + 列标签」一次完成，明显改善体验
- v1 默认参数无单工具串行选项，强行兼容代价高

**副作用**：`step.warning` 事件不再触发；UI 该事件处理代码可在子项目 B 一并清理。`tool_calls` 表已是 1:N 关联 message，schema 不变。

### callId 来源

**决策**：从我们生成的 UUID 改为 LangGraph interrupt 自带 id。

**理由**：HITL middleware 内部以 interrupt id 寻址 resume；与其映射不如直用。前端无感知（callId 仅作不透明字符串）。

### Stream Translator 事件映射表

| LangGraph 输出 | 翻译为 AgentEvent | 备注 |
|---|---|---|
| `["updates", { model: { messages: [AIMessage] } }]` 无 tool_calls | `message.appended`（assistant）+ 写库 | 终止 |
| `["updates", { model: { messages: [AIMessage with tool_calls] } }]` | `message.appended`（assistant + toolCalls）+ 对每个 tool_call emit `tool.start { tool, args, callId }` | callId = `tool_calls[i].id`；K1 例外第 2 条 |
| `["updates", { tools: { messages: [ToolMessage] } }]` | `tool.result { tool, result, callId }` + 写库（role=tool, toolCallId=callId） | callId = `ToolMessage.tool_call_id`；K1 例外第 2 条 |
| `["messages", [AIMessageChunk, metadata]]` | `token { text }` | 仅 model 节点的 chunk |
| `result.__interrupt__` 含 action_requests | `tool.approval-needed { callId, tool, args }` | callId = interrupt id |
| LangChain 抛非 AbortError 异常 | `error { error: normalize(...) }` | 走 normalize-errors |
| signal aborted | `canceled` | |
| 最终消息后聚合 `usage_metadata` | `done { usage }` + `aiUsage.insert(...)` | |

### Profile → Model 工厂

**决策**：`electron/ai/model-factory.ts` 暴露 `buildChatModel(profile)`，含 LRU 缓存（max=8）。Profile 更新时由 `settings-effects` invalidate 缓存条目（按 `p.id` 前缀清除）。

```ts
switch (p.provider) {
  case 'openai':
  case 'openai-compatible':
    return new ChatOpenAI({
      model: p.model,
      apiKey: p.apiKey ?? '',
      temperature: p.temperature ?? 0.3,
      maxTokens: p.maxTokens ?? 800,
      configuration: p.baseUrl ? { baseURL: p.baseUrl } : undefined,
    });
  case 'anthropic':
    return new ChatAnthropic({ model, apiKey, temperature, maxTokens });
  case 'ollama':
    return new ChatOllama({
      model, baseUrl: p.baseUrl ?? 'http://localhost:11434',
      temperature, numPredict: maxTokens,
    });
}
```

### 错误归一化

**决策**：`electron/ai/normalize-errors.ts` 统一映射：
- AbortError → 透传（runner emit `canceled`）
- LangChain `AuthenticationError` / `RateLimitError` / `APIError` → `E_AUTH` / `E_RATE` / `E_SERVER`
- HTTP status 兜底（401/403→E_AUTH, 429→E_RATE, ≥500→E_SERVER, fetch 网络错→E_NETWORK）
- Zod / structured-output 解析失败 → `E_RESPONSE`
- 未知 → `E_UNKNOWN`，原 message 入 `providerMessage`

所有 IPC 出口仍返回 `LlmErrorCode` 字符串，UI / i18n 不变。

### Checkpointer 表显式登记

**决策**：按项目约定，新增 `electron/db/migrations/002_langgraph_checkpoints.sql` 显式登记 `checkpoints` / `checkpoint_writes` / `checkpoint_blobs` 三张表（即使 SqliteSaver 能自动建），便于备份/diagnostic bundle 工具发现。

### System prompt 输出形式

**决策**：`electron/ai/prompts/chat-agent.ts` 从导出 `{ role: 'system', content }` 对象改为导出 string（传给 `createAgent({ systemPrompt })`）。保留 prompts/ 目录结构，仅签名调整。

### 启动恢复挂起审批

**决策**：在 `app-lifecycle` 启动钩子中扫描未 resolve 的 interrupt 重新 emit `tool.approval-needed`：

```ts
for (const session of sessionsWithPendingInterrupt()) {
  const state = await checkpointer.get({ configurable: { thread_id: session.id } });
  if (state?.next?.includes('__interrupt__')) {
    for (const ir of state.__interrupt__) {
      streamWriter.write({ type: 'tool.approval-needed', callId: ir.id, ... });
    }
  }
}
```

### Cancel 后 thread 清理

**决策**：cancel 时**保留 checkpointer 状态 24h** 供"重连"，过期再清。`agent.cancel({ sessionId })` 调 `AbortController.abort()` 后不立刻删 thread；清理由后台轮询任务（与现有 job runner 协作）按 `created_at < now - 24h` 删除。

## Risks / Trade-offs

- **LangChain API 演进** → 锁版本，记录到 package.json；CI 跑 acceptance 套件抓回归
- **并行工具调用改变行为** → 在 release notes 明确说明；`step.warning` 事件协议保留避免 renderer 崩溃
- **SqliteSaver 表与现有 migrations 冲突** → 走我们 migration 流程显式登记；SqliteSaver 自带的 CREATE IF NOT EXISTS 与我们 migration 互不冲突
- **checkpointer 数据膨胀** → cancel 后 24h 清理；session 删除时级联删除
- **structured-output 在某些模型上失败率** → reviewer 的 catch 路径走 normalize-errors → `E_RESPONSE`，与现行 chatJson 失败路径等价
- **HITL middleware 与已挂起 interrupt 的恢复** → checkpointer-recovery 测试覆盖；启动钩子写在 `app-lifecycle` 后于 IPC 注册之前

## Migration Plan

按 PRD §10 分 6 个 block，每块完成后 IPC 契约稳定、跑完测试通过：

1. **依赖与 model-factory** —— 装包；写 `model-factory.ts` + 单测；旧 `client.ts` 暂存
2. **Reviewer 切换** —— `reviewer.ts` 重写；测试对齐
3. **工具重写** —— 5 个 tool 改 Zod；删 registry / parse-tool-args
4. **Agent runner + stream-translator** —— 写新 runner；IPC 入口切到 runner；`loop.ts` 暂保留作 fallback
5. **HITL + checkpointer** —— 装 SqliteSaver、写 migration、用 HITL middleware；新增启动恢复
6. **清理** —— 删 `loop.ts` / `approval.ts` / `providers/*` / `parse-json.ts` / 旧 `client.ts`；全套测试通过

**数据迁移**：现有用户 sessions / session_messages 完全保留无需迁移。现有"挂起的审批"无法迁到 checkpointer（旧实现未持久化），升级到 A 版本时旧 pending approval 自动消失（与现有 app 重启行为一致，无回归）。

**回滚策略**：每 block 在 IPC 契约稳定的前提下 ship。若 block 5 出问题，回退至 block 4 状态（runner 已就绪，HITL 仍走旧 ApprovalGate fallback）。

## Open Questions

1. **`recursionLimit` 取值** —— 当前 `MAX_STEPS = 8`。LangGraph 的 `recursionLimit` 与"步数"语义略不同（一个 LLM 节点 + 一个 tool 节点 = 2 hops）。需在实施时验证等价值并对齐（候选：16）
2. **Cancel 后 thread 清理任务的实现位置** —— 是放在 job-queue 还是独立定时器？倾向 job-queue（统一调度），实施时确认
3. **`@langchain/langgraph-checkpoint-sqlite` 与 `better-sqlite3` 实例共享** —— 该包默认起独立连接，是否复用我们的 `electron/db/index.ts` 单例需要确认
4. **Ollama 工具 fallback** —— 旧实现对不支持 tool 的 Ollama 模型走 system prompt 注入 fallback；LangChain ChatOllama 是否覆盖此场景？实施时按真实模型行为决定是否保留 fallback；倾向移除，等 Ollama 主流模型 tool 支持成熟
