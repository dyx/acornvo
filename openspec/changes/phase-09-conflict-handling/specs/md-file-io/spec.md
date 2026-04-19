## MODIFIED Requirements

### Requirement: mtime 乐观锁
`file.write` SHALL 支持可选参数 `expectedMtime: number` 与 `force: boolean`。
- `force === true`：跳过 mtime 校验，强制原子写入；main 侧日志 MUST 标记 `force-write`（含 path / old_mtime / new_mtime）
- 否则且提供 `expectedMtime`：若磁盘 mtime 与其相差超过 ±2ms，系统 MUST 拒绝写入并返回 `E_MTIME_MISMATCH`，错误对象 MUST 额外携带 `remoteMtimeMs`（当前磁盘 mtime）
- `expectedMtime` 与 `force` 均未提供：视为新建或明确无并发顾虑，直接写入（保留向后兼容）

所有 `file.write` 成功路径 MUST 在完成前把 `{ mtimeMs: newStat.mtimeMs, expiresAt: now+3s }` 写入 `selfWrites` Map，保证 watcher 过滤（phase 5 约定）。

#### Scenario: mtime 匹配（±2ms 内）
- **WHEN** 调用方读取后 mtime=1000，写入时 `expectedMtime: 1000` 且磁盘 mtime=1001
- **THEN** 写入成功（差 1ms 在容忍内）

#### Scenario: mtime 不匹配
- **WHEN** 其他程序在中间修改文件使 mtime 变为 2000，调用方以 `expectedMtime: 1000` 写入
- **THEN** IPC 返回 `{ ok: false, error: { code: 'E_MTIME_MISMATCH', remoteMtimeMs: 2000 } }`；磁盘未被覆盖

#### Scenario: force 跳过校验
- **WHEN** 调用 `file.write(path, body, { force: true })`，磁盘 mtime=2000
- **THEN** 写入成功覆盖磁盘；日志含 `force-write` 记录；`selfWrites` 已注册新 mtime

#### Scenario: force 与 expectedMtime 并存以 force 优先
- **WHEN** `file.write(path, body, { force: true, expectedMtime: 1000 })` 而磁盘 mtime=2000
- **THEN** 写入成功（force 生效）；日志保留 `expectedMtime` 与实际 mtime 差异用于审计
