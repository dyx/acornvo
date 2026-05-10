# observability-perf Specification

## Purpose
key path 性能采样：`electron/obs/perf.ts` 提供 perf.start / end，写入 `perf_samples` 表；migration 010 建表与索引；提供 P50 / P95 / 成功率聚合查询供 observability 页面消费。

## Requirements

### Requirement: perf 采样 API
`electron/obs/perf.ts` SHALL 暴露 `perf.start(area, meta?): () => void`。调用返回的 end 函数 MUST 接受 `{ ok: boolean, meta? }` 并将 `{ ts, area, ok, ms, meta }` 写入 `perf_samples` 表。`ms` 由 `performance.now()` 差值计算。

#### Scenario: 基本采样
- **WHEN** `const end = perf.start('search.query'); await run(); end({ ok:true });`
- **THEN** `perf_samples` 新增一行 area='search.query' ok=1 ms=<实际耗时>

#### Scenario: 失败采样
- **WHEN** 采样过程抛错且调用 `end({ ok:false, meta:{ err } })`
- **THEN** 行 ok=0 且 meta 含 err 序列化 JSON

### Requirement: perf_samples 表
migration 010 SHALL 建表：
```sql
CREATE TABLE perf_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  area TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  meta TEXT
);
CREATE INDEX idx_perf_area_ts ON perf_samples(area, ts);
```

应用启动时若表中行数 > 100000 MUST 从旧到新滚动删除至 80000。

#### Scenario: migration 010
- **WHEN** 数据库 user_version=9 启动
- **THEN** 执行 010_perf_samples.sql；升级到 user_version=10；表 + 索引存在

#### Scenario: 滚动清理
- **WHEN** perf_samples 达 120000 行
- **THEN** 启动时按 id ASC 删除直到 80000 行；主线程不阻塞

### Requirement: key path 埋点
下列 key path SHALL 在本阶段接入 perf：
- `project.open`：从选中项目到 AppShell 首渲染
- `indexer.scan`：全量扫描；`indexer.update`：单文件更新
- `clipper.save`：完整保存流程
- `clipper.ai-review`：AI 审阅单次
- `agent.step`：agent loop 单步 LLM + tool 总耗时
- `search.query`：搜索一次（含 FTS + 聚合排序）

每个埋点的 meta MUST 含至少一个可追溯字段（sessionId / path / query）。

#### Scenario: agent.step 埋点
- **WHEN** agent loop 执行一 step
- **THEN** perf_samples 新增 area='agent.step' 行；meta 含 sessionId + step 编号

#### Scenario: search.query 埋点
- **WHEN** 用户在 QuickSwitcher 输入触发搜索
- **THEN** 行 area='search.query' meta 含 query 长度（不记录 query 明文原始内容避免隐私）

### Requirement: 聚合查询
perf.ts SHALL 暴露 `getAggregates(area, window): { p50, p95, successRate, count }`。window 为 `'24h' | '7d'`。P50/P95 由 SQLite `WITH ORDERED AS (SELECT ms FROM perf_samples WHERE area=? AND ts >= ? ORDER BY ms)` 子查询实现。

#### Scenario: 聚合 24h
- **WHEN** 调 `getAggregates('agent.step', '24h')`
- **THEN** 返回 `{ p50, p95, successRate, count }`；过去 24h 范围；缺数据时 count=0 其他字段为 null

#### Scenario: 7d 窗口
- **WHEN** 调 `getAggregates('search.query', '7d')`
- **THEN** 窗口为 7 天；计算正确
