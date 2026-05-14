## MODIFIED Requirements

### Requirement: Prompt 模板模型
`electron/ai/prompts/` 下每个 prompt MUST 导出符合以下任一签名的模板：

**review-clip 风格（结构化输出）**：
```ts
export const reviewClip = {
  schema: ZodSchema,                  // 给 withStructuredOutput 用
  render(vars): { system: string; user: string };
};
```

**chat-agent 风格（系统提示，传 createAgent）**：
```ts
export const chatAgent = {
  systemPrompt: string,               // 直接字符串，传给 createAgent({ systemPrompt })
};
```

`render` MUST 纯函数；输入变量，输出字符串，禁止内部 IO。

#### Scenario: review-clip 模板存在
- **WHEN** 导入 `prompts/review-clip.ts`
- **THEN** 模块导出 `{ schema, render }`；schema 为 Zod；render 接收 `{ title, url, body }`；返回 `{ system, user }`

#### Scenario: chat-agent 模板导出 string
- **WHEN** 导入 `prompts/chat-agent.ts`
- **THEN** 模块导出 `systemPrompt: string`（而非 `{ role: 'system', content }` 对象）；可直接传给 `createAgent({ systemPrompt })`

### Requirement: review-clip schema
`review-clip.schema` MUST 是 Zod schema，对应 `AiReviewResult`：
- `summary`: `z.string().min(1)`
- `suggestedTitle`: `z.string().min(1)`
- `tags`: `z.array(z.string()).min(3).max(8)`（每个元素为 kebab-case 英文）
- `keyQuotes`: `z.array(z.string()).min(1).max(3)`

Zod MUST 能 validate / parse 该 schema；与原 JSON Schema 在字段约束上等价。

#### Scenario: validate 通过
- **WHEN** data = `{ summary:'s', suggestedTitle:'t', tags:['a','b','c'], keyQuotes:['q'] }`
- **THEN** `schema.safeParse(data).success === true`

#### Scenario: tags 数量不达标
- **WHEN** data.tags.length < 3
- **THEN** `safeParse` 失败；error.issues 含 "tags" 路径

## REMOVED Requirements

### Requirement: 输出语言与风格约束
**Reason**: 该 system prompt 原文约束（"严格 JSON" / "不要 markdown code fence"）针对手写 chatJson 解析而存在。改用 `withStructuredOutput(zod)` 后 LangChain 自动让 LLM 走 provider 原生 JSON / tools 模式，模型已无机会输出 code fence 或额外文字。
**Migration**: review-clip system prompt 保留语言（"summary 使用原文主语言"）与风格（"tags 使用 kebab-case 英文"）约束；去掉关于 JSON 严格性与 code fence 的描述。结构化输出由 schema + LangChain 保证。
