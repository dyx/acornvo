# queue-ipc Specification

## Purpose

IPC contract for the job queue system. Exposes list/retry/cancel/clearDone operations from renderer to main, and pushes real-time state change events to all renderer windows.

## Requirements

### Requirement: jobs IPC

`shared/ipc-contract.ts` SHALL 声明 `jobs` 命名空间：

- `list({ kind?, status?, limit, offset, orderBy? }) → { items: Job[], total }`
- `retry(id) → { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' }`
- `cancel(id) → { ok: true } | { error }`
- `clearDone() → { removed: number }`：删除 status='done' 的 row，返回删除数

#### Scenario: 重试 failed

- **WHEN** renderer 调 `jobs.retry(id)` 且该 job status='failed'
- **THEN** job 转 `pending`，attempts 保留（继续累加，因为 next 次 handler 调 nextDelay 会按累加后的值算，这里要求 retry 时手动 **reset attempts → 0**）；`next_run_at = now`

#### Scenario: 重试已完成的 job

- **WHEN** 调 `jobs.retry(id)` 且 status='done'
- **THEN** 返回 `{ error: 'E_STATUS_NOT_ALLOWED' }`

#### Scenario: 取消已 done

- **WHEN** 调 `jobs.cancel(id)` 且 status='done'
- **THEN** 返回 `{ error: 'E_STATUS_NOT_ALLOWED' }`

#### Scenario: 清除完成

- **WHEN** 调 `jobs.clearDone()`，当前 5 条 done + 2 条 failed
- **THEN** 返回 `{ removed: 5 }`；failed 保留

### Requirement: 变更事件推送

main SHALL 在 `jobs.stateChanged` 内部事件触发时广播 IPC `jobs.changed` 到所有 renderer，带 payload: 新的 Job 对象。renderer `queue-panel-ui` 订阅该事件刷新列表。

#### Scenario: 订阅刷新

- **WHEN** renderer 已订阅 `jobs.changed`；runner 把一个 job 从 pending 置 running
- **THEN** renderer 100ms 内收到事件；列表中该 job 的 status 列更新
