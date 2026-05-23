# PRD · 子项目 A · AI 内核迁移到 LangChain v1

## 1 · 背景与目标

### 1.1 现状

项目当前 AI 链路完全手写：

- `electron/ai/providers/{openai,anthropic,ollama,openai-compatible}.ts` —— 4 份 HTTP client（约 600 LOC），各自维护 fetch、SSE 解析、JSON 模式、工具调用 schema 转换。
- `electron/ai/client.ts` —— 顶层 dispatcher，按 `profile.provider` 切到具体实现。
- `electron/ai/reviewer.ts` + `parse-json.ts` + `parse-tool-args.ts` —— 理果（结构化输出）链路，含 markdown code fence 剥离、Ajv 校验。
- `electron/agent/loop.ts` —— 手写 ReAct 循环（185 行），含步数上限、tool 结果回填、错误回填、cancel、attachment pre-user message。
- `electron/agent/approval.ts` —— 进程内 Map-based 审批门（in-process HITL）。
- `electron/agent/registry.ts` —— 工具注册与 schema 双向转换（OpenAI / Anthropic）。

行为正确，但维护负担高，且 provider 适配是无差异化工作。

### 1.2 目标

把 AI 内核迁移到 **LangChain v1（2025-10 发布）** + **LangGraph v1**：

- Provider 层下沉到 LangChain 各 provider 包，从我们的代码库消失。
- Agent loop 由 `createAgent` 替代，去除手写 ReAct。
- HITL 由 `humanInTheLoopMiddleware` + **SQLite checkpointer** 替代进程内 Map —— 同时获得 **app 重启后恢复挂起审批** 的新能力。
- 工具描述从 JSON Schema + Ajv 迁到 Zod。
- Reviewer 的 JSON 解析链路用 `model.withStructuredOutput(zod)` 一行替代。

### 1.3 非目标

- 任何 UI 组件改动（属子项目 B）。
- 新增 provider（Azure / Gemini / Bedrock 在 LangChain 已支持，留作未来）。
- LangSmith / 远程 tracing。
- 多 agent / sub-agent 编排。
- RAG / 向量库（已有独立规划）。
- 改 IPC 契约 —— 见 §2.3 K1。

---

## 2 · 关键架构决策

| 编号   | 议题                                      | 决策                                                                                                                                                    |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1** | HITL 实现方式                             | 拥抱 LangGraph **interrupt** + **SQLite checkpointer**（`@langchain/langgraph-checkpoint-sqlite`）                                                      |
| **S1** | session_messages 表与 checkpointer 的关系 | **双库共存**，`thread_id = session_id`。session_messages 保持为 UI truth source 不变；checkpointer 是 graph 运行时实现细节；agent runner 作桥梁同步两边 |
| **K1** | IPC 契约（AgentEvent）演进                | **A 保持不变**。Stream-translator 在 runner 内部把 LangGraph 事件翻译回现有 AgentEvent。B 阶段如需新事件类型再扩 IPC                                    |
| **T1** | 工具迁移路径                              | **清白重写** 5 个内置工具为 `tool(fn, { schema: z.object(...) })`。删除 registry 的 schema converter 与 Ajv 校验                                        |

---

## 3 · 模块映射（前 → 后）

### 3.1 新增依赖

```
langchain
@langchain/core
@langchain/openai                           # 兼 openai-compatible，传 configuration.baseURL
@langchain/anthropic
@langchain/ollama
@langchain/langgraph
@langchain/langgraph-checkpoint-sqlite      # 基于 better-sqlite3
```

zod 已有。`eventsource-parser` 移除（不再手写 SSE）。`ajv` 在 AI 链路移除（业务别处保留）。

### 3.2 模块对照

| 当前                                                         | 替换为                                                                                                        | LOC 影响 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------- |
| `electron/ai/providers/openai.ts` (196)                      | `new ChatOpenAI({...})` 一次构造，含 `configuration.baseURL` 兼容 openai-compatible                           | -190     |
| `electron/ai/providers/anthropic.ts` (203)                   | `new ChatAnthropic({...})`                                                                                    | -200     |
| `electron/ai/providers/ollama.ts` (183)                      | `new ChatOllama({...})`                                                                                       | -180     |
| `electron/ai/providers/openai-compatible.ts` (18)            | 折入 ChatOpenAI                                                                                               | -18      |
| `electron/ai/parse-json.ts` (70) + `parse-tool-args.ts` (34) | `model.withStructuredOutput(zod)` 自带；Zod schema 自动校验                                                   | -100     |
| `electron/ai/client.ts` (155)                                | 拆为 `electron/ai/model-factory.ts`（profile→ChatXxx）+ 删除大部分 dispatch 逻辑                              | -100     |
| `electron/ai/reviewer.ts` (140)                              | 重写为约 50 行：`buildChatModel(profile).withStructuredOutput(AiReviewSchema).invoke(...)`                    | -80      |
| `electron/agent/loop.ts` (185)                               | 拆为 `electron/agent/runner.ts`（约 80 行）+ `stream-translator.ts`（约 150 行）                              | -150     |
| `electron/agent/approval.ts` (87)                            | 由 `humanInTheLoopMiddleware` + `Command({ resume })` 替代；前端 approve/reject IPC 入口仍存在但内部走 resume | -80      |
| `electron/agent/registry.ts` (38)                            | 删除；工具直接以数组传入 `createAgent({ tools })`                                                             | -38      |
| `electron/agent/tools/*` (187 共 5 个)                       | 重写为 `tool()` + Zod                                                                                         | ±0       |
| `electron/agent/sessions.ts` (99)                            | **保留**——继续作为 UI truth source；agent runner 写入                                                         | 0        |
| `electron/agent/attachments.ts` (96)                         | **保留**——pre-user message 组装逻辑不变，输出塞进 `agent.stream({ messages: [...] })` 的 messages 数组        | 0        |
| `electron/agent/concurrency.ts` (22)                         | **保留**——单 session 单 in-flight 控制不变                                                                    | 0        |
| `electron/agent/streamWriter.ts` (24)                        | **保留**——AgentEvent 出口不变                                                                                 | 0        |
| `electron/ai/usage.ts` (96)                                  | **保留**——把 LangChain `AIMessage.usage_metadata` 转成 `aiUsage.insert(...)` 行                               | 0        |

粗减约 **1100 LOC**（4 个 provider + parse-json/parse-tool-args + loop + approval + registry + reviewer + 旧 client）；新增约 **360 LOC**（runner ~80 + stream-translator ~150 + model-factory ~80 + normalize-errors ~50）。**净减约 700–800 LOC** + 5 个 provider 文件整体删除。

### 3.3 新文件

- `electron/ai/model-factory.ts` —— `buildChatModel(profile, opts)`，含 LRU 缓存
- `electron/ai/normalize-errors.ts` —— LangChain 异常 → `LlmErrorCode` 归一化
- `electron/agent/runner.ts` —— 取代 loop.ts，调 `agent.stream(...)`
- `electron/agent/stream-translator.ts` —— LangGraph 事件 → AgentEvent
- `electron/db/migrations/002_langgraph_checkpoints.sql` —— SqliteSaver 所需 3 张表（`checkpoints`、`checkpoint_writes`、`checkpoint_blobs`）显式登记

### 3.4 删除文件

- `electron/ai/providers/openai.ts`
- `electron/ai/providers/anthropic.ts`
- `electron/ai/providers/ollama.ts`
- `electron/ai/providers/openai-compatible.ts`
- `electron/ai/parse-json.ts` + 单测
- `electron/ai/parse-tool-args.ts` + 单测
- `electron/ai/client.ts`（功能拆到 model-factory）
- `electron/agent/loop.ts`（功能拆到 runner + stream-translator）
- `electron/agent/approval.ts`（被 HITL middleware 替代）
- `electron/agent/registry.ts`

---

## 4 · 运行时数据流

### 4.1 一次对话的完整链路

```
Renderer (Chat.tsx, 不变)
    │
    │  IPC: agent.send({ sessionId, text, attachments })
    ▼
electron/agent/runner.ts (新)
    ├ resolveProfile(session.profileId)
    ├ buildChatModel(profile)        ← 缓存
    ├ sessions.appendMessage(userText) → userMsg            ← 同今天
    ├ emit message.appended(userMsg)
    ├ history := sessions.list(sessionId)                   ← 已含刚 append 的 userMsg
    ├ pre := attachments.collect(attachments)  (现有模块)
    ├ messages := [system, pre?, ...history]                ← userMsg 在 history 末尾
    └ for await ([mode, chunk] of agent.stream(
          { messages },                                     ← Stateless invocation: 每轮传完整 messages
          { configurable: { thread_id: sessionId, vaultRoot, clipsGet },
            streamMode: ["updates", "messages"],
            signal }))
         streamTranslator(mode, chunk) → AgentEvent[] → streamWriter.write
                                       → 持久化新出现的 user-visible 消息到 session_messages
         ↑
createAgent({ model, tools, middleware: [HITL], checkpointer })
```

### 4.2 Stream Translator 事件映射

| LangGraph 输出                                                      | 翻译为 AgentEvent                                         | 备注                  |
| ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| `["updates", { model: { messages: [AIMessage] } }]` 无 tool_calls   | `message.appended`（assistant）+ 写库                     | 终止                  |
| `["updates", { model: { messages: [AIMessage with tool_calls] } }]` | `message.appended`（assistant + toolCalls）+ `tool.start` | 一步可多 tool_calls   |
| `["updates", { tools: { messages: [ToolMessage] } }]`               | `tool.result` + 写库（role=tool）                         |                       |
| `["messages", [AIMessageChunk, metadata]]`                          | `token { text }`                                          | 仅 model 节点的 chunk |
| `result.__interrupt__` 含 action_requests                           | `tool.approval-needed { callId, tool, args }`             | callId = interrupt id |
| LangChain 抛非 AbortError 异常                                      | `error { error: normalize(...) }`                         | 走 normalize-errors   |
| signal aborted                                                      | `canceled`                                                |                       |
| 最终消息后聚合 `usage_metadata`                                     | `done { usage }` + `aiUsage.insert(...)`                  |                       |

### 4.3 调用模式：Stateless invocation

**普通对话轮**：`agent.stream({ messages: [完整 messages] }, { configurable: { thread_id } })` —— 每轮显式传完整 messages，session_messages 是 truth source。LangGraph 内部仍按 thread_id 写 checkpoint，但**我们不依赖 checkpointer 携带历史**。

**HITL resume 轮**：`agent.invoke(new Command({ resume }), { configurable: { thread_id } })` —— 不传 messages；LangGraph 从 checkpointer 加载暂停时的状态续跑。这是 checkpointer 唯一被读用的场景。

这避免 session_messages 与 checkpointer 状态分歧（双库共存的关键约束）。Stream-translator 持久化新消息时需**幂等去重**：以 LangGraph AIMessage.id 为键，已写过的 message 不再 append。

### 4.4 行为差异声明

**并行工具调用**：现 loop 强制只执行 `toolCalls[0]` 并 emit `step.warning`。LangGraph 默认并行执行所有 tool_calls，且 v1 默认参数无单工具串行选项。

**决策：去掉单工具约束**，跟随 v1 默认并行。理由：当前约束是手写循环的折中，并非产品需求；并行使"读 3 个文件 + 列标签"能一次完成。

副作用：`step.warning` 事件不再触发；UI 该事件的处理代码可在 B 阶段一并清理。

**callId 来源**：从我们生成的 UUID 改为 LangGraph interrupt 自带 id。前端无感知。

**新能力 · 启动时恢复挂起审批**：因 SqliteSaver 持久化 graph state，app 重启后可扫描未 resolve 的 interrupt 重新 emit `tool.approval-needed`。需在 `app-lifecycle` 启动钩子中加入：

```ts
// 伪代码
for (const session of sessionsWithPendingInterrupt()) {
  const state = await checkpointer.get({ configurable: { thread_id: session.id } });
  if (state?.next?.includes('__interrupt__')) {
    for (const ir of state.__interrupt__) {
      streamWriter.write({ type: 'tool.approval-needed', callId: ir.id, ... });
    }
  }
}
```

---

## 5 · HITL 详细设计

### 5.1 Middleware 配置

```ts
import { humanInTheLoopMiddleware } from 'langchain'

const hitl = humanInTheLoopMiddleware({
  interruptOn: {
    update_frontmatter: {
      allowAccept: true,
      allowEdit: true,
      allowRespond: false,
      allowReject: true,
      description: '修改 frontmatter 需用户确认'
    }
    // 其余 4 个工具默认 false（不审批）
  },
  descriptionPrefix: '工具执行待审批'
})
```

### 5.2 IPC 入口（不变）

- `agent.approve({ sessionId, callId, editedArgs? })` → 内部转 `agent.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), { configurable: { thread_id: sessionId } })`，editedArgs 非空则 `{ type: 'edit', editedAction: { name, args: editedArgs } }`
- `agent.reject({ sessionId, callId })` → 转 `{ type: 'reject', message: 'user rejected' }`
- `agent.cancel({ sessionId })` → 现在的 AbortController.abort()；checkpointer 状态保留供下次启动恢复（或在 cancel 时显式清 thread —— 见 §10.4）

### 5.3 ApprovalGate 当前 API 的兼容

`electron/agent/approval.ts` 暴露的 `register / await / approve / reject / cancelSession / peek / onRequested` 7 个方法对外消费者只有 IPC 层与 runner。删除该文件后：

- IPC 层 `agent.approve` / `agent.reject` 实现改为直接调 `agent.invoke(Command)`，不再经 gate。
- runner 不再 register/await —— interrupt 已通过 stream 自然暴露。

---

## 6 · 数据层

### 6.1 sessions 表（不变）

`sessions` + `session_messages` + `tool_calls` 三张现有表保持 schema 与读写语义不变。runner 在收到 stream-translator 的 user-visible 事件时调用 `sessions.appendMessage` / `sessions.recordToolCall` / `sessions.finishToolCall`（这些方法本身不需要改）。

### 6.2 新增 checkpointer 表

`@langchain/langgraph-checkpoint-sqlite` 默认建：

- `checkpoints(thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)`
- `checkpoint_writes(thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)`
- `checkpoint_blobs(thread_id, checkpoint_ns, channel, version, type, blob)`

按项目现有约定（集中迁移文件），在 `electron/db/migrations/002_langgraph_checkpoints.sql` 中**显式登记**这 3 张表（即使 SqliteSaver 能自动建，也走我们的 migration 流程以便备份/diagnostic bundle 工具发现）。

### 6.3 thread_id = session_id

调 `agent.stream / agent.invoke` 时 `configurable.thread_id` 直接传 `sessionId`。无映射表。

### 6.4 级联删除

`chat.deleteSession(sessionId)` 现已删 sessions / session_messages / tool_calls。新增：同事务删 checkpointer 3 张表中 `thread_id = sessionId` 的行。

### 6.5 数据迁移

- 现有用户的 sessions / session_messages **完全保留** —— 不需要迁移。
- 现有"挂起的审批"无法迁到 checkpointer（因为我们当前不持久化它）—— 升级到 A 的版本时，旧的 pending approval 自动消失（与现有 app 重启行为一致，无回归）。

---

## 7 · Profile → Model 工厂

```ts
// electron/ai/model-factory.ts
interface ResolvedProfile {
  /* 同现 */
}

const cache = new LRU<string, BaseChatModel>({ max: 8 })

export function buildChatModel(p: ResolvedProfile): BaseChatModel {
  const key = `${p.id}::${p.provider}::${p.model}::${p.baseUrl ?? ''}::${apiKeyHash(p.apiKey)}`
  const hit = cache.get(key)
  if (hit) return hit

  let model: BaseChatModel
  switch (p.provider) {
    case 'openai':
    case 'openai-compatible':
      model = new ChatOpenAI({
        model: p.model,
        apiKey: p.apiKey ?? '',
        temperature: p.temperature ?? 0.3,
        maxTokens: p.maxTokens ?? 800,
        configuration: p.baseUrl ? { baseURL: p.baseUrl } : undefined
      })
      break
    case 'anthropic':
      model = new ChatAnthropic({
        model: p.model,
        apiKey: p.apiKey ?? '',
        temperature: p.temperature ?? 0.3,
        maxTokens: p.maxTokens ?? 800
      })
      break
    case 'ollama':
      model = new ChatOllama({
        model: p.model,
        baseUrl: p.baseUrl ?? 'http://localhost:11434',
        temperature: p.temperature ?? 0.3,
        numPredict: p.maxTokens ?? 800
      })
      break
  }
  cache.set(key, model)
  return model
}
```

Profile 更新时由 `settings-effects` invalidate 缓存条目（按 `p.id` 前缀清除）。

---

## 8 · 错误归一化

新增 `electron/ai/normalize-errors.ts`：

```ts
export function normalizeLLMError(err: unknown): LlmError & Error {
  // 1) AbortError → 透传
  // 2) LangChain provider 错误（AuthenticationError / RateLimitError / APIError）→ map 到 E_AUTH / E_RATE / E_SERVER
  // 3) HTTP status 兜底（401/403→E_AUTH, 429→E_RATE, ≥500→E_SERVER, fetch 网络错→E_NETWORK）
  // 4) Zod / structured-output 解析失败 → E_RESPONSE
  // 5) 未知 → E_UNKNOWN，原 message 入 providerMessage
}
```

调用点：runner 的 catch、reviewer 的 catch、model-factory 配置校验。所有 IPC 出口仍返回 `LlmErrorCode` 字符串，UI / i18n 不变。

---

## 9 · 测试策略

| 测试                                                                                   | 行动                                                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `electron/ai/providers/*.test.ts`（共 461 行）                                         | **删除** —— provider 层不再是我们的代码                                                              |
| `electron/ai/parse-json.test.ts`、`parse-tool-args.test.ts`                            | **删除**                                                                                             |
| `electron/ai/reviewer.test.ts`（209 行）                                               | **改写** —— mock `BaseChatModel.withStructuredOutput`；行为对等表保留                                |
| `electron/ai/usage.test.ts`                                                            | **保留** —— 聚合逻辑仍归我们                                                                         |
| `electron/agent/loop.test.ts`（238 行）                                                | **重写** 为 `runner.test.ts` —— mock `agent.stream` 返回 async iterable；事件顺序断言保留（K1 契约） |
| `electron/agent/approval.test.ts`                                                      | **重写** —— 测 HITL middleware 在 4 个 decision 分支的输出                                           |
| `electron/agent/registry.test.ts`                                                      | **删除**                                                                                             |
| `electron/agent/{sessions, attachments, concurrency, bootstrap, streamWriter}.test.ts` | **保留**（业务逻辑不变）                                                                             |
| **新增** `electron/agent/stream-translator.test.ts`                                    | 覆盖 §4.2 全部 8 个映射场景                                                                          |
| **新增** `electron/ai/model-factory.test.ts`                                           | profile → ChatXxx 构造正确（含 baseURL、apiKey、temperature 传递、缓存命中）                         |
| **新增** `electron/ai/normalize-errors.test.ts`                                        | 各种 LangChain 异常归一化                                                                            |
| **新增** `electron/agent/checkpointer-recovery.test.ts`                                | app 重启时挂起 interrupt 被重 emit                                                                   |
| `electron/__acceptance__/*` chat 相关用例                                              | **不改 mock 表面，100% 通过** —— K1 的核心契约验证                                                   |

---

## 10 · 实施分块（仅供后续 plan 参考）

> 本 session 不实施。后续按 OpenSpec change `phase-19-ai-langchain-migration` 走 propose → plan → apply。

1. **依赖与 model-factory** —— 装包；写 `model-factory.ts` + 单测；旧 client.ts 暂存不动
2. **Reviewer 切换** —— `reviewer.ts` 重写；测试对齐；reviewer 已可独立走通
3. **工具重写** —— 5 个 tool 改 Zod；删 registry / parse-tool-args
4. **Agent runner + stream-translator** —— 写新 runner，IPC 入口切到 runner，loop.ts 暂保留作 fallback
5. **HITL + checkpointer** —— 装 SqliteSaver、写 migration、用 HITL middleware；新增启动恢复
6. **清理** —— 删 loop.ts / approval.ts / providers/\* / parse-json.ts / 旧 client.ts；全套测试通过

每个 block 完成后应保持 IPC 契约稳定，跑完测试都应通过 —— 任意 block 之间可暂停 ship。

---

## 11 · OpenSpec capability 变化

**MODIFIED**：`llm-client`、`llm-tool-use`、`ai-reviewer-service`、`agent-loop`、`agent-tool-registry`、`agent-tools-builtin`、`agent-approval`、`agent-sessions`、`ai-prompts`、`ai-usage-log`

**ADDED**：`agent-checkpointer` —— 新 capability，描述 SqliteSaver 集成、表结构、启动恢复

**UNCHANGED**：`ai-provider-profiles`、`agent-ipc`（K1 保证）、所有 chat-\* 相关

具体 spec.md / delta 写法在 plan 阶段产出。

---

## 12 · 未决 / 待 plan 阶段细化

1. **System prompt 输出形式** —— 当前 `electron/ai/prompts/chat-agent.ts` 导出 `{ role: 'system', content }` 对象；新方案改为导出 string（传给 `createAgent({ systemPrompt })`）。保留 prompts/ 目录结构，仅签名调整。
2. **recursionLimit 取值** —— 当前 `MAX_STEPS = 8`。LangGraph 的 `recursionLimit` 与"步数"语义略不同（一个 LLM 节点 + 一个 tool 节点 = 2 hops）。需在 apply 时验证等价值并对齐。
3. **`tool_calls` 表 schema** —— 现表记单个 toolCall。若 §4.4 并行工具决策落地，单条 message 可关联多 toolCall，schema 不变（已是 1:N）。
4. **Cancel 后 thread 清理策略** —— 用户 cancel 后是否立即清 checkpointer 中该 thread 状态？倾向保留 24h 供"重连"，过期再清；放 plan 阶段定。

---
