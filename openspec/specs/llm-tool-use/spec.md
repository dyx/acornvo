## Purpose
Spec for llm-tool-use capability.

## Requirements

### Requirement: chatWithTools 接口
`llmClient` SHALL 新增 `chatWithTools(opts): Promise<ChatWithToolsResult>`：

```ts
opts: {
  profileId?: string;
  messages: Message[];
  tools: ToolDef[];           // registry.openApiDefinitions()（内部自动按 provider 转换）
  stream?: boolean;           // true 时同步启用 SSE 流
  onToken?: (text: string) => void;
  onToolCall?: (tc: { id, name, args }) => void;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

ChatWithToolsResult: {
  text?: string;
  toolCalls: { id: string; name: string; args: any }[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: { promptTokens: number; completionTokens: number; model: string };
}
```

#### Scenario: OpenAI tools
- **WHEN** profile.provider='openai'，调 chatWithTools 传 tools 与 messages
- **THEN** 请求体含 `tools`、`tool_choice:'auto'`；若模型返回 tool_calls → 解析为统一 `{ id, name, args }` 结构；finishReason='tool_calls'

#### Scenario: Anthropic tools
- **WHEN** profile.provider='anthropic'
- **THEN** 请求体含 `tools` 数组；response `content[]` 中的 `tool_use` 项被解析为 toolCalls；其余 type='text' 连成 text

#### Scenario: 普通回答
- **WHEN** LLM 没有调用工具
- **THEN** toolCalls=[]；finishReason='stop'；text 非空

### Requirement: 流式文本
当 `stream: true` 时 llmClient SHALL 使用 SSE（或 provider 对应流式协议）解析增量 token 并调用 `onToken(text)`；最终聚合 text 供返回。

`eventsource-parser` 或等效解析 SHALL 处理 chunk 边界。

#### Scenario: OpenAI stream
- **WHEN** stream=true，OpenAI 返回 SSE
- **THEN** 每个 delta token 触发一次 onToken；结束时返回 ChatWithToolsResult

#### Scenario: stream 被 abort
- **WHEN** 外部 signal abort
- **THEN** 停止 fetch；丢弃未消费 chunk；抛 `E_NETWORK` 或使返回 Promise reject with AbortError

### Requirement: Ollama 无原生 tool 支持的 fallback
profile.provider='ollama' 时 llmClient SHALL 首选 Ollama 原生 tool format（如模型支持）；否则 fallback：
- 把 tools JSONSchema 串入 system prompt 末尾：`可用工具：...；若要调用，只输出一行 JSON {"tool": name, "args": {...}}`
- 解析 response：若首行是合法 JSON 且含 `tool` 字段 → 视为 toolCalls（id=UUID 生成）；否则视为普通 text

#### Scenario: Ollama 模型 tool fallback
- **WHEN** Ollama 模型不支持 tool 返回纯文本 `{"tool":"search_files","args":{"query":"x"}}`
- **THEN** chatWithTools 返回 `{ toolCalls: [{ id:<uuid>, name:'search_files', args:{query:'x'} }], finishReason:'tool_calls' }`

#### Scenario: Ollama 普通回复
- **WHEN** 响应是普通文本
- **THEN** toolCalls=[]，text=整段，finishReason='stop'

### Requirement: args 解析与 Ajv validate
对所有 provider 的 tool call args，llmClient SHALL 统一：
- 若 args 是 string（某些 provider 返回 JSON 字符串）→ `JSON.parse`
- 再用 tools[i].parameters 的 Ajv validator validate
- validate 失败 → 仍返回 toolCalls（让 agent loop 把错误塞回 LLM 以重试），但 result 的 `toolCalls[i].validationError` 字段填充 details

#### Scenario: JSON 字符串 args
- **WHEN** provider 返回 `args: "{\"query\":\"x\"}"`
- **THEN** llmClient 解析为对象

#### Scenario: validate 失败
- **WHEN** 缺 required 字段
- **THEN** toolCalls 含该项 + `validationError` 字段非空
