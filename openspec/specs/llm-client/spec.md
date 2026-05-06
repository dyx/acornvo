# llm-client Specification

## Purpose
统一 LLM 客户端抽象。根据 profile 的 provider 分派到具体实现（OpenAI / Anthropic / Ollama / OpenAI-compatible），提供 chat 和 chatJson 接口，统一错误归一化和超时控制。

## Requirements

### Requirement: Provider 抽象
`electron/ai/client.ts` SHALL 暴露 `llmClient`：
- `chat({ profileId, messages, model?, temperature?, maxTokens?, signal? }) → Promise<{ text, usage? }>`
- `chatJson({ profileId, messages, schema, ... }) → Promise<{ data, usage? }>`
- `chatWithTools(opts) → Promise<ChatWithToolsResult>`（phase 16 新增，详见 llm-tool-use 规格）
- `chatStream(opts)`：`chat` 的流式版本；通过 `onToken` 回调消费

内部 SHALL 根据 profile.provider 分派到具体 provider 实现（`openai` / `anthropic` / `ollama` / `openai-compatible`）。`profileId` 默认取 `settings.ai.defaultProfileId`。

#### Scenario: 用默认 profile 调 chat
- **WHEN** 调 `llmClient.chat({ messages: [...] })` 且未传 profileId
- **THEN** 读 `settings.ai.defaultProfileId`，用该 profile 构造请求

#### Scenario: 未设默认 profile
- **WHEN** `settings.ai.defaultProfileId === null` 且未传 profileId
- **THEN** 抛 `E_MISSING_PROFILE`

#### Scenario: provider 分派
- **WHEN** profile.provider='openai'
- **THEN** 调 `POST ${baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`；Authorization: `Bearer ${decryptedKey}`

#### Scenario: 调用 chatWithTools
- **WHEN** 调 `chatWithTools({ messages, tools })`
- **THEN** 按 profile.provider 转换 tools → 发起请求 → 解析响应 → 返回 `ChatWithToolsResult`（见 llm-tool-use 规格）

#### Scenario: 流式调用
- **WHEN** 调 `chatStream({ messages, onToken })`
- **THEN** 使用 provider 流式接口；每个 token chunk 触发 onToken；最终返回聚合 text

### Requirement: Anthropic provider
当 profile.provider='anthropic' 时 llmClient SHALL 构造符合 Anthropic Messages API 的请求：
- `POST ${baseUrl ?? 'https://api.anthropic.com'}/v1/messages`
- header: `x-api-key: ${decryptedKey}`、`anthropic-version: 2023-06-01`
- body: `{ model, max_tokens, temperature, system, messages }`（把 `role: 'system'` 提到 system 字段）
- 响应的 `content[].text` 拼接为 text

#### Scenario: system 提取
- **WHEN** 请求 messages 含 `{role:'system', content: 'S'}, {role:'user', content:'U'}`
- **THEN** Anthropic body 为 `{ system: 'S', messages: [{role:'user', content:'U'}] }`

### Requirement: Ollama provider
profile.provider='ollama' 时 SHALL 调 `POST ${baseUrl ?? 'http://localhost:11434'}/api/chat`，body `{ model, messages, stream: false, options: { temperature, num_predict: maxTokens } }`。chatJson 时追加 `format: 'json'`。

#### Scenario: 本地 ollama
- **WHEN** profile 无 apiKeyRef，provider='ollama'
- **THEN** 请求无 Authorization header；其他字段按 Ollama 约定

### Requirement: openai-compatible
profile.provider='openai-compatible' 时 baseUrl MUST 非空；其余与 openai 相同。

#### Scenario: baseUrl 缺失
- **WHEN** provider='openai-compatible' 但 profile.baseUrl 为空
- **THEN** 抛 `E_CONFIG`

### Requirement: chatJson 解析鲁棒
`chatJson` SHALL 按以下顺序尝试把 LLM 文本解析为 JSON：
1. strip markdown code fence（`` ```json `` 或 `` ``` ``）
2. 直接 `JSON.parse(trimmed)`
3. 失败则正则抽取 `\{[\s\S]*\}`；对最长括号平衡子串再 `JSON.parse`
4. Ajv 按传入 schema validate；通过才返回 data

全部失败 → 抛 `E_RESPONSE`，error.message 含 "invalid JSON from LLM"。

#### Scenario: 带 code fence
- **WHEN** LLM 返回 ` ```json\n{"a":1}\n``` `
- **THEN** chatJson 解析成功，data = `{a:1}`

#### Scenario: 前后有解释文字
- **WHEN** LLM 返回 `这是你的结果:\n{"a":1}\n谢谢`
- **THEN** 正则抽取 `{"a":1}` 解析成功

#### Scenario: schema 不匹配
- **WHEN** LLM 返回 `{"b":2}` 但 schema require `a`
- **THEN** Ajv validate 失败；抛 `E_RESPONSE`

### Requirement: 错误归一化
llmClient SHALL 捕获所有底层异常并映射到以下错误码：
- 401/403 → `E_AUTH`
- 429 → `E_RATE`
- 5xx → `E_SERVER`
- fetch TypeError / AbortError timeout → `E_NETWORK`
- 解析失败 → `E_RESPONSE`
- 配置缺失 → `E_CONFIG`（含 `E_MISSING_PROFILE`）
- 其他 → `E_UNKNOWN`

错误对象 MUST 含 `{ code, message, httpStatus?, providerMessage? }`。

#### Scenario: 401 映射
- **WHEN** OpenAI 返回 HTTP 401
- **THEN** llmClient 抛 `{ code: 'E_AUTH', httpStatus: 401, providerMessage: ... }`

#### Scenario: 超时
- **WHEN** fetch 超过 60s 未响应
- **THEN** 触发 AbortController；抛 `{ code: 'E_NETWORK', message: 'timeout' }`

### Requirement: 请求超时
llmClient SHALL 对每次请求使用 AbortController + `setTimeout`，默认 60000ms 超时。调用方可传 `signal` 覆盖。

#### Scenario: 默认 60s 超时
- **WHEN** 调 `chat` 未传 signal
- **THEN** 60s 到达时 fetch 被 abort；抛 `E_NETWORK`

### Requirement: key 仅在 main 解密
llmClient SHALL 通过 `getProfileDecryptedKey(profileId)`（phase 13）获取明文 key，仅在 main 进程内使用；MUST NOT 通过 IPC 把 key 传递到 renderer。

#### Scenario: renderer 无法获取 key
- **WHEN** renderer 代码查看任何 IPC payload
- **THEN** payload 中永远不包含明文 apiKey（即便 chat 响应）
