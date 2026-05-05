## 1. Schema 与类型

- [x] 1.1 `migrations/009_ai_usage.sql`：建表 + 2 索引；`user_version = 9`
- [x] 1.2 `shared/ai-types.ts`：`LlmMessage` / `ChatOptions` / `ChatJsonOptions` / `AiReviewResult` / `AiUsageRow` / `LlmErrorCode`
- [x] 1.3 `package.json` 添加 `ajv` 与 `ajv-formats`（JSON schema validate）

## 2. llm-client 抽象

- [x] 2.1 `electron/ai/client.ts`：统一入口；分派 provider
- [x] 2.2 `electron/ai/providers/openai.ts`：fetch + Authorization + response_format
- [x] 2.3 `electron/ai/providers/anthropic.ts`：fetch + x-api-key + system 字段提取
- [x] 2.4 `electron/ai/providers/ollama.ts`：`/api/chat` + `format:'json'`
- [x] 2.5 `electron/ai/providers/openai-compatible.ts`：复用 openai 逻辑 + 自定义 baseUrl
- [x] 2.6 JSON 解析四道防线（code fence strip / 正则抽取 / Ajv validate）
- [x] 2.7 错误归一化 + AbortController 60s 超时

## 3. prompt 模板

- [x] 3.1 `electron/ai/prompts/review-clip.ts`：schema + render；body 截 16K
- [x] 3.2 schema 用 Ajv 定义，导出 JSON Schema 对象

## 4. reviewer service

- [x] 4.1 `electron/ai/reviewer.ts`：reviewClip(clipId, opts)
- [x] 4.2 读 clips + 读 md + parseFrontmatter（phase 4 已有 codec）
- [x] 4.3 幂等检查 + force 支持
- [x] 4.4 调 llmClient.chatJson
- [x] 4.5 合并到 frontmatter；phase 4 file.write 带 expectedMtime
- [x] 4.6 错误映射

## 5. usage log

- [x] 5.1 `electron/ai/usage.ts`：`insert(row)` + `summary(opts)` + `list(opts)`
- [x] 5.2 `electron/ipc/ai.ts`：暴露 `ai.reviewClip(clipId, { force })` / `ai.usage.summary` / `ai.usage.list`

## 6. 真实 handler 注册

- [x] 6.1 `electron/queue/handlers/ai-review-clip.ts`：重写为 reviewer.reviewClip 的封装
- [x] 6.2 runner 注册处把占位 import 替换为真实 handler；确保 phase 14 的占位不再被注册
- [x] 6.3 ai_usage 在成功 / 失败两路都写一次

## 7. renderer UI

- [x] 7.1 `src/components/editor/AiReviewBadge.tsx`：根据 frontmatter 判断 3 态（隐藏 / 紫 / 灰）
- [x] 7.2 `src/components/editor/AiReviewDrawer.tsx`：四区块 + 底部三按钮
- [x] 7.3 抽屉联动编辑器 store：接受 → 修改 frontmatter → dirty → autosave
- [x] 7.4 Frontmatter 只读侧卡：新增"AI 审读"行 + 展开按钮
- [x] 7.5 重新审读按钮 → `ai.reviewClip(clipId, { force: true })` IPC；徽章切 spinner 状态

## 8. 路由与 store

- [x] 8.1 编辑器 store 订阅 `jobs.changed`：当 `ai-review-clip` job 完成且对应 clip 的 path 即当前编辑路径 → 重新读取 frontmatter（或 watcher 自动触发）
- [x] 8.2 preload 暴露 `window.api.ai.reviewClip / ai.usage.*`

## 9. i18n

- [x] 9.1 `editor.ai.*` keys（见 design D12）

## 10. 验收

- [ ] 10.1 phase 13 配好 openai profile + key；phase 12 剪藏一个 example.com 文章
- [x] 10.2 1-2 分钟内：jobs 表的该 job 走 pending → running → done；md 的 frontmatter 新增 ai_summary / ai_suggested_title / ai_tags / ai_key_quotes / ai_reviewed_at
- [x] 10.3 ai_usage 表有成功行：ok=1, prompt_tokens/completion_tokens 非空, latency_ms > 0
- [ ] 10.4 打开该 md → 编辑器 TitleBar 紫色 AI 徽章 → 点开抽屉显示 4 区块
- [ ] 10.5 "用作标题" → title 被替换为 suggestedTitle；autosave 完成
- [ ] 10.6 "合并到标签" → tags 并集；content_hash 不变
- [ ] 10.7 "一键接受" → title / tags / ai_review_accepted_at 都正确；徽章变灰
- [ ] 10.8 "拒绝" → 仅写 ai_review_accepted_at；徽章变灰
- [ ] 10.9 "重新审读" → 新 job 入队；frontmatter 最终被新结果覆写；ai_usage 多一行
- [x] 10.10 删默认 profile → 入队的 job handler 返回 fail E_MISSING_PROFILE；UI 在 /history/jobs 显示失败
- [x] 10.11 模拟 401（错 key）→ handler 返回 fail E_AUTH；不再自动重试
- [x] 10.12 模拟 429 → 退避 60s；attempts+=1
- [x] 10.13 LLM 返回 ` ```json {"a":1} ``` ` 样式 → 解析成功
- [x] 10.14 LLM 返回 schema 不匹配 → E_RESPONSE；retry 按 nextDelay
- [x] 10.15 body > 16000 字 → prompt 截断且加 "...(内容过长已截断)"
- [ ] 10.16 Ollama profile（localhost:11434, llama3）→ 调用返回 JSON；frontmatter 正常更新
- [ ] 10.17 Anthropic profile → claude-haiku 返回 JSON；frontmatter 正常更新
- [x] 10.18 `ai.usage.summary({ sinceDays: 30 })` → 返回正确聚合
- [x] 10.19 main 内部验证：renderer 任何 IPC payload 均不含 apiKey 明文
- [x] 10.20 `openspec validate phase-15-ai-reviewer --strict` 通过
