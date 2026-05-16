## 1. 依赖与脚手架

- [x] 1.1 在 package.json 添加 `langchain`、`@langchain/core`、`@langchain/openai`、`@langchain/anthropic`、`@langchain/ollama`、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-sqlite`；锁版本
- [x] 1.2 在 package.json 移除（AI 链路中的）`eventsource-parser`；保留 `ajv` 给业务别处使用，但确认 AI 链路不再 import
- [x] 1.3 `pnpm install` 并提交 lockfile；验证 Electron 打包不破

## 2. Model Factory（block 1）

- [x] 2.1 新建 `electron/ai/model-factory.ts`：实现 `buildChatModel(profile)`，覆盖 openai / openai-compatible / anthropic / ollama 四个分支
- [x] 2.2 实现 LRU 缓存（max=8），key 含 `id::provider::model::baseUrl::apiKeyHash`
- [x] 2.3 在 `settings-effects` 中接入缓存失效（profile 更新时按 `p.id` 前缀清除）
- [x] 2.4 写 `electron/ai/model-factory.test.ts`：覆盖四个 provider 构造正确性、baseURL/apiKey/temperature 传递、缓存命中、profile 更新后失效

## 3. 错误归一化（block 1）

- [x] 3.1 新建 `electron/ai/normalize-errors.ts`：实现 `normalizeLLMError(err)`，覆盖 AbortError 透传、LangChain provider 错误、HTTP status 兜底、Zod 解析失败、未知
- [x] 3.2 写 `electron/ai/normalize-errors.test.ts`：每种错误类型至少一个用例

## 4. Reviewer 切换（block 2）

- [x] 4.1 把 `electron/ai/prompts/review-clip.ts` 的 schema 改写为 Zod；render 仍返回 `{ system, user }`
- [x] 4.2 重写 `electron/ai/reviewer.ts`：用 `buildChatModel(profile).withStructuredOutput(AiReviewSchema).invoke(messages)`；保留 frontmatter 写回、mtime 校验、`E_*` 错误码语义；catch 走 `normalizeLLMError`
- [x] 4.3 改写 `electron/ai/reviewer.test.ts`：mock `BaseChatModel.withStructuredOutput`；保留原行为对等表；删除 markdown 剥离、Ajv 校验相关测试
- [x] 4.4 删除 `electron/ai/parse-json.ts` + `parse-json.test.ts`
- [x] 4.5 调整 `electron/queue/handlers/ai-review-clip.ts`：错误映射改为消费 `normalizeLLMError` 输出；行为不变

## 5. 工具重写（block 3）

- [x] 5.1 重写 `electron/agent/tools/search-files.ts` 为 `tool(fn, { name, description, schema: z.object(...) })`；execute 内含路径/参数限制逻辑
- [x] 5.2 重写 `electron/agent/tools/read-file.ts`：Zod schema + 内嵌 `safeResolve` + 60000 字截断
- [x] 5.3 重写 `electron/agent/tools/list-tags.ts`：Zod schema + 上限裁剪
- [x] 5.4 重写 `electron/agent/tools/update-frontmatter.ts`：Zod schema（含 `reason: z.string().min(1)`）+ 内嵌 `safeResolve` + null 删字段语义
- [x] 5.5 重写 `electron/agent/tools/clip-summary.ts`：Zod schema + 调 reviewer
- [x] 5.6 新建 `electron/agent/tools/index.ts` 导出 5 个工具数组
- [x] 5.7 删除 `electron/agent/registry.ts` + `registry.test.ts`
- [x] 5.8 删除 `electron/ai/parse-tool-args.ts` + 单测
- [x] 5.9 工具单元测试：每个工具的核心场景（成功、错误码、路径越狱、schema 校验失败）

## 6. Agent Runner + Stream Translator（block 4）

- [x] 6.1 扩 `shared/agent-types.ts`：`tool.start` 与 `tool.result` 事件类型添加可选 `callId?: string` 字段（K1 例外清单第 2 条，供 phase-20 `bubbleSelectors` 按 callId 折叠工具调用与结果用）；新建 `electron/agent/stream-translator.ts` 实现 LangGraph 事件 → AgentEvent 的 8 个映射场景（见 design.md 表，含 `tool.start.callId` = `AIMessage.tool_calls[i].id`、`tool.result.callId` = `ToolMessage.tool_call_id` 的透传）；含 AIMessage.id 幂等去重 helper
- [x] 6.2 写 `electron/agent/stream-translator.test.ts`：覆盖全部 8 个映射场景
- [x] 6.3 新建 `electron/agent/runner.ts`：实现 `runAgent`；调 `agent.stream({ messages: [完整历史] }, { configurable: { thread_id }, streamMode: ['updates','messages'], signal })`；attachments 注入 pre-user message；persistence 通过 stream-translator 回调写 session_messages / tool_calls
- [x] 6.4 在 `electron/ai/prompts/chat-agent.ts` 把导出从 `{ role:'system', content }` 改为 `systemPrompt: string`；其他调用方调整
- [x] 6.5 在应用启动阶段构造 `createAgent({ model, tools, middleware: [hitl], checkpointer })` 单例（hitl 与 checkpointer 在 block 5 接入；本 block 暂传 noop placeholder）
- [x] 6.6 IPC 入口 `agent.send` 切到 runner；保留 `loop.ts` 作 fallback flag（feature flag 默认开新 runner）
- [x] 6.7 写 `electron/agent/runner.test.ts`：mock `agent.stream` 返回 async iterable；断言事件序列与 K1 契约
- [x] 6.8 跑现有 `electron/__acceptance__/*` chat 用例：要求 100% 通过且 mock 表面不改

## 7. HITL + Checkpointer（block 5）

- [x] 7.1 新建 migration `electron/db/migrations/002_langgraph_checkpoints.sql`：显式登记 `checkpoints` / `checkpoint_writes` / `checkpoint_blobs` 3 张表
- [x] 7.2 注册 migration 并提升 `user_version`；确认现有 sessions / session_messages / tool_calls 不受影响
- [x] 7.3 在 `electron/agent/runner.ts` 中实例化 `SqliteSaver` 单例并注入 `createAgent({ checkpointer })`
- [x] 7.4 构造 `humanInTheLoopMiddleware({ interruptOn: { update_frontmatter: { allowAccept, allowEdit, allowReject } } })` 并注入 middleware 数组
- [x] 7.5 把 IPC `agent.approve` / `agent.reject` 实现改为 `agent.invoke(new Command({ resume: { decisions: [...] } }), { configurable: { thread_id } })`；保持外部签名不变
- [x] 7.6 在 stream-translator 中实现 `__interrupt__` → `tool.approval-needed` 映射，callId 取 interrupt id
- [x] 7.7 新增 `agent.cancel` 行为：abort signal + 不立即清 thread；标记 thread last-active-at 用于 24h 清理
- [x] 7.8 新增启动恢复钩子：在 `app-lifecycle` 启动阶段扫描未 resolve 的 interrupt 并重 emit `tool.approval-needed`
- [x] 7.9 在 `chat.deleteSession` 中加入级联删除 checkpointer 3 张表 `thread_id = sessionId` 行（同事务）
- [x] 7.10 新增后台 24h 清理任务（job-queue 或定时器，按 design open question 4 实施时决定）
- [x] 7.11 重写 `electron/agent/approval.test.ts`：测 HITL 4 种 decision（approve / edit / reject / cancel）+ 启动恢复
- [x] 7.12 新增 `electron/agent/checkpointer-recovery.test.ts`：模拟挂起 interrupt 重启后被重 emit

## 8. Usage 适配（穿插 block 2/4）

- [x] 8.1 把 `electron/ai/usage.ts` 改为从 `AIMessage.usage_metadata`（input_tokens / output_tokens）提取 token 数
- [x] 8.2 reviewer 与 runner 在每次 LLM 调用完成后调 `recordUsage(...)`；失败路径仍写 ok=0 行
- [x] 8.3 调整 `electron/ai/usage.test.ts`：input 改为 mock AIMessage；聚合断言不变

## 9. 清理（block 6）

- [x] 9.1 删除 `electron/ai/providers/openai.ts` + 单测
- [x] 9.2 删除 `electron/ai/providers/anthropic.ts` + 单测
- [x] 9.3 删除 `electron/ai/providers/ollama.ts` + 单测
- [x] 9.4 删除 `electron/ai/providers/openai-compatible.ts` + 单测
- [x] 9.5 删除 `electron/ai/client.ts`（功能已迁到 model-factory）
- [x] 9.6 删除 `electron/agent/loop.ts`（功能已迁到 runner）
- [x] 9.7 删除 `electron/agent/approval.ts`（功能已迁到 HITL middleware）
- [x] 9.8 删除 `electron/agent/loop.test.ts`（被 runner.test.ts 替代）
- [x] 9.9 grep 确认无任何文件仍 import 已删除模块
- [x] 9.10 在 acceptance 套件中确认所有 chat 用例仍 100% 通过

## 10. 文档与发布

- [x] 10.1 更新 README 或 docs 中提及 AI 链路实现的段落
- [x] 10.2 撰写 release note：说明并行工具调用行为差异、HITL 重启恢复新能力、step.warning 事件不再触发
- [x] 10.3 跑全套 `pnpm test` + acceptance：全绿
- [x] 10.4 在 OpenSpec 中 verify + archive 本 change
