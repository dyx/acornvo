## Why

phase 12 把网页剪藏为 md 后进入 `inbox/`；phase 14 已经把入队持久化。但 inbox 只是一堆"待消化"的原始文章，没有结构化信息（摘要、主题标签、建议标题、关键段落）。PRD S-7 / S-8 明确："剪藏后自动让 AI 打摘要与标签；审读结果回写 frontmatter，用户可一键接受或拒绝"。这是拾果把"收集"升级为"消化"的关键一步。

同时本阶段第一次引入**实际的 LLM 调用**，需要打好：
- 统一的 provider 抽象（OpenAI / Anthropic / Ollama / openai-compatible）
- 流式 / 非流式调用的统一接口
- 成本与用量记录
- 提示词管理（system + user 模板 + 变量）
- 失败分类（网络 / 速率 / 模型配置错误 / provider 返回坏 JSON）

本阶段做完后 phase 16 聊天助手可直接复用 provider 抽象 + 提示词框架。

## What Changes

- 新建 `llm-client` 统一封装：`chat({ messages, stream }) → text` / `chatJson({ messages, schema }) → structured`
- 支持 4 provider：`openai` / `anthropic` / `openai-compatible`（Groq、Moonshot 等）/ `ollama`
- 从 phase 13 `settings.ai.defaultProfileId` 拿 profile；main 内部用 `getProfileDecryptedKey` 取明文
- 提示词模板系统：`electron/ai/prompts/<name>.ts`，每个 prompt 导出 `render(vars) → { system, user }`
- 新增 prompt：`review-clip`（输入 title+body，输出 JSON `{ summary, suggestedTitle, tags[], keyQuotes[] }`）
- 实现 `ai-review-clip` 的真 handler：读 clip → chatJson(prompt.reviewClip) → 回写 md frontmatter 字段 `ai_summary` / `ai_suggested_title` / `ai_tags[]` / `ai_key_quotes[]` / `ai_reviewed_at`
- 写 frontmatter 严格走 phase 4 原子写 + mtime 校验（保证不与用户手编冲突）
- 新增 `ai_usage` 表记录每次 LLM 调用的 `job_id / profile_id / model / prompt_tokens / completion_tokens / latency_ms / ok / error`
- UI：编辑器中若 md 带 `ai_summary`，右上角显示 AI 徽章 + 点击展开抽屉（建议标题/标签/摘要/引用）；用户一键"接受建议"→ 把 ai_suggested_title 合并到 title、ai_tags 合并到 tags
- migration 008：`ai_usage` 表

## Capabilities

### New Capabilities
- `llm-client`: 统一的 LLM provider 抽象（OpenAI/Anthropic/Ollama/兼容）
- `ai-prompts`: 提示词模板系统 + `review-clip` 模板
- `ai-reviewer-service`: phase 14 的 `ai-review-clip` 真 handler + 回写 md 逻辑
- `ai-usage-log`: `ai_usage` 表 + 查询 IPC
- `ai-review-ui`: 编辑器右上角徽章 + 抽屉 + 一键接受

### Modified Capabilities
- `job-queue-runner` (phase 14): `ai-review-clip` kind 的 handler 从占位（退避 1h）替换为真实实现

备注：`editor-page`（phase 7）的 AI 徽章能力以 ADDED 方式扩展（不改动已有 requirement）。

## Impact

- `package.json` 可选新增 `@openai/openai`、`@anthropic-ai/sdk`；保守方案直接 fetch http（零依赖），**采纳 fetch** 以减体积
- `migrations/008_ai_usage.sql`
- `electron/ai/`：`client.ts` / `providers/openai.ts` / `providers/anthropic.ts` / `providers/ollama.ts` / `providers/openai-compatible.ts` / `prompts/review-clip.ts` / `reviewer.ts`
- `electron/queue/handlers/ai-review-clip.ts`：占位 → 实装
- `shared/ai-types.ts`：`LlmMessage` / `ChatOptions` / `AiReviewResult` / `AiUsage`
- `src/components/editor/AiReviewBadge.tsx` + `AiReviewDrawer.tsx`
- 依赖：phase 4 原子写、phase 13 profiles、phase 14 runner、phase 9 冲突检测（回写时用 mtime 乐观锁）
