## MODIFIED Requirements

### Requirement: 入队（phase 14 预留）
save 成功后 pipeline MUST 调 `jobs.enqueue('ai-review-clip', { clipId, path }, { dedupeKey: 'clip:' + clipId })`。原 phase 12 的 `clipQueue.enqueue` 占位 SHALL 被替换为此直接调用；pipeline 的外部行为与错误面对 phase 12 保持不变，仅入队实现从 no-op 变为真实持久化入队。

入队失败（极罕见，SQLite 故障）MUST NOT 回滚已写入的 clip 文件与 clips 表；错误仅记 `ops_log` `op='enqueue.failed'`；用户可在 /history/jobs 中手动补加（phase 18 提供手动补队入口）。

#### Scenario: 真实入队
- **WHEN** pipeline 在 phase 14 走完 save
- **THEN** `jobs` 表新增一行 `kind='ai-review-clip'`，status='pending'，payload 含 clipId 与 path

#### Scenario: 去重命中不重复入队
- **WHEN** 同一 clipId 在 pending/running 状态已有 ai-review-clip job，用户以某种方式触发再次入队
- **THEN** 不新增 job 行；返回已有 id
