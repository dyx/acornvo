## ADDED Requirements

### Requirement: search.quickSwitch 模糊跳转
系统 SHALL 提供 `search.quickSwitch(q, { limit })` IPC，返回 `FileSummary[]`，按匹配优先级排序：标题完全匹配 > 标题前缀 > 标题子串 > 路径子串；同级按 `clipped_at` 降序。`q` 为空时 MUST 返回空数组（UI 自行显示"最近打开"）。

#### Scenario: 标题完全匹配优先
- **WHEN** 存在两行 title="attention"、title="attention is all you need"；q="attention"
- **THEN** 首位是 title="attention"

#### Scenario: 中文子串命中
- **WHEN** q="注意力"；存在 title="注意力机制综述"
- **THEN** 返回含该行

#### Scenario: 空 q
- **WHEN** q=""
- **THEN** 返回 `[]`

### Requirement: search.fullText 全文查询
系统 SHALL 提供 `search.fullText(q, { limit, offset })` IPC，返回 `{ items: { summary: FileSummary, snippet: string }[], total: number, pending: boolean }`。服务端 MUST 对 `q` 调 jieba 切词、过滤停用词、拼 FTS5 查询串（默认各 token AND，单 token 走前缀 `*`，用户输入引号则走短语）。结果 MUST 按 FTS5 `rank` 排序（BM25），并用 `snippet()` 截取上下文（16 token 窗口）用 `<mark>` 包裹命中词。

#### Scenario: 中文 AND
- **WHEN** q="注意力 机制"
- **THEN** 结果仅包含 body 同时含"注意力"和"机制"的文件

#### Scenario: 单 token 前缀
- **WHEN** q="注意"
- **THEN** FTS 查询实际为 `"注意"*`，命中"注意力"、"注意事项"

#### Scenario: 短语精确
- **WHEN** q=`"注意力机制"` （带引号）
- **THEN** 只命中连续出现"注意力机制"的文件

#### Scenario: 停用词过滤
- **WHEN** q="的 注意力"
- **THEN** token 化后去掉"的"，实际查询等价于 q="注意力"

#### Scenario: FTS 语法错误
- **WHEN** q="foo :"（包含保留字符）
- **THEN** 返回 `{ items: [], total: 0, pending: false }` + 日志 warn；UI toast "搜索语法错误"

#### Scenario: 索引构建中
- **WHEN** `maybeRebuildFts()` 正在执行
- **THEN** `fullText` 返回 `pending: true`；UI 提示"索引构建中，请稍候"

#### Scenario: 分页
- **WHEN** 命中 120 行，调 `offset=100, limit=50`
- **THEN** 返回 20 条，`total=120`

### Requirement: search.suggest 输入建议
系统 SHALL 提供 `search.suggest(q)`，返回前 5 个标题匹配项（仅 FileSummary），用于搜索框下拉候选。性能目标：< 10ms。

#### Scenario: 输入即建议
- **WHEN** 用户在全文搜索输入框打字"att"
- **THEN** 调 `search.suggest("att")` 返回不超过 5 个 FileSummary

### Requirement: search.stats 统计
系统 SHALL 提供 `search.stats()`，返回 `{ fts_rows: number, last_rebuild_at: string | null }`。

#### Scenario: 读取统计
- **WHEN** 调用 `search.stats()`
- **THEN** 返回 `fts_rows` 等于当前 `SELECT COUNT(*) FROM files_fts`
