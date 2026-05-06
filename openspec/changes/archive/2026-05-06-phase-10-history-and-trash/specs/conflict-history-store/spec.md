## ADDED Requirements

### Requirement: conflict.diff IPC
系统 SHALL 提供 `conflict.diff(id, sides)` IPC，其中 `sides ∈ { 'local-remote', 'local-base', 'remote-base' }`。main 侧读取快照 3 份 md 全文，按 `sides` 选两份，用 `diff` 包（jsdiff）生成 `diffLines` 结果，转结构化数据返回：
```
{
  left: { label: 'local'|'remote'|'base', lines: { num, text, kind: 'equal'|'del' }[] },
  right: { label: 'local'|'remote'|'base', lines: { num, text, kind: 'equal'|'add' }[] },
  stats: { added, removed }
}
```

#### Scenario: 正常 diff
- **WHEN** `conflict.diff('<id>', 'local-remote')`
- **THEN** 返回 left/right 带逐行 kind 标注；stats 含改动行数

#### Scenario: 不存在的 id
- **WHEN** id 对应目录不存在
- **THEN** 返回 `E_NOT_FOUND`

#### Scenario: 两份一致
- **WHEN** local 与 remote 字节相同
- **THEN** stats={added:0, removed:0}；每行 kind='equal'

### Requirement: conflict.delete 写 ops_log
`conflict.delete(id)` 调用成功后系统 SHALL 额外写入 `opsLog.record({ op:'conflict_delete', path: <meta.path>, meta: { id } })`。

#### Scenario: 删除记录
- **WHEN** `conflict.delete('<id>')` 成功
- **THEN** ops_log 多一行 `op='conflict_delete', path=<原冲突 path>`

### Requirement: conflict.deleteAll IPC
系统 SHALL 提供 `conflict.deleteAll()` IPC，删除 `.acornvo/conflicts/` 下所有快照目录；每条 MUST 产生一条 `op='conflict_delete'` ops_log。返回 `{ ok: true, deleted: number }`。

#### Scenario: 清空全部
- **WHEN** `conflict.deleteAll()`，当前有 5 条快照
- **THEN** 返回 `{ ok: true, deleted: 5 }`；目录下无任何子目录；ops_log 多 5 行 `conflict_delete`
