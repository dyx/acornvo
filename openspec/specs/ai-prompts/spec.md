# ai-prompts Specification

## Purpose
Prompt 模板系统。`electron/ai/prompts/` 下每个 prompt 导出 schema 与 render 函数，用于构造 LLM 请求。
## Requirements
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

### Requirement: body 截断
`review-clip.render` MUST 把 body 截首 16000 字符（以字符为单位，非 token），避免 prompt 过长；截断时在末尾加 `...(内容过长已截断)` 标记。

#### Scenario: 超长 body
- **WHEN** body.length = 50000
- **THEN** render 后 user prompt 中 body 部分 ≤ 16100 字符（含截断标记）；未截断时不添加标记

