## MODIFIED Requirements

### Requirement: mtime 乐观锁接线
`file.write` 调用 MUST 携带 `expectedMtime = savedMtimeMs`。保存成功后，系统 SHALL 把返回的新 `mtimeMs` 写回 `savedMtimeMs`。若返回 `E_MTIME_MISMATCH`：
- 系统 MUST 调 `files.get(path)` 拉取 remote 全文（frontmatter + body + mtimeMs）
- MUST 将 `conflictState` 设为 `{ kind: 'saveConflict', remoteMtimeMs, remoteBody, remoteFrontmatter }`
- MUST 暂停自动保存调度（debounce/blur/visibilitychange/Cmd+S 全部被锁）直到 ConflictDialog 关闭
- MUST 由 UI 层立即打开 ConflictDialog；用户作出选择后系统执行对应动作（keep_local / load_remote / save_as）

`force: true` 写入 SHALL 在 ConflictDialog 的"保留本地"分支使用；不应由自动保存直接发起。

#### Scenario: 首次保存
- **WHEN** 打开文件后立即保存，`savedMtimeMs` = 加载时的 mtime
- **THEN** IPC 调用携带该 mtime；成功；`savedMtimeMs` 更新为新 mtime

#### Scenario: mtime 冲突触发 Dialog
- **WHEN** 文件在外部被改动，editor 再保存
- **THEN** IPC 返回 `E_MTIME_MISMATCH`；conflictState 变为 `saveConflict`；ConflictDialog 打开；自动保存被锁

#### Scenario: Dialog 未关时忽略快捷键
- **WHEN** ConflictDialog 打开时用户按 `Cmd+S`
- **THEN** 不触发 save；事件被 Dialog 层阻止或 editor store 判断 `conflictState.kind==='saveConflict'` 时 no-op

#### Scenario: "保留本地" 使用 force
- **WHEN** 用户在 Dialog 选"保留本地"
- **THEN** 调 `file.write(path, stringify(frontmatter, body), { force: true })`；成功后 savedBody=body、savedMtimeMs=new、conflictState=none；自动保存解锁

### Requirement: 外部修改时暂停自动保存
当 `conflictState.kind === 'externalModified'` 或 `'saveConflict'` 时，自动保存调度 SHALL 暂停：debounce timer 不起、blur 不触发 flush、visibilitychange 不触发 flush、`Cmd+S` 不触发 save。用户解决冲突或主动"忽略"后 MUST 立即恢复。

#### Scenario: banner 期间输入不触发保存
- **WHEN** ExternalModifiedBanner 显示期间用户继续输入
- **THEN** body 更新，dirty 保持 true；无 `file.write` 调用

#### Scenario: 点"忽略"恢复
- **WHEN** 用户点 banner 的"忽略"按钮
- **THEN** 自动保存调度恢复；下一次输入后 1s debounce 触发 save（然后会 mismatch 进 Dialog）

### Requirement: 保存错误重试与上限
对于 `E_PERMISSION` / `E_NOSPACE` / `E_INTERNAL` 等**非 mtime 冲突**错误，系统 SHALL 保留 dirty 状态并 toast 错误码；用户下次输入继续触发 save。连续 3 次失败 MUST 弹出持久化提示"保存持续失败，查看日志"并提供打开日志目录入口。`E_MTIME_MISMATCH` MUST NOT 计入重试计数（走 ConflictDialog 路径，不计失败）。

#### Scenario: 权限错误持续
- **WHEN** 文件系统权限异常，连续 3 次 save 均 `E_PERMISSION`
- **THEN** 弹出 modal 提示 + "打开日志目录"按钮（`shell.openPath('~/.acornvo/logs/')`）

#### Scenario: 冲突不计入失败
- **WHEN** 连续 3 次 save 均返回 `E_MTIME_MISMATCH`（用户每次在 Dialog 点"稍后处理"后继续编辑）
- **THEN** 不弹出"保存持续失败"的 modal；仅走 ConflictDialog 流程
