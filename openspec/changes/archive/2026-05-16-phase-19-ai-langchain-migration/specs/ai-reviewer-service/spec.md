## MODIFIED Requirements

### Requirement: reviewClip 服务

`electron/ai/reviewer.ts` SHALL 暴露 `reviewClip(clipId: number, opts?: { force?: boolean }) → Promise<AiReviewResult>`：

- 读 clips 行；不存在 → 抛 `E_CLIP_NOT_FOUND`
- 读 md 文件（path 经 safeResolve 沙箱）；不存在 → 抛 `E_FILE_NOT_FOUND`
- 若 frontmatter.ai_reviewed_at 存在 且 `!opts.force` → 返回现有 AI 字段（从 frontmatter 读出打包为 AiReviewResult）
- 否则调 `buildChatModel(profile).withStructuredOutput(AiReviewSchema).invoke(messages)`，其中：
  - `messages` 由 `reviewClip.render({ title, url, body })` 产出的 `{ system, user }` 拼装为 LangChain message 数组
  - `AiReviewSchema` 为 Zod schema，对应原 `AiReviewResult`
- 结果写回：`file.write(clipPath, { body, frontmatter: { ...原, ai_summary, ai_suggested_title, ai_tags, ai_key_quotes, ai_reviewed_at } }, { expectedMtime })`
- 写回遇 `E_MTIME_CONFLICT` → 抛同名错误；调用方（handler）决定重试/放弃
- 调用方 catch 中 SHALL 调 `normalizeLLMError(err)`；解析失败统一映射为 `E_RESPONSE`

实现 SHALL NOT 自写 markdown 代码块剥离、正则抽取或 Ajv 校验。

#### Scenario: 正常审读

- **WHEN** clipId=1 对应 md 无 ai_reviewed_at，且 defaultProfileId 存在
- **THEN** 调 `withStructuredOutput` → 得到 Zod 解析对象 → 写回 md 的 frontmatter；返回 AiReviewResult

#### Scenario: 已审读跳过（幂等）

- **WHEN** md 已含 ai_reviewed_at，且 force=false
- **THEN** 不调 LLM；返回 frontmatter 中读出的 AiReviewResult

#### Scenario: force 重做

- **WHEN** opts.force=true 且已有 ai_reviewed_at
- **THEN** 调 LLM 生成新结果；覆写 frontmatter；更新 ai_reviewed_at

#### Scenario: 缺 profile

- **WHEN** settings.ai.defaultProfileId = null
- **THEN** 抛 `E_MISSING_PROFILE`

#### Scenario: mtime 冲突

- **WHEN** 写回前发现磁盘 mtime ≠ stat 时读到的 mtime
- **THEN** 抛 `E_MTIME_CONFLICT`；调用方处理

#### Scenario: 结构化输出解析失败

- **WHEN** LLM 返回不可被 Zod 解析的输出
- **THEN** LangChain 抛 ZodError → `normalizeLLMError` 映射为 `E_RESPONSE`；handler 按现行重试策略处理
