## ADDED Requirements

### Requirement: files.list 分页查询
系统 SHALL 提供 `files.list(filter, pagination)` IPC 方法，返回 `{ items: FileSummary[], total: number }`。`filter` 支持：`category`（精确 + 前缀，按 `x/y` 拆分）/ `tag` / `pathPrefix` / `rating.min` / `rating.max` / `q`（标题 + 路径 LIKE）。`pagination` 含 `limit`、`offset`、`orderBy: 'clipped_desc' | 'title_asc'`。

#### Scenario: 基础查询
- **WHEN** 调用 `files.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })`
- **THEN** 返回不超过 50 个 FileSummary，按 clipped_at 倒序
- **AND** `total` 等于树林中 md 文件总数

#### Scenario: 按分类（前缀匹配）
- **WHEN** `filter.category = '技术'`
- **THEN** 命中 `category = '技术'` 或 `category LIKE '技术/%'` 的文件

#### Scenario: 按 tag
- **WHEN** `filter.tag = 'attention'`
- **THEN** 命中 `file_tags.tag = 'attention'` 的文件

#### Scenario: 按评分范围
- **WHEN** `filter.rating.min = 4`
- **THEN** 仅返回 `rating >= 4` 的行

#### Scenario: q 模糊
- **WHEN** `filter.q = '注意力'`
- **THEN** 返回标题或路径含"注意力"的行

#### Scenario: 分页
- **WHEN** 连续调用 `offset=0, limit=50` 和 `offset=50, limit=50`
- **THEN** 两次返回的 path 集合不相交，合并后连续且覆盖前 100 行

### Requirement: files.get 读详情
系统 SHALL 提供 `files.get(path)` IPC，返回 `{ summary: FileSummary, frontmatter: Frontmatter, body: string }`。body MUST 从磁盘读取（`file.read` + `parseFile`），而非 SQLite。

#### Scenario: 读取详情
- **WHEN** 调用 `files.get('notes/a.md')`
- **THEN** 返回的 summary 与 `files.list` 同路径行一致；frontmatter 与磁盘当前 frontmatter 一致；body 为磁盘当前正文

#### Scenario: 路径不存在
- **WHEN** `files.get('notes/missing.md')`
- **THEN** 返回 `E_NOT_FOUND`

### Requirement: files.getCategoryTree 分类树
系统 SHALL 提供 `files.getCategoryTree()` IPC，返回按 `/` 拆分层级聚合后的树形结构：`{ name: string, count: number, children: CategoryNode[] }[]`。

#### Scenario: 分类聚合
- **WHEN** 树林中文件 category 为 `["技术/深度学习", "技术/深度学习", "技术/工具链", "产品"]`
- **THEN** 返回 `[ { name: '技术', count: 3, children: [{ name: '深度学习', count: 2, children: [] }, { name: '工具链', count: 1, children: [] }] }, { name: '产品', count: 1, children: [] } ]`

### Requirement: files.getTagCloud 标签云
系统 SHALL 提供 `files.getTagCloud({ limit })` IPC，返回 `{ name, usage_count }[]`，按 usage_count 降序。

#### Scenario: Top 30
- **WHEN** 调用 `files.getTagCloud({ limit: 30 })`
- **THEN** 返回 ≤ 30 个 tag，按 usage_count 降序
