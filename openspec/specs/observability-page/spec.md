# observability-page Specification

## Purpose
`/settings/observability` 页面：以 AI 使用 / 队列 / 性能 三个 tab 展示聚合视图，并提供"导出诊断包"入口。

## Requirements

### Requirement: /settings/observability 路由
应用 SHALL 新增 `/settings/observability` 路由，在 settings 左栏侧边加入 "可观测" 导航条目（齿轮下 "AI"、"通用" 之后）。页面主体 MUST 为选项卡布局：`AI 使用` / `队列` / `性能` 三个 tab；底部 MUST 固定 "导出诊断包" 按钮。

#### Scenario: 侧边导航
- **WHEN** 用户进入 /settings
- **THEN** 左栏显示 "可观测" 条目；点击导航到 /settings/observability；默认选中 `AI 使用` tab

#### Scenario: tab 切换
- **WHEN** 用户点击 `队列` tab
- **THEN** 路由保持 /settings/observability；内容区切换；URL 可选加 query `?tab=queue` 便于刷新恢复

### Requirement: AI 使用卡片
`AI 使用` tab SHALL 显示：
1. 时间窗口切换：`24h` / `7d` / `30d`（默认 24h）
2. 数字卡片：总请求数 / 总 token / 预计成本（用 phase 15 的 ai_usage + profile 单价）
3. 按 profile 分组横条：每 profile 的调用数与 token 量
4. 按工具折叠列表：从 `tool_calls` 表聚合 `tool_name` → 调用次数（近 30d）
5. 日期折线图：每日 token 趋势（canvas 或 lightweight svg）

#### Scenario: 数字卡片
- **WHEN** 切到 24h
- **THEN** 三个数字卡分别显示过去 24h 的 count(*) / sum(total_tokens) / sum(cost_usd) 来自 ai_usage

#### Scenario: 无 AI 活动
- **WHEN** ai_usage 表空
- **THEN** 显示 "尚无 AI 调用记录" 空态；不抛错

### Requirement: 队列健康卡片
`队列` tab SHALL 显示：
- 当前 pending / running / failed 计数（`jobs` 表）
- 最近 20 条失败 job 列表（kind / last_error / updated_at / "重试" / "丢弃" 按钮）
- 最近 20 条 ops_log 流水（area / message / ts）按时序倒序

"重试" MUST 调 `queue.retryJob(jobId)`；"丢弃" MUST 调 `queue.deleteJob(jobId)` 并移除列表行。

#### Scenario: 失败重试
- **WHEN** 用户在失败列表点 "重试"
- **THEN** job.status 置回 pending、attempts 归零、next_run_at=now；队列下次 tick 执行；UI 从 failed 列表移除

#### Scenario: 流水刷新
- **WHEN** 页面每 5s 轮询 ops_log
- **THEN** 新条目出现在顶部；不超过 200 行

### Requirement: 性能卡片
`性能` tab SHALL 对下列 area 显示 P50 / P95 / 成功率：`search.query` / `agent.step` / `clipper.save` / `clipper.ai-review` / `indexer.scan` / `indexer.update` / `project.open`。时间窗口默认 24h；可切 7d。

超过阈值 MUST 标红：`search.query` P95 > 500ms；`agent.step` P95 > 30s；`clipper.save` P95 > 10s；其他 area 无固定阈值仅显示数字。

#### Scenario: 正常指标
- **WHEN** search.query 24h 的 P95 = 120ms
- **THEN** 显示 "120 ms"（黑色）

#### Scenario: 超阈值
- **WHEN** search.query 24h 的 P95 = 800ms
- **THEN** 显示 "800 ms"（红色）+ warning icon；hover tooltip 说明阈值 500ms
