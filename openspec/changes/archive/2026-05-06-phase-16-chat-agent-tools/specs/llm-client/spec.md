## MODIFIED Requirements

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
