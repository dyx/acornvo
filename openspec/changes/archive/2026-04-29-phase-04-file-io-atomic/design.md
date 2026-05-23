## Context

已有前置：phase 1 的 IPC 路由 + 错误形状；phase 2 的 `currentGrovePath`；phase 3 的 db（不在本阶段使用，但下游 indexer 会在同事务内写 db + 写 md）。

PRD 的跨模块通用约定（[边界处理规范/跨模块通用约定]）：

- **原子写入**：所有 md / JSON 持久化都走 writeFileAtomic
- **编码统一**：读时 detect UTF-8 BOM / GBK 并转 UTF-8；写回统一无 BOM UTF-8
- **换行符保留**：读时统一 LF；写回保留原风格
- **路径校验**：所有带 `path` 参数的 IPC / tool 调用统一过 `safeResolve(groveRoot, p)`
- **大小写敏感性**：内部保留原始大小写；跨平台同步同一树林时在 Picker 警告（phase 2 已做）

这些规范必须在本 change 里实装并对外暴露接口，让后续所有磁盘操作统一经过。

## Goals / Non-Goals

**Goals:**

- 一次封装好 md I/O、frontmatter、路径校验，三者供后续所有模块调用
- 抗断电、抗编码漂移、抗行尾漂移、抗越界
- Frontmatter 读写尽量保留 YAML 原貌（key 顺序与未知字段），避免理果只改 3 个字段就动到整文件
- mtime 乐观锁机制就位（值由下游 phase 9 用）

**Non-Goals:**

- 不做删除（trashItem 留到 phase 10）
- 不做 chokidar 监听（留到 phase 5）
- 不解决重命名 `<>:"|?*` 的 Windows 保留字符问题（slug 阶段过滤，phase 12）
- 不做 Windows 长路径 `\\?\` 前缀（长路径支持留到 phase 11 browser/clipper 或单独 change）
- 不写编辑器层面的自动保存 debounce（phase 7）

## Decisions

### D1: 原子写入实现

```ts
async writeFileAtomic(abs, data: Buffer | string) {
  const tmp = `${abs}.${crypto.randomUUID()}.tmp`
  const fd = await fs.open(tmp, 'w')
  try { await fd.writeFile(data); await fd.sync(); }  // fsync 确保落盘
  finally { await fd.close(); }
  try { await fs.rename(tmp, abs); }
  catch (e: EXDEV) {
    // 跨 fs 的 rename 不支持 → copy + unlink
    await fs.copyFile(tmp, abs)
    await fs.unlink(tmp)
  }
}
```

写入前在 `abs` 的目录加短锁（内存 `Map<absPath, Promise>` 串行化同一路径的写），避免并发 `.tmp` 互相覆盖。

**理由**：fsync 是必要的——没有它 macOS 也会丢；跨 fs 回退保证用户把树林放在外挂盘时仍可工作。

**备选**：用第三方 `write-file-atomic`——功能够但不控制；我们需要精细控制 fsync 与跨 fs 策略，所以自实现。

### D2: 编码检测优先级

读 `fs.readFile(abs)` → Buffer：

1. 前三字节是 `EF BB BF` → UTF-8 BOM → 剥离返回
2. `isUtf8(buf)`（node 22+ 内置或自实现）→ 直接 UTF-8 返回
3. 启发式尝试 GBK / GB18030 解码（`iconv-lite`）；成功且无 replacement 字符 → 返回解码结果 + 记录 `originalEncoding: 'gbk'`（返给调用方，后续写回转 UTF-8）
4. 全部失败 → `E_ENCODING`

**理由**：大多 md 都是 UTF-8；GBK 是中文圈少量旧文件；不支持 UTF-16（极少见，失败即可）。

### D3: 换行保留

读取后扫描文件前 4KB 或全文：

- 仅含 `\n` → LF
- 仅含 `\r\n` → CRLF
- 混合 → `mixed`（按多数派决定，同时记录 `hadMixedEol: true` 供日志）

返回值：`{ content: string /* 统一 LF */, eol: 'lf' | 'crlf' | 'mixed', originalEncoding: 'utf8' | 'gbk' | ..., hadBom: boolean }`

写入时：若 `eol === 'crlf'` 且输入是 LF，出口 `content.replace(/\n/g, '\r\n')`；否则原样。新文件 eol 默认 LF，hadBom 默认 false。

**理由**：避免 Obsidian 里 CRLF 文件被 Acornvo 保存后 mtime 更新 + 内容"变化"（全文替换），触发冲突误报。

### D4: frontmatter codec

```
parseFile(raw: string): { frontmatter: Frontmatter, body: string, rawYaml: string }
stringify(frontmatter: Frontmatter, body: string, opts?: { baseRawYaml?: string }): string
```

- `parseFile`：`matter(raw)`；对 frontmatter 走 Zod `.passthrough()` schema（已知字段按 PRD schema 校验类型，未知字段原样保留）
- `stringify`：再次 `matter.stringify(body, { ...frontmatter })`；gray-matter 会按 key 顺序序列化，**不保证** 与原 rawYaml 逐字符相同（YAML 引号风格、缩进、注释都可能变）
- `baseRawYaml`（可选）：用于**冲突处理**场景，提供原始 YAML 以做 3-way 合并（phase 9 再实现；本阶段只存储）

**理由**：gray-matter 使用广泛、兼容 Obsidian；Zod schema 在读入时即可捕获不合法的 rating（如 `"4/5"`），便于理果阶段的"宽松 parser"兜底（理果自己再一次 `.safeParse` 实现重试）。

**已知取舍**：YAML 注释和空行在 gray-matter 里不保留；可接受——用户不应把重要信息放 frontmatter 注释。

### D5: Frontmatter Zod schema（`shared/frontmatter-schema.ts`）

```ts
const FrontmatterSchema = z
  .object({
    title: z.string().optional(),
    url: z.string().url().optional(),
    site: z.string().optional(),
    author: z.string().optional(),
    published_at: z.string().optional(), // ISO date
    clipped_at: z.string().datetime().optional(),
    source_type: z.enum(['article', 'rss', 'manual']).optional(),
    summary: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    reviewed_at: z.string().datetime().optional(),
    reviewed_model: z.string().optional(),
    reviewed_version: z.number().int().nonnegative().optional(),
    reviewed_error: z.string().optional(), // 理果失败标记（phase 15）
    sync_warning: z.string().optional() // 预留（phase 2 已在 project.json 用）
  })
  .passthrough()
```

**理由**：passthrough 支持用户/未来字段；`.optional()` 支持老文件慢慢补齐。

### D6: safeResolve

```ts
safeResolve(groveRoot: string, p: string): string {
  // p 可以是相对或绝对路径
  const abs = path.resolve(groveRoot, p)
  const normRoot = path.resolve(groveRoot) + path.sep
  if (!(abs === path.resolve(groveRoot) || abs.startsWith(normRoot)))
    throw new IpcError('E_PERMISSION', 'path escapes grove')
  if (abs.split(path.sep).includes('..'))
    throw new IpcError('E_PERMISSION', 'traversal')
  // 可选：fs.realpath 做一次 symlink resolve，对比 realpath 仍在 grove 内
  return abs
}
```

调用方：`file.*` IPC handler、未来 phase 16 的 agent tools。

**理由**：简单、纯函数、可单元测试；realpath 校验默认不启用（I/O 代价），可通过选项开启（用于信任敏感的 AI tool）。

### D7: 写后校验

`file.write` 流程：

1. `writeFileAtomic(abs, normalized)`
2. `readFile(abs)` → 计算 sha256
3. 与输入的期望 hash 对比；不符 → 等 50ms 再读一次（iCloud 延迟）；仍不符 → 删除刚写的内容回退到原版本（若存在备份则恢复）并抛 `E_WRITE_VERIFY`

**理由**：云盘写后读延迟是 PRD 边界明确项；用户宁可报错也不接受静默损坏。

### D8: mtime 乐观锁（机制就位，用在 phase 9）

`file.write(rel, content, { expectedMtime?: number })`：

- 读 `fs.stat(abs).mtimeMs`
- 若 `expectedMtime` 提供且与当前 mtime 不一致 → 抛 `E_MTIME_MISMATCH`（带当前值），**不**执行写入
- 一致或未提供 → 正常走原子写

**理由**：让 phase 9 的冲突处理直接使用；此阶段不用但 API 稳定。

## Risks / Trade-offs

- **`fs.rename` 在 Windows 对同路径短时间内可能被 AV 扫描锁住** → 捕获 `EPERM/EBUSY` 重试 2 次，间隔 50ms
- **`iconv-lite` 检测 GBK 不是 100% 可靠** → 对中文 md 文件错判率可接受（<1%）；失败则返回 `E_ENCODING` 让用户显式另存 UTF-8
- **symlink 被人为放置在树林内指向外部** → `safeResolve` 可选 realpath；默认不开启但 `file.list` 跳过 symlink（见 D3 of proposal）
- **gray-matter 序列化与原 YAML 有细微差异** → 用户 frontmatter 会被轻微"规范化"；大部分用户无感；对极端在意的（YAML 双引号变单引号）后续可考虑 `js-yaml` 自实现
- **写后读回在超大文件（数 MB）开销** → MD 文件一般 <100KB，代价可接受；超大文件另议
- **`file.list(recursive=true)` 在大库上慢** → 本阶段仅实现，indexer（phase 5）会用自己的 walker；UI 列表不直接用 `file.list`

## Migration Plan

无存量。

回滚：删除本 change 引入的 services 与 IPC，不影响任何已有数据文件。

## Open Questions

- 是否为 JSON 持久化（如 `project.json` / `recent-projects.json` / `bookmarks.json`）复用 `writeFileAtomic`？**是**，phase 2 的 recent-projects 改造为此处的 `writeFileAtomic`；本阶段 tasks 里加一条 phase 2 代码的改造
- 是否要 `file.read` 时把 gray-matter 解析也一并做了？**否**，`file.read` 只返回 raw 字符串；调用方需要 frontmatter 时再调 `file.readParsed`
