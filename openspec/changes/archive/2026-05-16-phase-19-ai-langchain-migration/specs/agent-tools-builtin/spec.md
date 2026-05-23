## MODIFIED Requirements

### Requirement: search_files

Tool `search_files` SHALL 用 `tool(fn, { name: 'search_files', description, schema: z.object({ query: z.string(), limit: z.number().int().optional() }) })` 定义；调 phase 8 FTS5 搜索；返回 `{ items: [{ path, title, snippet }] }`。无副作用（不出现在 HITL `interruptOn` 列表）。

默认 limit=10，上限 50（在 execute 内部裁剪）。

#### Scenario: 基本搜索

- **WHEN** LLM 调 `search_files({ query: "attention" })`
- **THEN** 返回 path/title/snippet 列表（按相关度排序）

#### Scenario: limit 上限

- **WHEN** LLM 传 limit=200
- **THEN** tool 按 50 截断

#### Scenario: schema 校验失败

- **WHEN** LLM 传 `{ query: 42 }`（非 string）
- **THEN** LangChain Zod 校验失败，包装为 ToolMessage（含错误描述）塞回；LLM 重试

### Requirement: read_file

Tool `read_file` SHALL 用 Zod schema `z.object({ path: z.string() })` 定义；execute 内开头调 `safeResolve(vaultRoot, path)`；返回 `{ frontmatter, body, truncated }`。无副作用。

- path 不存在 → `{ ok: false, error: 'E_NOT_FOUND' }`
- 非 md 或二进制 → `{ ok: false, error: 'E_UNSUPPORTED' }`
- 沙箱外 → `{ ok: false, error: 'E_PATH_ESCAPE' }`
- body 长度 MUST 被限制到 60000 字符；超出 SHALL 截断并附 `truncated: true`

#### Scenario: 正常读取

- **WHEN** path='notes/a.md' 存在
- **THEN** 返回 `{ frontmatter: {...}, body: 'xxx', truncated: false }`

#### Scenario: 文件不存在

- **WHEN** path='missing.md'
- **THEN** 返回 `{ ok:false, error:'E_NOT_FOUND' }`

#### Scenario: body 截断

- **WHEN** 文件 body 80000 字
- **THEN** 返回 body 前 60000 字 + `truncated: true`

#### Scenario: 越狱路径

- **WHEN** LLM 传 `path: '../../../etc/passwd'`
- **THEN** execute 内 safeResolve 拒绝；返回 `E_PATH_ESCAPE`

### Requirement: list_tags

Tool `list_tags` SHALL 用 Zod schema `z.object({ prefix: z.string().optional(), limit: z.number().int().optional() })` 定义；调 phase 5 tags 表；返回 `{ items: [{ name, usageCount }] }`。无副作用。

默认 limit=100，上限 500。

#### Scenario: prefix 过滤

- **WHEN** `list_tags({ prefix: 'ai' })`
- **THEN** 仅返回 name LIKE 'ai%' 的 tag

#### Scenario: 无 prefix

- **WHEN** 不传 prefix
- **THEN** 返回按 usage_count DESC 的前 100 个

### Requirement: update_frontmatter

Tool `update_frontmatter` SHALL 用 Zod schema `z.object({ path: z.string(), patch: z.record(z.any()), reason: z.string().min(1) })` 定义；副作用工具 —— 在 `humanInTheLoopMiddleware.interruptOn` 中以 `update_frontmatter: { allowAccept: true, allowEdit: true, allowReject: true }` 声明。

执行时：

- execute 内调 `safeResolve(vaultRoot, path)`
- 读现有 md（phase 4）
- `merged = { ...frontmatter, ...patch }`
- 用 phase 4 `file.write(path, { body: 原, frontmatter: merged }, { expectedMtime: 原 mtimeMs })`
- 成功 → `{ ok: true, before, after }`
- mtime 冲突 → `{ ok: false, error: 'E_MTIME_CONFLICT' }`
- patch 为空 → `{ ok: false, error: 'E_EMPTY_PATCH' }`

**删除字段**：patch 中值为 `null` 的键 MUST 从 frontmatter 删除（非 merge 保留）。

`reason` 字段为 LLM 必填；Zod `min(1)` 在缺失时校验失败，等价于原 `E_MISSING_REASON`（LLM 收到 ZodError 重试）。

#### Scenario: 正常 patch

- **WHEN** patch={ tags: ['ai','new'] }，reason='补全主题标签'
- **THEN** HITL 通过后执行；frontmatter.tags 被覆盖为 ['ai','new']；返回 before/after

#### Scenario: 删除字段

- **WHEN** patch={ rating: null }
- **THEN** frontmatter.rating 被删除

#### Scenario: 缺 reason

- **WHEN** LLM 调用时 reason 为空串
- **THEN** Zod `min(1)` 校验失败；ToolMessage 含错误塞回 LLM

#### Scenario: 路径越狱

- **WHEN** LLM 传 `path: '../../../etc/passwd'`
- **THEN** safeResolve 拒绝；返回 `E_PATH_ESCAPE`

### Requirement: clip_summary

Tool `clip_summary` SHALL 用 Zod schema `z.object({ clipId: z.number().int(), force: z.boolean().optional() })` 定义；调 phase 15 `reviewer.reviewClip(clipId, { force })`；返回 `{ summary, suggestedTitle, tags, keyQuotes, reviewedAt }`。无副作用（reviewer 写 frontmatter ai\_\* 字段视为「让 AI 生成」而非「agent 修改用户内容」）。

#### Scenario: 触发审读

- **WHEN** clip_summary({ clipId: 1 })，该 clip 未审读
- **THEN** reviewer 调 LLM 完成；返回 AiReviewResult

#### Scenario: 已审读直接返回

- **WHEN** clip_summary({ clipId: 1 })，已有 ai_reviewed_at 且无 force
- **THEN** 不调 LLM，直接从 frontmatter 读 AI 字段拼装返回

### Requirement: 内置 tools 注册

应用启动时 SHALL 把 5 个内置工具聚合为数组传给 `createAgent({ tools })`。重名或缺失 description / schema 的 tool MUST 导致启动失败（由 LangChain 抛错触发）。

#### Scenario: 启动注册

- **WHEN** 应用启动并进入 agent runner 初始化
- **THEN** `createAgent({ tools: [searchFiles, readFile, listTags, updateFrontmatter, clipSummary] })` 成功；5 个 tool 均可被 LLM 调用
