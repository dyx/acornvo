## ADDED Requirements

### Requirement: 指数退避表

`electron/queue/policy.ts` SHALL 导出 `nextDelay(attempts: number): number | null`：

- attempts=0 → 1_000
- attempts=1 → 5_000
- attempts=2 → 30_000
- attempts=3 → 120_000
- attempts=4 → 900_000
- attempts ≥ 5 → `null`（不再重试）

runner 在 handler 抛未 catch 异常或返回 retry 但未指定 delayMs 时 MUST 调 `nextDelay(job.attempts)`；若返回 null → 转 `markFailed`。

#### Scenario: 第 0 次失败

- **WHEN** attempts=0，handler 抛错
- **THEN** markRetry(id, 1000, reason)

#### Scenario: 达到上限

- **WHEN** attempts=5，handler 抛错
- **THEN** markFailed(id, reason)

### Requirement: handler 可覆盖 delay

handler 返回 `{ kind: 'retry', delayMs }` 中的 delayMs 若为正整数 MUST 作为下次 `next_run_at` 的基准，**覆盖** 默认退避表。

#### Scenario: handler 自定义延迟

- **WHEN** handler 返回 `{ kind: 'retry', delayMs: 3_600_000, reason: 'rate-limited' }`
- **THEN** `next_run_at ≈ now + 1h`；attempts+=1

### Requirement: fatal error 直接失败

handler 返回 `{ kind: 'fail', error }` MUST 让 runner 立即 markFailed（不走重试策略），适用于"永远不会成功"的情形，例如 `E_MISSING_PROFILE`（AI review 没配 profile）。

#### Scenario: fail 不重试

- **WHEN** handler 返回 `{ kind: 'fail', error: 'E_MISSING_PROFILE' }`
- **THEN** status='failed'；attempts 不再增加；ops_log 写 job.failed
