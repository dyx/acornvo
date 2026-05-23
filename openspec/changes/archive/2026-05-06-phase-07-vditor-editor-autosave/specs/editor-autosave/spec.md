## ADDED Requirements

### Requirement: 自动保存触发口径

系统 SHALL 在以下四个时机触发保存：输入停止 1000ms（debounce）、编辑容器 blur、路由离开、窗口隐藏（`visibilitychange`=hidden）。四个触发口径 MUST 走同一 `save()` 入口，保存参数一致。`Cmd/Ctrl+S` 手动保存 MUST 等价于立即 flush。

#### Scenario: 输入停止 1s 后保存

- **WHEN** 用户停止输入 1s
- **THEN** 调用 `file.write(path, fullText, { expectedMtime: savedMtimeMs })`；成功后 dirty=false

#### Scenario: 失焦保存

- **WHEN** 编辑器容器 blur（用户点其他 UI）
- **THEN** 若 dirty 立即 save；debounce timer 被取消

#### Scenario: 离开路由保存

- **WHEN** 用户 navigate 到 `/library`
- **THEN** 先 await 当前 in-flight save，再若 dirty 再 save 一次，完成后再真正导航

#### Scenario: 窗口隐藏保存

- **WHEN** `document.visibilityState === 'hidden'`
- **THEN** 触发一次同步 flush；即便稍后窗口被 macOS 彻底隐藏，last body 已落盘

#### Scenario: 手动保存

- **WHEN** 用户按 `Cmd+S` / `Ctrl+S`
- **THEN** 立即 flush（取消 debounce timer + 如 dirty 立即 save）

### Requirement: 保存并发控制

保存 SHALL 最多保留一个 in-flight 请求。若 in-flight 期间用户继续输入，MUST 在 in-flight 完成后自动再保存一次（仅当 `body !== savedBody`），而非并发写入。

#### Scenario: 重复触发合并

- **WHEN** 在 save 进行中用户又输入并触发 debounce
- **THEN** 不开新请求；前一个 save 完成后自动再发一次，且带最新 body

#### Scenario: 最终一致性

- **WHEN** 用户连续输入 5 次（每次触发 debounce）
- **THEN** 最终磁盘 body 等于最后一次输入后的 body

### Requirement: mtime 乐观锁接线

`file.write` 调用 MUST 携带 `expectedMtime = savedMtimeMs`。保存成功后，系统 SHALL 把返回的新 `mtimeMs` 写回 `savedMtimeMs`。若返回 `E_MTIME_MISMATCH`，MUST 把错误抛到 editor store 的 `lastError`，toast 提示"文件在外部被修改"。

#### Scenario: 首次保存

- **WHEN** 打开文件后立即保存，`savedMtimeMs` = 加载时的 mtime
- **THEN** IPC 调用携带该 mtime；成功；`savedMtimeMs` 更新为新 mtime

#### Scenario: 冲突占位

- **WHEN** 文件在外部被改动（磁盘 mtime 变化），editor 再保存
- **THEN** IPC 返回 `E_MTIME_MISMATCH`；editor 不覆盖磁盘；dirty 保留；toast "文件在外部被修改，将在冲突处理阶段提供合并选项"

### Requirement: 保存错误重试与上限

对于 `E_PERMISSION` / `E_NOSPACE` / `E_INTERNAL` 等非冲突错误，系统 SHALL 保留 dirty 状态并 toast 错误码；用户下次输入继续触发 save。连续 3 次失败 MUST 弹出持久化提示"保存持续失败，查看日志"并提供打开日志目录入口。

#### Scenario: 权限错误持续

- **WHEN** 文件系统权限异常，连续 3 次 save 均 `E_PERMISSION`
- **THEN** 弹出 modal 提示 + "打开日志目录"按钮（`shell.openPath('~/.acornvo/logs/')`）

#### Scenario: 暂态错误恢复

- **WHEN** 一次 `E_NOSPACE` 后用户清理磁盘继续输入
- **THEN** 下一次 debounce 触发的 save 成功；错误计数清零

### Requirement: selfWrites 静默

编辑器保存 MUST 最终调用 main 侧的 `file.write`，该调用内部自动注册 `selfWrites`（phase 5 约定）。因此 watcher SHALL NOT 为编辑器自己的写入触发 `index:fileChanged` 事件，进而 Library 列表 MUST NOT 因为此保存而重新查询。

#### Scenario: 保存不扰动果仓

- **WHEN** 用户在编辑器保存
- **THEN** 同 Electron 进程的 renderer 不收到 `index:fileChanged`；Library 列表无重新加载
