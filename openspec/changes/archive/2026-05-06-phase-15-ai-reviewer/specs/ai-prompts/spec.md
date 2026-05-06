## ADDED Requirements

### Requirement: Prompt 模板模型
`electron/ai/prompts/` 下每个 prompt MUST 导出：
```ts
export const <name> = {
  schema: JSONSchema,                  // chatJson 用
  render(vars): { system: string; user: string };
};
```
`render` MUST 纯函数；输入变量，输出字符串，禁止内部 IO。

#### Scenario: review-clip 模板存在
- **WHEN** 导入 `prompts/review-clip.ts`
- **THEN** 模块导出 `{ schema, render }`；render 接收 `{ title, url, body }`；返回 `{ system, user }`

### Requirement: review-clip schema
`review-clip.schema` MUST 定义 `AiReviewResult`：
- `summary`: string（非空）
- `suggestedTitle`: string（非空）
- `tags`: string[]（3-8 元素；每个为 kebab-case）
- `keyQuotes`: string[]（1-3 元素）

Ajv MUST 能 validate 该 schema。

#### Scenario: validate 通过
- **WHEN** data = `{ summary:'s', suggestedTitle:'t', tags:['a','b','c'], keyQuotes:['q'] }`
- **THEN** Ajv.validate(schema, data) === true

#### Scenario: tags 数量不达标
- **WHEN** data.tags.length < 3
- **THEN** validate === false；error 信息含 "tags"

### Requirement: body 截断
`review-clip.render` MUST 把 body 截首 16000 字符（以字符为单位，非 token），避免 prompt 过长；截断时在末尾加 `...(内容过长已截断)` 标记。

#### Scenario: 超长 body
- **WHEN** body.length = 50000
- **THEN** render 后 user prompt 中 body 部分 ≤ 16100 字符（含截断标记）；未截断时不添加标记

### Requirement: 输出语言与风格约束
`review-clip` 的 system prompt MUST 明确：
- 输出必须是严格 JSON 对象，不要 markdown code fence，不要解释文字
- summary 使用原文主语言
- tags 使用 kebab-case 英文

#### Scenario: system prompt 校验
- **WHEN** `reviewClip.render({...}).system` 被读取
- **THEN** 字符串含 "严格的 JSON" / "kebab-case" / "不要包含任何额外文本" 等约束表述
