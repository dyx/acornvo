## 1. 目录与类型

- [x] 1.1 phase 2 的 `.acornvo/` init 追加 `ensureDir('.acornvo/conflicts/')`
- [x] 1.2 `shared/conflict-types.ts`：`ConflictItem` / `ConflictMeta` / `ConflictState`
- [x] 1.3 `src/main/conflicts/store.ts`：目录封装（read/list/write/delete/prune）

## 2. md-file-io MODIFIED

- [x] 2.1 `file.write(path, body, opts?: { expectedMtime?, force?, createDirs? })`
- [x] 2.2 main 实现：
  - [x] 2.2.1 `force: true` 分支：跳 stat 校验；日志打 `force-write`（path/old_mtime/new_mtime）
  - [x] 2.2.2 `expectedMtime` 分支：读当前 mtime，差值超过 2ms → 返回 `E_MTIME_MISMATCH` 含 `remoteMtimeMs`
  - [x] 2.2.3 成功路径：完成 writeFileAtomic 后 `selfWrites.set(absPath, { mtimeMs: newStat.mtimeMs, expiresAt: now+3s })`
- [x] 2.3 单元测试：容忍度边界 / force / 并发

## 3. 冲突快照 store（main）

- [x] 3.1 `buildId(path, ts)`：`ts.replaceAll(':','-') + '-' + slug(path)`（40 字符 cap）
- [x] 3.2 `writeSnapshot({ path, baseText, localText, remoteText, resolvedBy, winnerPath? })`
  - [x] 3.2.1 ensureDir `.acornvo/conflicts/<id>/`
  - [x] 3.2.2 同时 writeFileAtomic 4 个文件
  - [x] 3.2.3 写完触发 `prune()`
- [x] 3.3 `prune()`：按 mtime 排序 → 删超过 100 条最旧项 / 超过 30 天项
- [x] 3.4 `listSnapshots({ limit, offset })`：读目录 + 每个 meta.json 合并
- [x] 3.5 `readSnapshot(id)`：读 4 个文件返回
- [x] 3.6 `deleteSnapshot(id)`：`safeResolve` 在 conflicts 子树内 + `fs.rm(recursive)`

## 4. IPC 注册（main）

- [x] 4.1 `shared/ipc-contract.ts` 追加 `conflict` 命名空间：`list` / `read` / `delete`
- [x] 4.2 `electron/ipc/conflicts.ts` 接入上述三个；错误兜底 `E_INTERNAL` + log
- [x] 4.3 `file.write` IPC 暴露 `force` 字段（既有 handler 扩展）

## 5. editor store 扩展（conflict-detection / editor-autosave MODIFIED）

- [x] 5.1 新增字段：`baseBody` / `baseFrontmatter` / `baseMtimeMs`（open 时填充；save 不更新）
- [x] 5.2 新增 `conflictState: ConflictState`；初始 `{ kind: 'none' }`
- [x] 5.3 订阅 `index:fileChanged`：
  - [x] 5.3.1 过滤（path/mtime/selfWrites 冗余防御）
  - [x] 5.3.2 dirty=false → 静默 reload（调 files.get，重置 body/saved/base/savedMtimeMs）
  - [x] 5.3.3 dirty=true → conflictState='externalModified'，UI 显示 banner
- [x] 5.4 save 失败 `E_MTIME_MISMATCH`：
  - [x] 5.4.1 调 `files.get(path)` 拿 remote { frontmatter, body, mtimeMs }
  - [x] 5.4.2 conflictState=`saveConflict` 带 remote 全文
  - [x] 5.4.3 触发 UI 打开 ConflictDialog
- [x] 5.5 当 conflictState.kind ∈ {externalModified, saveConflict} 时，`scheduleSave/flushSave/Cmd+S` 全部 no-op
- [x] 5.6 重试计数只针对非冲突错误；`E_MTIME_MISMATCH` 不计入

## 6. ExternalModifiedBanner（conflict-resolution-ui）

- [x] 6.1 `src/components/editor/ExternalModifiedBanner.tsx`：黄色横条、两个按钮
- [x] 6.2 "重载" → 调 `editor.reloadFromDisk()`（写 conflict 快照，resolved_by='load_remote_banner'）
- [x] 6.3 "忽略" → conflictState=none；dirty 保留；保存解锁

## 7. ConflictDialog（conflict-resolution-ui）

- [x] 7.1 `src/components/editor/ConflictDialog.tsx`：modal + 三按钮 + 元信息 + "稍后处理"
- [x] 7.2 "保留本地"：
  - [x] 7.2.1 调 `file.write(path, stringify(frontmatter, body), { force: true })`
  - [x] 7.2.2 成功后写 snapshot（resolved_by='keep_local'）
  - [x] 7.2.3 editor 状态：savedBody=body / savedMtimeMs=new / conflictState=none
- [x] 7.3 "重载磁盘"：
  - [x] 7.3.1 写 snapshot（resolved_by='load_remote'，以当前 editor 三份作为 local/base/remote）
  - [x] 7.3.2 调 `files.get(path)` → 重置 editor 全部状态
- [x] 7.4 "另存副本"：
  - [x] 7.4.1 生成新路径 `<basename>.conflict.<ISO_TS>.md`；冲突 → `-N` 递增
  - [x] 7.4.2 调 `file.write(newPath, stringify(frontmatter, body))`（无 force；新文件不需 expectedMtime）
  - [x] 7.4.3 写 snapshot（resolved_by='save_as', winner_path=newPath）
  - [x] 7.4.4 editor `navigate('/editor/' + encodeURIComponent(newPath))`
- [x] 7.5 "稍后处理" / Esc：conflictState 退回 externalModified；Dialog 关；banner 显示

## 8. i18n 与文案

- [x] 8.1 `conflict.dialog.title` / `conflict.dialog.meta_path` / `conflict.dialog.meta_words` / `conflict.dialog.meta_remote_time`
- [x] 8.2 三按钮文案 + 副说明；`conflict.banner.external_modified` / `conflict.banner.reload` / `conflict.banner.ignore`
- [x] 8.3 `conflict.dialog.later` / `conflict.dialog.diff_soon`

## 9. 验收

- [x] 9.1 editor 打开 `a.md`（未改）→ 外部改 a.md → editor 1s 内静默重载；body 更新；banner 不显示
- [x] 9.2 editor 打开 `a.md`（dirty）→ 外部改 a.md → banner 显示；此时输入无保存（用 devtools 观察 IPC）
- [x] 9.3 banner "重载" → 本地修改丢弃；快照在 `.acornvo/conflicts/<id>/` 生成 4 文件
- [x] 9.4 banner "忽略" → 继续输入触发 save → ConflictDialog 打开
- [x] 9.5 Dialog "保留本地" → 磁盘被覆盖为 local；快照生成；日志含 `force-write`
- [x] 9.6 Dialog "重载磁盘" → editor 变为 remote 内容；快照生成
- [x] 9.7 Dialog "另存副本" → 新文件 `a.conflict.<ts>.md` 出现；editor 切路由；原 `a.md` 保留 remote 内容
- [x] 9.8 Dialog "稍后处理" → Dialog 关；banner 重现；dirty 保留；下次 save 再弹
- [x] 9.9 同秒再次冲突另存 → 新文件自动 `-1` 后缀
- [x] 9.10 路径越界 `conflict.delete('../../etc')` → `E_PERMISSION`
- [x] 9.11 保留策略：人工灌 101 条目录 → 启动后最旧被删
- [x] 9.12 快照含 base.md 内容等于 editor 加载时原文（多次保存 base 不变）
- [x] 9.13 Dialog 打开期间按 `Cmd+S` 不触发 save；继续输入不触发 debounce save
- [x] 9.14 `E_MTIME_MISMATCH` 连 3 次（均选"稍后处理"）→ 不弹"保存持续失败"的 modal
- [x] 9.15 `E_PERMISSION` 连 3 次（非冲突）→ 弹"保存持续失败"的 modal（原有行为保留）
- [x] 9.16 单元测试：mtime ±2ms 容忍度；副本命名去重；prune 策略
- [x] 9.17 `openspec validate phase-09-conflict-handling --strict` 通过
