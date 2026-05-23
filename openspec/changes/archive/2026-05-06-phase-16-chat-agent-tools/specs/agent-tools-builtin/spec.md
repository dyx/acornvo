## ADDED Requirements

### Requirement: search_files

Tool `search_files` SHALL 接受 `{ query: string, limit?: number }`（默认 limit=10，上限 50）；调 phase 8 FTS5 搜索；返回 `{ items: [{ path, title, snippet }] }`。sideEffect=false。

#### Scenario: 基本搜索

- **WHEN** LLM 调 `search_files({ query: "attention" })`
- **THEN** 返回 path/title/snippet 列表（按相关度排序）

#### Scenario: limit 上限

- **WHEN** LLM 传 limit=200
- **THEN** tool 按 50 截断

### Requirement: read_file

Tool `read_file` SHALL 接受 `{ path: string }`（相对 vault）；经 safeResolve；返回 `{ frontmatter, body }`。sideEffect=false。

- path 不存在 → `{ ok: false, error: 'E_NOT_FOUND' }`
- 非 md 或二进制 → `{ ok: false, error: 'E_UNSUPPORTED' }`
- 沙箱外 → `{ ok: false, error: 'E_PATH_ESCAPE' }`

body 长度 MUST 被限制到 60000 字符；超出 SHALL 截断并附 `truncated: true` 字段。

#### Scenario: 正常读取

- **WHEN** path='notes/a.md' 存在
- **THEN** 返回 `{ frontmatter: {...}, body: 'xxx', truncated: false }`

#### Scenario: 文件不存在

- **WHEN** path='missing.md'
- **THEN** 返回 `{ ok:false, error:'E_NOT_FOUND' }`

#### Scenario: body 截断

- **WHEN** 文件 body 80000 字
- **THEN** 返回 body 前 60000 字 + `truncated: true`

### Requirement: list_tags

Tool `list_tags` SHALL 接受 `{ prefix?: string, limit?: number }`（默认 limit=100，上限 500）；调 phase 5 tags 表；返回 `{ items: [{ name, usageCount }] }`。sideEffect=false。

#### Scenario: prefix 过滤

- **WHEN** `list_tags({ prefix: 'ai' })`
- **THEN** 仅返回 name LIKE 'ai%' 的 tag

#### Scenario: 无 prefix

- **WHEN** 不传 prefix
- **THEN** 返回按 usage_count DESC 的前 100 个

### Requirement: update_frontmatter

Tool `update_frontmatter` SHALL 接受 `{ path: string, patch: Record<string, any>, reason: string }`；sideEffect=true（经 approval 门）。执行时：

- 读现有 md（phase 4）
- `merged = { ...frontmatter, ...patch }`
- 用 phase 4 `file.write(path, { body: 原, frontmatter: merged }, { expectedMtime: 原 mtimeMs })`
- 成功 → `{ ok: true, before, after }`
- mtime 冲突 → `{ ok: false, error: 'E_MTIME_CONFLICT' }`
- patch 为空 → `{ ok: false, error: 'E_EMPTY_PATCH' }`
- reason 缺失或为空 → `{ ok: false, error: 'E_MISSING_REASON' }`（LLM MUST 解释原因）

**删除字段**：patch 中值为 `null` 的键 MUST 从 frontmatter 删除（非 merge 保留）。

#### Scenario: 正常 patch

- **WHEN** patch={ tags: ['ai','new'] }，reason='补全主题标签'
- **THEN** approval 通过后执行；frontmatter.tags 被覆盖为 ['ai','new']；返回 before/after

#### Scenario: 删除字段

- **WHEN** patch={ rating: null }
- **THEN** frontmatter.rating 被删除

#### Scenario: 缺 reason

- **WHEN** patch 有效但 reason 为空串
- **THEN** 返回 `E_MISSING_REASON`；loop 把错误塞回 LLM

### Requirement: clip_summary

Tool `clip_summary` SHALL 接受 `{ clipId: number, force?: boolean }`；调 phase 15 `reviewer.reviewClip(clipId, { force })`；返回 `{ summary, suggestedTitle, tags, keyQuotes, reviewedAt }`。sideEffect=false（reviewer 内部会写 frontmatter，但它是幂等 + 对内部字段 ai\_\* 的写入；视为"让 AI 生成"而非"agent 修改用户内容"）。

#### Scenario: 触发审读

- **WHEN** clip_summary({ clipId: 1 })，该 clip 未审读
- **THEN** reviewer 调 LLM 完成；返回 AiReviewResult

#### Scenario: 已审读直接返回

- **WHEN** clip_summary({ clipId: 1 })，已有 ai_reviewed_at 且无 force
- **THEN** 不调 LLM，直接从 frontmatter 读 AI 字段拼装返回

### Requirement: 内置 tools 注册

应用启动时 agent-registry SHALL 注册以上 5 个 tool。重名或缺失 description / parameters 的 tool MUST 导致启动失败。

#### Scenario: 启动注册

- **WHEN** 应用启动并进入 agent bootstrap
- **THEN** `registry.list()` 返回至少 5 项：search_files, read_file, list_tags, update_frontmatter, clip_summary
