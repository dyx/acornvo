## ADDED Requirements

### Requirement: FileSummary 类型契约

系统 SHALL 在 `shared/file-types.ts` 导出 `FileSummary` 类型：`{ path, title, category, rating, clipped_at, site, has_summary, tags, is_reviewing }`。所有 `files.list` / `files.get` / `quickSwitcher` / `mention` 等返回文件行的 IPC 调用 MUST 返回相同形态。

#### Scenario: 单一 DTO 源

- **WHEN** 新增调用方（phase 8 QuickSwitcher / phase 17 松语 @ 选择器）需要文件行列表
- **THEN** 复用同一 `FileSummary` 类型；不创建平行结构

### Requirement: is_reviewing 预留

`FileSummary.is_reviewing` 字段 SHALL 在本阶段恒为 `false`。后续阶段接入队列（phase 14）与理果（phase 15）后 MUST 通过 LEFT JOIN `queue` 表（`kind='review' AND status IN ('pending','running')`）计算真实值。

#### Scenario: 本阶段占位

- **WHEN** 调用 `files.list`
- **THEN** 每个返回项 `is_reviewing = false`

#### Scenario: 后续扩展不破坏调用方

- **WHEN** phase 15 实装真实 is_reviewing
- **THEN** 调用方无需改代码，字段值变为 `true/false` 根据队列状态
