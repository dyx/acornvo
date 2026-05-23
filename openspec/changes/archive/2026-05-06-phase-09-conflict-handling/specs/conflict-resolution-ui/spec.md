## ADDED Requirements

### Requirement: ExternalModifiedBanner

当 `conflictState.kind === 'externalModified'` 时 editor SHALL 在 TitleBar 下方渲染黄色 banner：文案"这个文件在外部被修改了"、"重载（丢弃我的修改）" / "忽略（我自己处理）" 两个按钮。banner 期间自动保存（debounce/blur/visibilitychange/Cmd+S）MUST 被暂停。

#### Scenario: banner 显示

- **WHEN** dirty=true 且收到 index:fileChanged
- **THEN** banner 可见；背景色黄；包含两个按钮

#### Scenario: 重载丢弃本地

- **WHEN** 用户点 "重载"
- **THEN** 调 files.get → 更新 body/savedBody/baseBody/savedMtimeMs；dirty=false；banner 消失；conflictState=none；写一条轻量 conflict history（resolved_by='load_remote_banner'）

#### Scenario: 忽略保留本地

- **WHEN** 用户点 "忽略"
- **THEN** banner 消失；conflictState=none；dirty 保留；自动保存解锁；下一次 save 会触发 ConflictDialog

### Requirement: ConflictDialog 三选项

保存遇 `E_MTIME_MISMATCH` 时 editor SHALL 打开 ConflictDialog（modal，blocking）。Dialog MUST 包含：

- 标题："这个文件在 Acornvo 之外被修改过。你想怎么处理？"
- 元信息：文件路径、本地未保存字数、远端修改时间（formatDistance）
- 三个按钮（纵向，每个带副文案）：
  1. "保留本地"（secondary destructive）：副文案"将覆盖磁盘上的外部修改。快照仍会保留。"
  2. "重载磁盘"（primary）：副文案"丢弃你在 Acornvo 中未保存的修改。"
  3. "另存副本"（tertiary）：副文案"把你的修改另存为 `<name>.conflict.<ts>.md`。"
- 次要链接："查看差异"（本阶段灰化，提示 phase 10 提供）、"稍后处理"

Dialog 关闭前 MUST 禁止键盘快捷键触发保存。

#### Scenario: Dialog 弹出

- **WHEN** save 返回 `E_MTIME_MISMATCH`
- **THEN** ConflictDialog 弹出；editor 编辑区交互被屏蔽；body textarea 不再响应 Cmd+S

#### Scenario: "保留本地"

- **WHEN** 用户点"保留本地"
- **THEN** 写 conflict 快照（local/remote/base + meta.resolved_by='keep_local'）→ 调 `file.write(path, body, { force: true })`→ 成功后 savedBody=body、savedMtimeMs=new → dialog 关闭、conflictState=none

#### Scenario: "重载磁盘"

- **WHEN** 用户点"重载磁盘"
- **THEN** 写 conflict 快照（resolved_by='load_remote'）→ 调 files.get → 更新 editor 所有状态 → dialog 关闭

#### Scenario: "另存副本"

- **WHEN** 用户点"另存副本"；原路径 `notes/a.md`
- **THEN** 生成目标路径 `notes/a.conflict.<ISO_TS>.md`（冲突则 `-1`/`-2` 递增）→ `file.write(newPath, body)` 成功 → 写 conflict 快照（resolved_by='save_as', winner_path=newPath）→ dialog 关闭 → editor 切换到新路径（navigate）→ 磁盘原文件保留外部版本

#### Scenario: "稍后处理"

- **WHEN** 用户点"稍后处理"
- **THEN** dialog 关闭；conflictState 退回 `externalModified`；dirty 保留；banner 重新显示；下次 save 再弹 dialog

### Requirement: 副本命名去重

另存副本的目标路径已存在时 SHALL 追加 `-1`/`-2`/... 递增后缀直至可用。时间戳格式 MUST 为 `YYYY-MM-DDTHH-mm-ss`（冒号替换为连字符，兼容 Windows）。

#### Scenario: 路径已占

- **WHEN** 目标 `notes/a.conflict.2026-04-18T12-30-45.md` 已存在（同秒二次冲突）
- **THEN** 改名为 `notes/a.conflict.2026-04-18T12-30-45-1.md`；仍占则 `-2`，以此类推
