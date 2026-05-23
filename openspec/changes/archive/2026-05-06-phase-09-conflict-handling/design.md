## Context

前置：

- phase 4：`file.write(path, body, { expectedMtime })` → `E_MTIME_MISMATCH`；`writeFileAtomic` + `safeResolve`
- phase 5：`selfWrites` Map + `index:fileChanged/Deleted/Renamed` 事件；事件目前 payload 仅 `{ path }`（根据 phase 5 spec），本阶段扩展
- phase 7：editor store 的 `{ savedMtimeMs, dirty, saving, lastError }`；保存失败目前仅 toast
- phase 2：`.acornvo/` 目录在 grove 打开时初始化

典型冲突场景：

1. **静态冲突（常见）**：用户 A 打开 md 编辑 → 用户 B 用 Obsidian/另一 App 改同一 md → A 按 Cmd+S
2. **同步软件冲突**：iCloud / OneDrive 后台下拉远端版本覆盖本地 → A 在编辑
3. **git 冲突**：用户 `git pull` 在 Acornvo 外部，本地文件 mtime 跳变

## Goals / Non-Goals

**Goals:**

- 用户永不"偷偷丢失数据"：冲突一定有交互 + 快照
- 外部修改在编辑器前台能被感知，不等到保存时才爆
- 三选项语义清晰，快照可回溯（phase 10 接 UI）
- mtime 比较是唯一 source of truth；不做文本 diff 合并（留 backlog）

**Non-Goals:**

- 不做自动三路合并（太复杂，md 段落级合并需 AST 或 diff3；phase 9 不做）
- 不做逐段 cherry-pick（需要 diff UI）
- 不做冲突解决过程中的 AI 辅助（backlog）
- 不做非编辑器场景的冲突（比如 phase 15 理果写 frontmatter）—— 这些路径本阶段直接走 `force: false` + 重试 1 次策略，不拉 UI
- 不持久化 ConflictState 到 localStorage（editor 关闭即消失；未保存本地修改会进"另存副本"语义）

## Decisions

### D1: mtime 是唯一冲突信号

判定规则：

- editor 加载时记录 `loadedMtimeMs`
- 保存时 `file.write(path, body, { expectedMtime: loadedMtimeMs })`
- main 侧：`stat(absPath).mtimeMs` vs `expectedMtime` 不等 → 返回 `{ error: { code: 'E_MTIME_MISMATCH', remoteMtimeMs, remoteSize } }`

**容忍度**：±2ms（某些文件系统 mtime 精度有限），避免假阳性。

**理由**：mtime 便宜、与外部工具兼容；content_hash 比较更准但要读磁盘 + 计算，慢且仍有写时机问题。冲突是边缘场景，mtime 足够。

### D2: 编辑器前台外部修改感知

事件来源：phase 5 的 `index:fileChanged(path, { mtimeMs })`。

editor store 在 ready 态订阅该事件：

```
if (path !== currentPath) return
if (mtimeMs === savedMtimeMs) return  // 自己写回的回声（虽然 selfWrites 应过滤，但二次防御）
if (dirty) {
  // 用户有未保存修改 → 显示 ExternalModifiedBanner
  conflictState = { kind: 'externalModified', remoteMtimeMs: mtimeMs }
} else {
  // 无本地修改 → 静默 reload
  await files.get(path) → update body/savedBody/savedMtimeMs
}
```

**为什么需要扩 event payload**：phase 5 原 payload 只有 path，renderer 无法判断 mtime 是否真变。本阶段 MODIFIED file-indexer 事件 schema。

### D3: ConflictDialog 三选项

触发：保存时遇 `E_MTIME_MISMATCH`（**不是**外部修改感知；感知走 banner 而非 dialog）。

Dialog 内容：

- 顶部文案："这个文件在 Acornvo 之外被修改过。你想怎么处理？"
- 文件路径 + 本地改动字数 + 远端修改时间（`remoteMtimeMs` 格式化）
- 三个大按钮（纵向排列）：
  1. **保留本地**（危险操作，红色次要按钮）：说明"将覆盖磁盘上的外部修改。快照仍会保留。"
  2. **重载磁盘**（主按钮，蓝色）：说明"丢弃你在 Acornvo 中未保存的修改。"
  3. **另存副本**（中性）：说明"把你的修改另存为 `<name>.conflict.<ts>.md`，磁盘原文件保留外部版本。"
- 左下：`[查看差异]` 链接（phase 9 暂不做 diff UI，灰化或提示 "差异视图将于后续版本提供"）
- 左下：`[稍后处理]` → 关 dialog；editor 保持 dirty 态，用户可继续编辑；下次 save 再弹

**理由**：三选项命名贴合 UX；"保留本地"放在最上是因为"最危险但偶尔必要"；用户需主动确认。

### D4: 快照写入与目录布局

冲突发生（任一解决动作被确认）时，写入：

```
.acornvo/conflicts/
  2026-04-18T12-30-45-notes-a/
    local.md      # editor 当前 body 合成的全文（含 frontmatter）
    remote.md     # 磁盘当前全文（即 remote）
    base.md       # editor 加载时的初始全文（editor store 在 open() 时保存一份 baseBody）
    meta.json     # { path, ts, resolved_by: 'keep_local' | 'load_remote' | 'save_as', winner_path?: string }
```

存储规则：

- 目录名：ISO8601 时间戳（`:` 替换为 `-`，兼容 Windows）+ path 首段（方便肉眼识别）
- 三份 md 均是完整文件副本（不做 diff），每个 < 1MB，冲突罕见，总容量可控
- 保留策略：启动时扫 `.acornvo/conflicts/`，按 mtime 排序，超过 30 天或超过 100 条的最旧项删除

**理由**：完整快照最简单且可回溯；diff 可由 phase 10 的 UI 再计算；文件名含 path 便于手工查找。

### D5: file.write 的 force 选项

MODIFIED `md-file-io`：

```ts
file.write(path, body, opts?: {
  expectedMtime?: number,  // 省略 = 不校验（保留 force: true 的语义）
  force?: boolean,         // 显式跳校验；等效 expectedMtime 省略，但日志区分
  createDirs?: boolean,    // 已有
})
```

- `force: true` → main 侧跳过 `stat` 校验 → `selfWrites` 注册 + `writeFileAtomic`
- `force: true` 的调用 MUST 在日志打 `force-write` 标签，便于审计
- 默认（无 `force` 无 `expectedMtime`）仍校验 mtime：若文件存在 → 要求 expectedMtime；否则视为新建

**理由**：语义显式；保留可审计性。

### D6: "另存副本"的路径选择

本地修改 → `<basename>.conflict.<ts>.md`，与原文件同目录。

- 例：`notes/a.md` → `notes/a.conflict.2026-04-18T12-30-45.md`
- 写入后：editor 切换到新路径（`navigate('/editor/' + encodeURIComponent(newPath))`）；磁盘原 `notes/a.md` 保留 remote 版本

**理由**：同目录最直观；indexer 会自动索引新文件；用户可在果仓对比两个文件。

**风险**：若新路径已被占（罕见），加数字后缀 `-1`、`-2` 递增直至可用。

### D7: externalModified Banner

渲染：编辑器 TitleBar 下方一条黄色/橙色 banner

- 文案："这个文件在外部被修改了。"
- 按钮："重载（丢弃我的修改）" / "忽略（我自己处理）"
- "重载"：调 files.get + 重置 editor state
- "忽略"：关 banner；用户下次保存仍会触发 ConflictDialog（mtime 仍然 mismatch）

**理由**：非 modal 降低打扰；用户专注写作时可选择忽略。

### D8: baseBody 追踪

editor store 在 `open(path)` 成功后保存：

```
baseBody: string      // 文件加载时的 body（frontmatter 不含，与 saved/current 一致）
baseFrontmatter: Frontmatter
baseMtimeMs: number
```

仅在 `open(path)` 重置；`save()` 成功**不**更新 base（只更新 saved）。

**理由**：三路快照需要 base；save 成功更新 saved 但 base 保留加载态，便于冲突时提供"我从这个版本开始改起"的语义。

### D9: 冲突历史 IPC

```
conflict.list(limit: number) → { items: ConflictItem[], total }
conflict.read(id: string) → { meta, localText, remoteText, baseText }  // id = 目录名
conflict.delete(id: string) → { ok: true }
```

`ConflictItem = { id, path, ts, resolved_by, winner_path? }`；phase 10 的 history 页接 UI。本阶段验收只看 IPC 能工作 + `.acornvo/conflicts/` 目录结构正确。

### D10: 保存加锁

在 ConflictDialog 打开期间 editor SHALL 锁住自动保存（debounce/blur/visibilityChange 都不触发）。`Cmd+S` 也不再触发，直到用户做出选择。

**理由**：防止对话框期间用户继续输入又触发多次 save。

## Risks / Trade-offs

- [mtime 跨文件系统精度差异] → 加 ±2ms 容忍；仍有极少误报；用户看到 ConflictDialog 时体感"无外部改但弹了"——可接受，提示文案明确"Acornvo 以外的工具或同步软件"
- [快照目录增长] → 30 天 + 100 条上限；用户也可在 phase 13 设置页清空
- [同一文件短时间多次冲突同一 base] → 每次都写新快照，不 dedupe；容量可控
- [另存副本文件名冲突] → 加数字后缀；极端情况下用户手工改名
- [editor 后台事件竞态] → banner 显示时又来一次 fileChanged（外部再次改）→ 覆盖 `remoteMtimeMs`；不刷新 banner 文案（保持最新状态即可）
- [force 覆盖会真的丢外部修改] → 快照留档；phase 10 UI 可恢复；文案明确警告

## Migration Plan

- `.acornvo/conflicts/` 目录由 phase 2 的 grove init 创建（ensureDir 追加）；老树林首次打开 phase 9 版本时自动补建
- phase 5 事件 payload 扩展：只增字段，不破坏 phase 6 现有订阅（订阅者不读新字段无影响）
- 回滚：删 phase 9 新增文件；editor 退回 phase 7 的 toast 语义；`.acornvo/conflicts/` 留着无害

## Open Questions

- 三路 diff 视图放 phase 9 还是 phase 10？**phase 10**（与 trash/history 合并做一个 "历史" 面板更经济）
- 保存冲突时"重载磁盘"是否也要快照？**是**，遵循"任何冲突都留快照"原则（resolved_by='load_remote'）
- force-write 是否需要二次确认弹窗？**dialog 本身就是确认**，再弹一次繁琐；dialog 文案已警示"覆盖外部修改"
