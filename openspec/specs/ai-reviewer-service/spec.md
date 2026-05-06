# ai-reviewer-service Specification

## Purpose
AI 审读服务。提供 `reviewClip` 核心逻辑，以及 queue handler 和手动触发 IPC。

## Requirements

### Requirement: reviewClip 服务
`electron/ai/reviewer.ts` SHALL 暴露 `reviewClip(clipId: number, opts?: { force?: boolean }) → Promise<AiReviewResult>`：
- 读 clips 行；不存在 → 抛 `E_CLIP_NOT_FOUND`
- 读 md 文件（path 经 safeResolve 沙箱）；不存在 → 抛 `E_FILE_NOT_FOUND`
- 若 frontmatter.ai_reviewed_at 存在 且 `!opts.force` → 返回现有 AI 字段（从 frontmatter 读出打包为 AiReviewResult）
- 否则调 `llmClient.chatJson({ ...reviewClip.render({...}), schema: reviewClip.schema })`
- 结果写回：`file.write(clipPath, { body, frontmatter: { ...原, ai_summary, ai_suggested_title, ai_tags, ai_key_quotes, ai_reviewed_at } }, { expectedMtime })`
- 写回遇 `E_MTIME_CONFLICT` → 抛同名错误；调用方（handler）决定重试/放弃

#### Scenario: 正常审读
- **WHEN** clipId=1 对应 md 无 ai_reviewed_at，且 defaultProfileId 存在
- **THEN** 调 LLM → 得到 data → 写回 md 的 frontmatter；返回 AiReviewResult

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

### Requirement: reviewer handler
`electron/queue/handlers/ai-review-clip.ts` SHALL 注册到 runner：
- 从 job.payload 取 `{ clipId, path, force? }`
- 调 `reviewer.reviewClip(clipId, { force })`
- 失败映射（`llm-client` 的错误码）：
  - `E_MISSING_PROFILE` / `E_CONFIG` / `E_AUTH` / `E_CLIP_NOT_FOUND` / `E_FILE_NOT_FOUND` → `{ kind: 'fail', error: code }`
  - `E_RATE` → `{ kind: 'retry', delayMs: 60_000, reason: 'rate-limited' }`
  - `E_NETWORK` / `E_SERVER` / `E_RESPONSE` / `E_UNKNOWN` → `{ kind: 'retry', delayMs: nextDelay(attempts), reason: code }`
  - `E_MTIME_CONFLICT` → `{ kind: 'retry', delayMs: 10 * 60_000, reason: 'mtime-conflict' }`

成功后同时写 ai_usage。

#### Scenario: 成功
- **WHEN** handler 正常完成
- **THEN** 返回 `{ kind:'ok' }`；ai_usage 表新增一行 `ok=1`

#### Scenario: 鉴权失败
- **WHEN** provider 返回 401
- **THEN** handler 返回 `{ kind:'fail', error:'E_AUTH' }`；ai_usage 新增一行 `ok=0, error='E_AUTH'`

#### Scenario: 速率限制重试
- **WHEN** provider 返回 429
- **THEN** handler 返回 `{ kind:'retry', delayMs:60_000 }`；job attempts+=1

### Requirement: 手动触发重审 IPC
系统 SHALL 暴露 `ai.reviewClip(clipId, { force: true }) → { jobId }` IPC，入队一个 `ai-review-clip` job，payload 含 `force: true`。dedupe key MUST 用 `clip:${clipId}:force:${ts}`（不与普通 dedupe 冲突）；允许用户多次强制重审。

#### Scenario: 强制重审
- **WHEN** 用户在 AI 抽屉点"重新审读"
- **THEN** IPC 返回新 jobId；jobs 表新增一条 pending；runner 拾取后覆写 frontmatter
