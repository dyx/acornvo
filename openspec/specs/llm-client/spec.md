# llm-client Specification

## Purpose
统一 LLM 客户端抽象。根据 profile 的 provider 分派到具体实现（OpenAI / Anthropic / Ollama / OpenAI-compatible），提供 chat 和 chatJson 接口，统一错误归一化和超时控制。
## Requirements
### Requirement: Provider 抽象
`electron/ai/model-factory.ts` SHALL 暴露 `buildChatModel(profile): BaseChatModel`：
- 根据 `profile.provider` 构造对应 `@langchain/*` 的 `ChatXxx` 实例（`ChatOpenAI` / `ChatAnthropic` / `ChatOllama`）
- `openai-compatible` 走 `ChatOpenAI` 并设 `configuration.baseURL`
- `apiKey` 通过 `getProfileDecryptedKey(profileId)` 在 main 进程内获取明文，MUST NOT 经 IPC 传到 renderer
- 同一 profile 在未变更时 SHALL 复用缓存的 model 实例（LRU，max=8）
- profile 更新时 `settings-effects` SHALL invalidate 缓存条目（按 `p.id` 前缀清除）

调用方（reviewer / agent runner）通过 `model.invoke(...)`、`model.stream(...)`、`model.withStructuredOutput(zod)` 使用，**不再有** `llmClient.chat` / `chatJson` / `chatStream` / `chatWithTools` 等顶层 API。

#### Scenario: 用默认 profile 构造 model
- **WHEN** 调 `buildChatModel(profile)` 且 profile.provider='openai'
- **THEN** 返回 `ChatOpenAI` 实例，model/apiKey/temperature/maxTokens/baseURL 与 profile 对齐

#### Scenario: 未设默认 profile
- **WHEN** 上层（reviewer 或 runner）在 `settings.ai.defaultProfileId === null` 时尝试调用
- **THEN** 调用方在 buildChatModel 之前抛 `E_MISSING_PROFILE`

#### Scenario: 缓存命中
- **WHEN** 连续两次以同 profile 调 buildChatModel
- **THEN** 第二次返回与第一次相同的 model 实例引用

#### Scenario: profile 更新后缓存失效
- **WHEN** 用户在 settings 修改 profile 的 apiKey 或 model；`settings-effects` 触发缓存清除
- **THEN** 下次 buildChatModel 返回新构造的 model 实例

### Requirement: Anthropic provider
当 profile.provider='anthropic' 时 `buildChatModel` SHALL 构造 `ChatAnthropic({ model, apiKey, temperature, maxTokens })`，`@langchain/anthropic` 内部负责 system 字段提取、Messages API 调用、错误处理与 SSE 流式解析。系统 MUST NOT 自写 HTTP 请求或 SSE 解析。

#### Scenario: Anthropic 构造
- **WHEN** profile.provider='anthropic'，apiKey='sk-ant-xxx'
- **THEN** `new ChatAnthropic({ ... })` 被构造；后续 invoke/stream 自动按 Anthropic API 工作

### Requirement: Ollama provider
profile.provider='ollama' 时 `buildChatModel` SHALL 构造 `ChatOllama({ model, baseUrl: profile.baseUrl ?? 'http://localhost:11434', temperature, numPredict: maxTokens })`。

#### Scenario: 本地 ollama
- **WHEN** profile 无 apiKeyRef，provider='ollama'，baseUrl=null
- **THEN** ChatOllama 默认使用 http://localhost:11434

### Requirement: openai-compatible
profile.provider='openai-compatible' 时 profile.baseUrl MUST 非空；`buildChatModel` SHALL 构造 `ChatOpenAI({ ..., configuration: { baseURL: profile.baseUrl } })`。

#### Scenario: baseUrl 缺失
- **WHEN** provider='openai-compatible' 但 profile.baseUrl 为空
- **THEN** 上层在 buildChatModel 之前抛 `E_CONFIG`

### Requirement: 错误归一化
`electron/ai/normalize-errors.ts` SHALL 暴露 `normalizeLLMError(err): LlmError & Error`，覆盖：
- `AbortError` → 透传（runner emit `canceled`）
- LangChain provider 错误（`AuthenticationError` / `RateLimitError` / `APIError`）→ `E_AUTH` / `E_RATE` / `E_SERVER`
- HTTP status 兜底：401/403 → `E_AUTH`；429 → `E_RATE`；≥500 → `E_SERVER`；fetch TypeError → `E_NETWORK`
- Zod / structured-output 解析失败 → `E_RESPONSE`
- 配置缺失 → `E_CONFIG`（含 `E_MISSING_PROFILE`）
- 未知 → `E_UNKNOWN`

错误对象 MUST 含 `{ code, message, httpStatus?, providerMessage? }`。所有 IPC 出口仍返回 `LlmErrorCode` 字符串。

#### Scenario: 401 映射
- **WHEN** OpenAI 返回 HTTP 401，LangChain 抛 `AuthenticationError`
- **THEN** normalizeLLMError 返回 `{ code: 'E_AUTH', httpStatus: 401, providerMessage: ... }`

#### Scenario: 速率限制
- **WHEN** Anthropic 抛 `RateLimitError`
- **THEN** 归一化为 `{ code: 'E_RATE' }`

#### Scenario: 网络超时
- **WHEN** fetch 抛 TypeError 或 AbortError 含 'timeout'
- **THEN** 归一化为 `{ code: 'E_NETWORK' }`

### Requirement: 请求超时
调用方 SHALL 通过 `model.invoke(messages, { signal })` 或在 model 构造时设 `requestTimeoutMs` 控制超时（默认 60000ms 与现行行为一致）。系统 MUST NOT 自写 `AbortController + setTimeout`。

#### Scenario: 默认 60s 超时
- **WHEN** 调用方未传 signal 且 model 默认 timeout=60000
- **THEN** LangChain 内部 60s 到达时 abort；抛错被 normalize-errors 映射为 `E_NETWORK`

### Requirement: key 仅在 main 解密
`buildChatModel` SHALL 通过 `getProfileDecryptedKey(profileId)` 获取明文 key，仅在 main 进程内使用；MUST NOT 通过 IPC 把 key 传到 renderer。

#### Scenario: renderer 无法获取 key
- **WHEN** renderer 代码查看任何 IPC payload
- **THEN** payload 中永远不包含明文 apiKey

### Requirement: 结构化输出（替代 chatJson）
需要 JSON 结果的调用方（reviewer 等）SHALL 使用 `buildChatModel(profile).withStructuredOutput(zodSchema).invoke(messages)`。该路径由 LangChain 内部完成：
- provider 原生 JSON / tools 模式（若支持）
- Zod 自动校验
- 失败时抛 LangChain 解析异常 → 由 `normalize-errors` 映射为 `E_RESPONSE`

系统 MUST NOT 自写 markdown code fence 剥离、正则抽取或 Ajv 校验链路。

#### Scenario: 结构化输出成功
- **WHEN** 调 `.withStructuredOutput(AiReviewSchema).invoke(messages)`，LLM 返回合法对象
- **THEN** 返回 Zod 解析后的对象；类型与 schema 对齐

#### Scenario: 结构化输出解析失败
- **WHEN** LLM 返回不可解析或缺字段的对象
- **THEN** LangChain 抛解析异常；normalize-errors 映射为 `{ code: 'E_RESPONSE' }`

