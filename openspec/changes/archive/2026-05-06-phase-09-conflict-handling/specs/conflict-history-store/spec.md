## ADDED Requirements

### Requirement: 冲突快照目录结构

冲突解决（banner 或 dialog 任一动作确认）时系统 SHALL 在 `<grove>/.acornvo/conflicts/<id>/` 写入快照。`<id>` 格式为 `<ISO_TS>-<pathSlug>`，其中 `ISO_TS` 的 `:` 替换为 `-`，`pathSlug` 为相对路径的前 40 字符（`/` 替换为 `_`，非法字符替换为 `-`）。

每个 `<id>` 目录 MUST 包含：

- `local.md`：editor 当前 body 合成的完整 md（frontmatter + body）
- `remote.md`：磁盘当前完整 md
- `base.md`：editor 加载时的完整 md（baseFrontmatter + baseBody）
- `meta.json`：`{ path, ts, resolved_by: 'keep_local' | 'load_remote' | 'load_remote_banner' | 'save_as', winner_path?: string }`

#### Scenario: 目录生成

- **WHEN** 冲突解决完成（任一类型）
- **THEN** `.acornvo/conflicts/2026-04-18T12-30-45-notes_a/` 存在且含 4 个文件

#### Scenario: meta 内容

- **WHEN** 解决动作为"另存副本"，原路径 `notes/a.md`，新路径 `notes/a.conflict.2026-04-18T12-30-45.md`
- **THEN** `meta.json` = `{"path":"notes/a.md","ts":"2026-04-18T12:30:45Z","resolved_by":"save_as","winner_path":"notes/a.conflict.2026-04-18T12-30-45.md"}`

### Requirement: 保留策略

启动时或每次写入快照前，系统 SHALL 执行保留策略：按目录 mtime 倒序保留最新 100 条；超过 30 天的最旧项也删除。

#### Scenario: 超出 100 条

- **WHEN** 已有 101 条快照
- **THEN** 最旧的 1 条目录被删

#### Scenario: 超过 30 天

- **WHEN** 某快照目录 mtime 超过 30 天
- **THEN** 下次启动或新写入时被删

### Requirement: conflict.list IPC

系统 SHALL 提供 `conflict.list({ limit, offset })` IPC，返回 `{ items: ConflictItem[], total }`，按 ts 降序。`ConflictItem = { id, path, ts, resolved_by, winner_path? }`（从 meta.json 读）。

#### Scenario: 列出冲突

- **WHEN** `.acornvo/conflicts/` 含 5 条
- **THEN** `conflict.list({ limit: 10, offset: 0 })` 返回 5 条，按 ts 倒序

### Requirement: conflict.read IPC

系统 SHALL 提供 `conflict.read(id)` IPC，返回 `{ meta, localText, remoteText, baseText }`，三份文本为对应文件全文。不存在的 id MUST 返回 `E_NOT_FOUND`。

#### Scenario: 读取快照

- **WHEN** `conflict.read('2026-04-18T12-30-45-notes_a')`
- **THEN** 返回 meta + 三份文本内容

#### Scenario: id 不存在

- **WHEN** `conflict.read('nonexistent')`
- **THEN** 返回 `E_NOT_FOUND`

### Requirement: conflict.delete IPC

系统 SHALL 提供 `conflict.delete(id)`，用 `fs.rm(recursive)` 删除目录，返回 `{ ok: true }`。`safeResolve` MUST 确保目标位于 `<grove>/.acornvo/conflicts/` 子树内。

#### Scenario: 删除快照

- **WHEN** `conflict.delete('<id>')`，`<id>` 合法
- **THEN** 对应目录被删；后续 `conflict.read(id)` 返回 `E_NOT_FOUND`

#### Scenario: 路径越界防御

- **WHEN** `conflict.delete('../..')`
- **THEN** 返回 `E_PERMISSION`；无任何删除

### Requirement: 目录初始化

首次对该 grove 产生冲突前，系统 SHALL 自动 `ensureDir('<grove>/.acornvo/conflicts/')`。该目录 MUST 加入 phase 2 的 `.acornvo/` 初始化流程。

#### Scenario: 新 grove 首次冲突

- **WHEN** 全新 grove 首次发生冲突，`.acornvo/conflicts/` 此前不存在
- **THEN** 写入前自动创建该目录；不报错
