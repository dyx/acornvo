## Context

前置：
- phase 4：`file.write(path, { body, frontmatter }, expectedMtime)` 原子写
- phase 7：编辑器页，能展示 frontmatter 右侧卡片
- phase 9：mtime 乐观锁 + 冲突快照
- phase 12：clips 表，含 path 与 excerpt
- phase 13：`ai_provider_profiles` + `getProfileDecryptedKey(id)` main-only
- phase 14：jobs runner 与 `ai-review-clip` kind 占位

## Goals / Non-Goals

**Goals:**
- 剪藏后 1-2 分钟内 AI 自动给出 summary / tags / suggestedTitle / keyQuotes，回写 frontmatter
- 用户在编辑器看到徽章 → 展开抽屉 → 一键接受建议（合并到 title 与 tags）
- provider 可切换：OpenAI / Anthropic / Ollama / 兼容 endpoint
- 调用有用量与失败日志

**Non-Goals:**
- 不做 embedding / 向量检索（phase 17 做）
- 不做 streaming 到 UI（reviewer 是后台任务，无需流式展示）
- 不做多 profile 并发比较（单次用默认 profile 即可）
- 不做 RAG（phase 17）
- 不做图像生成 / 音频
- 不做"用户修正训练数据"回路（用户拒绝 suggestion 只是拒绝，不收集）
- 不对 clips 以外的 md 做自动 AI review（比如 inbox 外的手写笔记；用户可手动触发 phase 16 再提供）

## Decisions

### D1: provider 抽象 — fetch 而非 SDK

```ts
interface LlmProvider {
  chat(opts: ChatOptions): Promise<{ text: string; usage?: TokenUsage }>;
  chatJson<T>(opts: ChatOptions & { schema: JSONSchema }): Promise<{ data: T; usage?: TokenUsage }>;
}
```

- 内部统一转 `{ messages: [{role, content}], model, temperature, maxTokens, responseFormat?: 'json' | 'text' }`
- 每个 provider 实现映射到其 REST API：
  - OpenAI `POST /v1/chat/completions` （response_format: json_object）
  - Anthropic `POST /v1/messages` （JSON 模式用 prompt 约束 + 解析兜底）
  - Ollama `POST /api/chat` （model + stream:false + format:'json'）
  - openai-compatible：用 openai 的实现 + 自定义 baseUrl
- 无 SDK：拒绝 `openai`/`anthropic` npm 依赖以控包体；用 `fetch`；错误归一化

**错误分类**：
- `E_CONFIG`：profile 缺失 / model 为空 / baseUrl 需但未填
- `E_AUTH`：401/403
- `E_RATE`：429 或 provider 特定速率错误
- `E_NETWORK`：fetch 抛 TypeError / timeout
- `E_SERVER`：5xx
- `E_RESPONSE`：响应无法解析 JSON 或 schema validate 失败
- `E_UNKNOWN`：其他

### D2: chatJson 的可靠性策略

LLM 生成 JSON 时常见问题：包裹 ` ```json `；文本前后多一句解释。

- **第一道防线**：prompt 里强调 "仅输出一个 JSON 对象，不要附加任何其他文字"
- **第二道**：对 OpenAI/Ollama 用 `response_format: { type: 'json_object' }`
- **第三道**：用 `parse` 函数先 strip code fence → 尝试 JSON.parse → 若失败再正则抽取 `\{[\s\S]*\}` → 再 parse
- **第四道**：用 Ajv validate schema；通过才返回 data
- 全失败 → throw `E_RESPONSE`

### D3: prompt 模板

`electron/ai/prompts/review-clip.ts`：
```ts
export const reviewClip = {
  schema: { /* JSON Schema for AiReviewResult */ },
  render: ({ title, url, body }: { title: string; url: string; body: string }) => ({
    system: [
      '你是一位博学的中英双语阅读助手。',
      '你将收到一篇文章，输出对它的结构化评注。',
      '输出必须是严格的 JSON 对象，匹配指定 schema，不要包含任何额外文本。'
    ].join('\n'),
    user: [
      `# 标题\n${title}`,
      `# 原始 URL\n${url}`,
      `# 正文（可能已被截断）\n${body.slice(0, 16_000)}`,
      '',
      '请生成：',
      '1. `summary`：150 字以内的摘要，用原文主语言（若原文中英混合则以中文为主）。',
      '2. `suggestedTitle`：一个更精炼、信息密度更高的标题（若原标题已足够好，可复用）。',
      '3. `tags`：3-8 个 kebab-case 英文短标签（如 "deep-learning", "transformer"）。',
      '4. `keyQuotes`：最重要的 1-3 句原文引用（保持原文语言）。',
      '',
      'JSON schema（自行遵守，勿输出 schema）：',
      '{ "summary": string, "suggestedTitle": string, "tags": string[], "keyQuotes": string[] }',
    ].join('\n')
  })
};
```

body 截首 16K（约 4000-5000 token，够大多数文章；极长文章会被截，acceptable）。

### D4: Reviewer handler 流程

```ts
async function aiReviewClipHandler({ payload, log }) {
  const { clipId, path } = payload;
  // 1. 读 clip + md
  const clip = await clips.getById(clipId);
  if (!clip) return { kind: 'fail', error: 'E_CLIP_NOT_FOUND' };
  const abs = path.join(vault.root, clip.path);
  const stat = await fs.stat(abs);
  const raw = await fs.readFile(abs, 'utf8');
  const { body, frontmatter } = parseFrontmatter(raw);
  // 2. 已审读过跳过（幂等）
  if (frontmatter.ai_reviewed_at) return { kind: 'ok' };
  // 3. 取 profile
  const profileId = settings.get('ai').defaultProfileId;
  if (!profileId) return { kind: 'fail', error: 'E_MISSING_PROFILE' };
  // 4. 调 LLM
  const { data, usage } = await llmClient.chatJson({
    profileId,
    ...reviewClip.render({ title: clip.title, url: clip.url, body }),
    schema: reviewClip.schema,
    maxTokens: 800,
  });
  // 5. 记录 usage
  await aiUsage.insert({ job_id, profile_id: profileId, model: profile.model, ...usage });
  // 6. 回写 frontmatter（mtime 乐观锁）
  const nextFrontmatter = {
    ...frontmatter,
    ai_summary: data.summary,
    ai_suggested_title: data.suggestedTitle,
    ai_tags: data.tags,
    ai_key_quotes: data.keyQuotes,
    ai_reviewed_at: new Date().toISOString(),
  };
  try {
    await fileWrite(clip.path, { body, frontmatter: nextFrontmatter }, { expectedMtime: stat.mtimeMs });
  } catch (e) {
    if (e.code === 'E_MTIME_CONFLICT') {
      // 用户/watcher 已修改 → 退避 10 分钟重试
      return { kind: 'retry', delayMs: 10 * 60_000, reason: 'E_MTIME_CONFLICT' };
    }
    throw e;
  }
  return { kind: 'ok' };
}
```

失败映射：
- `E_CONFIG` / `E_MISSING_PROFILE` → `fail`（永久）
- `E_AUTH` → `fail`（永久；重试无意义直到用户改配置）
- `E_RATE` → `retry(delayMs: 60_000)`
- `E_NETWORK` / `E_SERVER` / `E_RESPONSE` → `retry(nextDelay)`
- 其他 → `retry(nextDelay)`（默认）

### D5: ai_usage 表

```sql
CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,                       -- 可选，chat UI 也会写这里
  profile_id TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX idx_ai_usage_profile ON ai_usage(profile_id);
```

`ai.usage.summary({ sinceDays }) → { totalCalls, totalTokens, errorRate, byProvider }` IPC 供 phase 18 观察面板；本阶段只预埋，UI 可留到 phase 18。

### D6: Frontmatter 字段命名

前缀 `ai_` 避免与用户自己的字段冲突：
- `ai_summary`: string
- `ai_suggested_title`: string
- `ai_tags`: string[]
- `ai_key_quotes`: string[]
- `ai_reviewed_at`: ISO string
- `ai_review_accepted_at`: ISO string（用户接受后写入；用于 UI 判断徽章"未处理" vs "已接受"）

### D7: 编辑器 UI — 徽章与抽屉

- phase 7 的编辑器右上角 SHALL 在 frontmatter 含 `ai_reviewed_at` 时显示 `AI` 徽章
  - 未接受（无 `ai_review_accepted_at`）→ 紫色高亮
  - 已接受 → 灰色
- 点徽章 → 右侧抽屉（Drawer 400px 宽）：
  - 建议标题（可 copy 或 "用作新标题" 按钮）
  - 摘要
  - 标签 chips（可单独或一键合并）
  - key quotes 列表
  - 底部两个按钮："一键接受所有"（标题+标签） / "拒绝"
- "一键接受"：把 `title` 覆写（或合并）、把 `ai_tags` 合并进 `tags`、写 `ai_review_accepted_at = now`；所有变更通过 phase 4 原子写
- "拒绝"：只写 `ai_review_accepted_at = now` 但不修改 title/tags；徽章变灰

### D8: 流式？

**不做**。reviewer 是后台 handler，不需要流式输出到 UI。chatJson 只用非流式。
phase 16 聊天 UI 会需要 streaming，那时再在 `llm-client` 加 `chatStream` 方法。

### D9: 成本保护

- 默认模型 OpenAI `gpt-4o-mini`、Anthropic `claude-haiku-*`、Ollama `llama3`：便宜或本地
- 单次 max_tokens 默认 800；body 截 16K 字
- 连续失败标 `fail` 后不再自动重跑（用户可手动）；避免死循环烧 token
- 用户可在 profile 自定义 `maxTokens`；无填则走默认

### D10: 幂等与二次触发

- handler 第一步检查 frontmatter.ai_reviewed_at；已有则返回 ok 不调 LLM（dedupe 底线之上的再保险）
- 如果用户想"重做 AI 审读"：编辑器抽屉内有 "重新审读" 按钮 → IPC `ai.reviewClip(clipId, { force: true })` → 立即入队一个新 `ai-review-clip` job，payload 加 `{ force: true }`，dedupe key 用 `clip:${clipId}:force:${ts}`（不与正常 dedupe 冲突）

### D11: 并发与隔离

- llmClient 内部不维护全局并发；并发控制放在 phase 14 runner 的 `ai-review-clip` kind concurrency（设 2）
- profile 切换时现有 pending job 不重新绑定 profile：job 跑到时再读 defaultProfileId（保持最新）

### D12: i18n key

```
editor.ai.badge
editor.ai.drawer.title
editor.ai.suggestedTitle / summary / tags / quotes
editor.ai.accept / reject / rerun
editor.ai.accepted
editor.ai.rejected
editor.ai.error.noProfile
```

## Risks / Trade-offs

- [LLM JSON 偶尔格式坏] → 四道防线 + 失败重试
- [body 截 16K 丢失后半文章] → 本阶段接受；phase 后续加 map-reduce 长文总结
- [Ollama 本地 model latency 高] → concurrency=2 即可；UI 提示"AI 审读可能需数十秒"
- [profile 删除后 job 仍引用] → handler 拿不到 profile → `E_MISSING_PROFILE` fail；用户重配后手动"重新审读"
- [多 clip 同时审读大量开销] → concurrency 限制 + 每次 maxTokens 800 控成本
- [Response-format API 在 Ollama 与 openai-compatible 支持不一] → 提供 provider 能力探测 + fallback 到 prompt-based JSON

## Migration Plan

- migration 008 建 ai_usage
- phase 14 `ai-review-clip` 占位 handler 改 import 指向真实实现
- 回滚：删 migration 008；handler 还原为占位

## Open Questions

- Anthropic 的 JSON 模式支持如何？→ 用 prompt + 四道防线解析；不依赖 response_format
- 审读失败时用户是否知情？→ /history/jobs 会显示 failed；编辑器抽屉里空无一物；AI 徽章不出现；够了
- 用户自己写的笔记（非剪藏）是否也可 AI 审读？→ phase 16 会做"选中→@AI 审读"，本阶段仅剪藏触发
