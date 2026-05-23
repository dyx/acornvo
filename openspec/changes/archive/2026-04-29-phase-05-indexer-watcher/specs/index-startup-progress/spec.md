## ADDED Requirements

### Requirement: 启动扫描进度事件

全量扫描期间系统 SHALL 周期性推送 `index:progress { scanned: number, total: number, currentPath?: string }` 事件；扫描完成推送 `index:done`；不可恢复错误推送 `index:error`。

#### Scenario: 进度可感知

- **WHEN** 扫描 100 个文件的树林
- **THEN** 至少收到 10 次 `index:progress` 事件
- **AND** 最后一次 `scanned === total`，随后一次 `index:done`

#### Scenario: 扫描错误

- **WHEN** SQLite 写入中抛出不可恢复错误
- **THEN** 推送 `index:error { message }`，`IndexState` 变为 `error`

### Requirement: 索引状态机

系统 SHALL 维护 `IndexState: 'idle' | 'scanning' | 'ready' | 'watching' | 'error'`。树林切换 MUST 把状态重置为 `idle`。理果 / 松语等下游模块 MUST 通过 `index.status()` 或订阅 `index:stateChange` 获取状态。

#### Scenario: 打开树林状态流

- **WHEN** 打开一棵树林
- **THEN** 状态依次 `idle → scanning → ready → watching`
- **AND** 每次切换都发出 `index:stateChange` 事件

#### Scenario: 切换树林

- **WHEN** 当前状态 `watching` 时切换到另一棵树林
- **THEN** 先收 `idle` 再收 `scanning` 等新的扫描流程

### Requirement: 扫描可取消

系统 SHALL 支持 `index.cancelScan()`；cancel 后扫描 MUST 在当前文件处理完成后立即停止，已写入的 db 变更保持。取消后 `IndexState` MUST 回到 `idle`。

#### Scenario: 用户点击"后台继续"

- **WHEN** 用户在进度遮罩中点击 cancel（后台继续）
- **THEN** 扫描在当前文件完成后停止，UI 遮罩消失
- **AND** 用户可以浏览已索引部分；未索引部分的 md 暂不出现在 files 表

（注：PRD 中"后台继续"包含"UI 遮罩消失但继续扫"的语义 —— 本阶段实装版本采用"暂停并移除遮罩"，真正的"后台继续"留给后续 change；本 spec 以"cancel"为准）

### Requirement: 启动门禁

系统 SHALL 在 `IndexState !== 'watching'` 时拒绝或挂起后续依赖完整索引的模块调用（理果 / 松语 / 搜索）。具体拒绝策略由各下游模块在其 change 中实现；本阶段 MUST 通过 `index.status()` 向 renderer 暴露状态。

#### Scenario: 状态查询

- **WHEN** renderer 调用 `window.api.index.status()`
- **THEN** 返回 `{ state, total, scanned?, error? }`
