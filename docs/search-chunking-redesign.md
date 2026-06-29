# 混合搜索与分块策略统一重构方案

## 0. 覆盖项

| 编号 | 问题 | 归属工作流 |
|---|---|---|
| 1.1 | hybrid FTS 绕过 jieba，query 不分词 | A |
| 1.2 | hybrid 用默认 bm25，与 fullText 加权不一致 | A |
| 1.3 | hybrid 摘要粗暴截断，无 `<mark>` 高亮 | A |
| 1.5 | `total` 语义错误（并集数冒充命中数） | A |
| 1.6 | 查询嵌入缺 BGE instruction 前缀 | B |
| 2.1 | 按字符硬切，切穿 token | C |
| 2.2 | 字符数 ≠ token 数，CJK 超 512 上下文 | C |
| 2.3 | 只认 H2/H3，忽略 H1/H4–H6 | C |
| 2.4 | `##` 重置 heading_path 丢父级上下文 | C |
| 2.6 | overlap 固定偏小且按字符切 | C |

## 1. 现状关键事实（带行号）

- FTS 写入时**预先 jieba 分词**：`index-queries.ts:88-89` `segment(title).join(' ')` / `segment(chunk.body).join(' ')`。索引里存的是空格分隔的 jieba token。
- 纯 FTS 查询用 `buildFtsQuery`（`queryBuilder.ts:10`）：jieba 分词 + 停用词 + `AND` 拼接；hybrid 查询**不用**它，`hybrid.ts:47` 直接 `"<raw query>"*`。
- `files_fts` 列序（`001_schema.sql:31-37`）：`chunk_id`(UNINDEXED)、`path`(UNINDEXED)、`heading_path`、`title`、`body`，tokenizer `unicode61`。
- fullText 加权 `bm25(0.0, 5.0, 10.0, 1.0)`（`queries.ts:125`）→ 实效：`heading_path=10`、`title=1`、`body=1`（前两列 UNINDEXED 权重无效）。hybrid 用默认 `bm25(files_fts)`（`hybrid.ts:40`）。
- fullText 用 `snippet(files_fts, -1, '<mark>','</mark>','...', 64)`（`queries.ts:121`）；hybrid 用 `body.slice(0,300)+'...'`（`hybrid.ts:143`）。
- 查询嵌入走 `embedBatchLocal([query])`（`hybrid.ts:69`）→ worker 只暴露 `embedDocuments`（`embed-worker-main.ts:13`），**无独立 query 路径**，也无 BGE 指令前缀。
- 分块：`chunker.ts:11-12` `MAX_CHARS=1800`/`OVERLAP=200`（字符）；`splitWithOverlap`（`:34`）`text.slice(i,i+maxLen)` 无边界感知；`chunkByHeading`（`:76`）正则 `/^(##|###)\s+/`；`##` 时 `currentPath=[title]`（`:84`）覆盖父级；`stableId`（`:46`）含 heading。
- `chunk_vectors` 以 `chunks.rowid` 为键（`vector-store.ts:13,25`），`vec0 FLOAT[512]`（`001_schema.sql:59`）。
- 渲染层（`src/stores/search.ts:13,74`）消费 `items`/`total`，无分页 UI。

## 2. 工作流 A：FTS 查询统一与结果一致（1.1 / 1.2 / 1.3 / 1.5）

### A1 hybrid 复用 buildFtsQuery（1.1）

`hybrid.ts:47` 删除自造 query，改：

```ts
import { buildFtsQuery } from './queryBuilder'
// ...
const ftsQuery = buildFtsQuery(query)
let ftsRows = []
if (ftsWeight > 0 && ftsQuery) {
  try { ftsRows = ftsStmt.all(ftsQuery) }
  catch (err) { logger().warn('hybrid', { msg: 'FTS search failed', meta: { query, err: String(err) } }) }
}
```

`buildFtsQuery` 对纯停用词 query 返回 `''` → FTS 通道跳过，降级为纯向量召回（优于当前「整段短语 MATCH 召不回」）。

### A2 bm25 加权对齐（1.2）

`hybrid.ts:40` `bm25(files_fts) as raw_score` → `bm25(files_fts, 0.0, 5.0, 10.0, 1.0) as raw_score`，与 `queries.ts:125` 完全一致。

> 注：现有加权使 `title` 权重仅 1（低于 `heading_path=10`），疑似偏低；本方案只求**两路一致**，权重再调留作 follow-up（不在本范围）。

### A3 摘要高亮统一（1.3）

从 `queries.ts` 抽出共享 helper（供 fullText 与 hybrid 复用）：

```ts
/** 对 FTS 命中的 chunk_id 集合，返回带 <mark> 高亮的摘要（与 fullText 同源）。 */
export function hydrateSnippets(
  db: Database.Database, ftsExpr: string, chunkIds: string[]
): Map<string, string> {
  if (chunkIds.length === 0 || !ftsExpr) return new Map()
  const ph = chunkIds.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT chunk_id,
            snippet(files_fts, -1, '<mark>', '</mark>', '...', 64) AS snip
     FROM files_fts
     WHERE files_fts MATCH ? AND chunk_id IN (${ph})`
  ).all(ftsExpr, ...chunkIds) as { chunk_id: string; snip: string }[]
  return new Map(rows.map(r => [r.chunk_id, escapeForSnippet(r.snip)]))
}
```

`hybrid.ts` hydrate 段（`:130-152`）改为：对 `ftsRanks` 命中的 id 调 `hydrateSnippets` 取高亮摘要；对纯向量命中（`!hasFts`）走 `truncateForPreview(body, 300)`（按首段/首句截断，非裸 slice）。两者都经 `escapeForSnippet`。

> 实现时核对 fullText 现有转义路径（`queries.ts` 末段映射），确保 `<mark>` 存活而其余转义——抽出后两路共用同一管线，满足 AGENTS.md snippet 转义不变量。此处是「复用既有」而非新造转义逻辑。

### A4 total 如实（1.5）

`hybrid.ts:154` `total: allIds.size` → `total: top.length`（即 `items.length`）。当前无分页 UI，「实际返回 N 条」是最诚实语义。

> 若后续上分页需「总命中数」：FTS 侧可 `COUNT(*)`，向量侧 KNN 无法廉价计数——届时另设近似计数路径，不在本范围。与 fullText 返回真实 COUNT 的差异：UI 不分页，无功能影响，仅语义口径不同。

## 3. 工作流 B：BGE 查询指令前缀（1.6）

BGE-small-zh 非对称检索要求 query 端加指令前缀，文档端不加。

**新增 `electron/ai/bge-instruction.ts`**（纯常量，无 import，避免把 transformers 拖进主进程）：

```ts
export const BGE_QUERY_INSTRUCTION = '为这个句子生成表示以用于检索相关文章：'
```

**`embed-worker.ts` 增 query 专用入口**：

```ts
import { BGE_QUERY_INSTRUCTION } from './bge-instruction'
export async function embedQueryLocal(query: string): Promise<number[]> {
  const vecs = await embedBatchLocal([BGE_QUERY_INSTRUCTION + query])
  return vecs[0]
}
```

**`hybrid.ts:68-73`**：

```ts
if (isLocal) vecQuery = await embedQueryLocal(query)
else vecQuery = await model!.embedQuery(query)   // 远程模型不加前缀（BGE 专属）
```

文档索引端 `embed-file.ts:30` **不动**（`embedBatchLocal(texts)` 保持无前缀）。

> 顺手清理：`embed-worker.ts:10-11,21` 与 `embed-worker-main.ts:8,10,14,17` 的 `console.log/error` 调试残留（15 行是 postMessage、非日志），转 `logger()` 或删除（worker 为 utilityProcess，logger 不可用则保留 stderr 错误路径、删 verbose）。属本工作流触达路径的顺手项。

## 4. 工作流 C：分块器重写（2.1 / 2.2 / 2.3 / 2.4 / 2.6）

重写 `electron/services/chunker.ts`。

**策略一览**（对照旧「1800 字符 + 200 overlap」）：

| 项 | 旧 | 新 |
|---|---|---|
| 计量单位 | 字符 | **token**（BGE 上下文按 token 计） |
| 块上限 | 1800 字符 | **400 token**（< BGE 512 上下文，留 heading 前缀 + 余量） |
| overlap | 200 字符 | **64 token**，按整句/整段边界对齐 |
| 切分边界 | 无（`slice` 硬切） | 代码块原子 → 段落 → 句子 → 行，不切穿 |
| 标题切节 | 仅 H2/H3 | H1–H6 全认，`heading_path` 层级栈推导 |

### C1 token 计量（2.2）

```ts
const MAX_TOKENS = 400      // < BGE 512 上下文；留 heading_path 前缀（embed-file.ts:25）+ special token 余量
const OVERLAP_TOKENS = 64   // ~16%，按边界对齐
// 保守过估：CJK 及其标点/全角（BGE 均按 1 token 计），latin≈字数/4（略高于 WordPiece，安全方向）
const tokenCount = (s: string) => {
  const cjk = (s.match(/[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g) || []).length
  return cjk + Math.ceil((s.length - cjk) / 4)
}
```

### C2 边界感知切分（2.1 / 2.6）

`splitWithOverlap`（字符硬切）→ `splitByBoundary`：

1. 把文本切成有序「单元」：围栏代码块（```...```）为**原子单元**（不内部切）；其次段落（`\n\n`）；再其次句子（`。！？；.!?;`）；最后行（`\n`）。
2. 贪心累加单元到当前块，直到加入下一单元将超 `MAX_TOKENS`。
3. 溢出时：发出当前块；下一块以**上一块末尾不超过 `OVERLAP_TOKENS` 的若干整单元**作种子（边界对齐的 overlap，非字符 slice）。
4. 单个代码块超 `MAX_TOKENS`：整块独立发出（不切中部），打 warn（罕见）。

永不切穿 token / 句 / 代码块；overlap 也是边界对齐。

> 例：一节 900 token → 块1 累加到 ≈400 token（停在句末）→ 块2 以块1 末尾 ≤64 token 的整句开头、再累加到 ≈400 → 块3 剩余。相邻块共享一段整句 overlap。

### C3 全 heading 层级 + 层级栈（2.3 / 2.4）

`chunkByHeading`（`:50-103`）正则 `/^(##|###)\s+/` → `/^(#{1,6})\s+(.*)$/`；`currentPath` 重置逻辑换层级栈：

```
on heading(level L, title T):
  while stack 非空 and stack.top.level >= L: pop
  stack.push({level: L, title: T})
  heading_path = stack.map(s => s.title).join(' > ')
  flushChunk()   // 标题处切节
```

`# A` → `## B` → `### C` → `## D` 得 `A>B>C`、`A>D`（父级不丢）。H1 现在触发切节（原被忽略）；H4–H6 同理。无标题文档 → 单节、`heading_path=''`（行为不变）。

**必须保留 `inCodeBlock` 守卫**（现有 `chunker.ts:56,69,75`：围栏切换 + 仅 `!inCodeBlock` 时匹配标题）。新正则 `#{1,6}` 会匹配代码块内的 `# comment`，不守卫会把注释误当 H1 切节并破坏代码块——比旧的 `##|###` 更依赖此守卫。

### C4 组装

`chunkMarkdown(body, path)`：`chunkByHeading` 出节 → 每节 `tokenCount > MAX_TOKENS` 则 `splitByBoundary` 否则单块 → 全局 ordinal 递增 → 复用现有 `stableId`（不改）。`char_count` 列保留（展示用），但**计量改 token**。

## 5. 契约与类型

- `shared/file-types.ts:74-80` `HybridSearchResult`（stale：`chunk_id/path/body/score`）与实际返回（`items:{summary,body,heading_path,score,source}[]/total/pending`）不符。渲染层 `search.ts:13` 已按实际 shape 用，故**对齐类型到现实**（不改运行时行为）。A3/A4 触达返回路径，顺手修正。
- `shared/ipc-contract.ts:397-403` `search.hybrid`：返回 shape 不变（仍 `items/total/pending`），仅 `total` 语义与 `body` 内容变——契约不破，无需版本号。

## 6. 迁移与重建

| 工作流 | 是否需重建 | 触发 |
|---|---|---|
| A（FTS 统一） | 否 | 查询期改动，即时生效 |
| B（BGE 前缀） | 否 | 查询期改动，即时生效 |
| C（分块重写） | 是 | 块大小 / boundary 变 → 旧 chunks 失配，需重嵌 |

C 的迁移：`chunker_version` 写进**现有**重建状态 JSON（`<groveRoot>/.acornvo/state/fts_last_rebuild.json`，扩展 `stats.ts:14-32` 的 `writeRebuildTimestamp`/`readRebuildTimestamp` 为 `{ at, chunker_version }`）。开 grove 时（`db.ts:182,200`）先读版本，stored < new → **直接调 `rebuildFts`**（`rebuild.ts:67`，无条件版，与手动重建 `ipc/search.ts:26` 同路径）。**不走 `maybeRebuildFts`**——它在 `ftsCount > 0` 时跳过（`rebuild.ts:56`），已填充 grove 会静默不重建。`rebuildFts` 自清 `files_fts`/`chunks`（`:82-83`）并重排 `embed-file`（`:124`）。一次性全量重嵌成本。

## 7. 实施顺序

1. A → 即时验证中文多词 query 召回。
2. B → 验证语义召回。
3. C → bump `chunker_version`、重建、重嵌、验证。
4. 类型 / 契约修正。

## 8. 改动文件清单

| 文件 | 工作流 | 改动 |
|---|---|---|
| `electron/services/search/hybrid.ts` | A1/A2/A3/A4/B | 复用 buildFtsQuery、bm25 加权、snippet、total、embedQueryLocal |
| `electron/services/search/queries.ts` | A3 | 抽 `hydrateSnippets` 共享 |
| `electron/ai/bge-instruction.ts` | B | 新增（纯常量） |
| `electron/ai/embed-worker.ts` | B | `embedQueryLocal`、清调试 log |
| `electron/ai/embed-worker-main.ts` | B | 清调试 log |
| `electron/services/chunker.ts` | C | 重写（token 计量 / 边界 / 层级栈） |
| `electron/services/search/stats.ts` | C | 扩展重建状态 JSON 加 `chunker_version` 字段 |
| `electron/services/db.ts` | C | 开 grove 读版本，不匹配直接调 `rebuildFts`（非 `maybeRebuildFts`） |
| `shared/file-types.ts` | §5 | HybridSearchResult 对齐现实 |

## 9. 完成前检查（AGENTS.md）

- `npm run typecheck`（全量）、`npm run lint`
- A3 复用 `snippet()` + 既有转义管线，满足「snippet() 返回值先 HTML 转义」不变量
- 无新增原始色 / 新原语（本方案不涉 UI 样式）
- 主进程安全相关：FTS query 仍参数化（`?` 绑定），`MATCH` 表达式为静态构造片段（`buildFtsQuery` 已转义双引号），无动态 SQL 拼接值
