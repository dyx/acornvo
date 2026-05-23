## MODIFIED Requirements

### Requirement: 记录 API

`ai_usage` store SHALL 提供 `insert(row)`，调用者在每次 LLM 请求完成后（成功或失败均要）写入。usage 字段来源由 LangChain `AIMessage.usage_metadata` 提供：

- `input_tokens` → 入库 `prompt_tokens`
- `output_tokens` → 入库 `completion_tokens`
- `total_tokens` → 仅作校验，不单独入库（schema 不变）

`electron/ai/usage.ts` SHALL 暴露 `recordUsage({ sessionId?, profileId, model, message, latencyMs, ok, error?, jobId? })` 适配器：从 `AIMessage.usage_metadata` 提取 token 数；缺失（某些 provider / 错误路径）时填 null；调 `aiUsage.insert(...)`。

成功路径：

- `ok=1, error=null`
- `prompt_tokens / completion_tokens / latency_ms` 真实值（usage_metadata 缺失时填 null）

失败路径：

- `ok=0, error=<LlmErrorCode>`
- tokens 可为 null，latency_ms 仍记

#### Scenario: 成功调用记录（agent 上下文）

- **WHEN** runner 完成一次 LLM 调用，AIMessage.usage_metadata={ input_tokens:1234, output_tokens:456 }，sessionId='abc'
- **THEN** ai_usage 新增 `{ ok:1, prompt_tokens:1234, completion_tokens:456, latency_ms≈4200, session_id:'abc' }`

#### Scenario: 成功调用记录（reviewer 上下文）

- **WHEN** reviewer 完成 withStructuredOutput 调用
- **THEN** ai_usage 新增一行，session_id=null（非 agent 上下文）；其他字段同上

#### Scenario: 失败调用记录

- **WHEN** reviewer 因 429 失败，normalizeLLMError 返回 E_RATE
- **THEN** ai_usage 新增一行 `{ ok:0, error:'E_RATE', latency_ms:<short> }`

#### Scenario: usage_metadata 缺失

- **WHEN** 某 provider 未返回 usage_metadata（旧模型 / fallback 路径）
- **THEN** ai_usage 行 `prompt_tokens` 与 `completion_tokens` 为 null；ok=1 仍记录
