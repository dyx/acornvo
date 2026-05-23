## ADDED Requirements

### Requirement: 打开树林流水线集成 db 初始化

打开树林的流水线（`openGrove`）SHALL 在成功获取 lock 并读取 `project.json` 之后、返回成功之前，额外串行执行 db 初始化：连接 `<grove>/.acornvo/index.db` → integrity check → 可能重建 → 跑 migrations。整个流水线 MUST 作为一个事务性操作：任一步骤失败均回退（释放 lock、关闭已打开句柄、不更新 `last_opened_at`）。

#### Scenario: 成功打开

- **WHEN** 流水线全部步骤成功
- **THEN** `project:changed` 事件带新树林信息发出
- **AND** `db.version()` 可正常调用
- **AND** `last_opened_at` 被更新

#### Scenario: db 步骤失败回退

- **WHEN** db 初始化在 migrations 中抛错且重建亦失败
- **THEN** 本次打开的 lock 被释放
- **AND** `recent-projects.json` 中该项 `last_opened_at` 未被更新
- **AND** IPC 返回 `E_INTERNAL` 错误
- **AND** 当前树林仍为上一棵（若有）或 null
