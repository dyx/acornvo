# telemetry-switch Specification

## Purpose
用户可控的本地遥测开关：默认关闭；开启后仅在本地 SQLite `telemetry_local` 表按日聚合脱敏计数（请求数 / token / agent step / 剪藏数），phase 18 不外发；同时承载 `update.autoCheck` 开关。

## Requirements

### Requirement: telemetry 开关
`settings` 命名空间 SHALL 新增：
- `telemetry.enabled: boolean`（默认 `false`）
- `update.autoCheck: boolean`（默认 `true`）

UI 在 `/settings/observability` 底部 SHALL 放置 "本地遥测" 开关，附说明文字 "仅在本地 SQLite 记录每日脱敏计数，不外发"。状态变化 MUST 持久化到 settings 表。

#### Scenario: 默认 off
- **WHEN** 全新安装或 settings.telemetry.enabled 未设置
- **THEN** 开关显示关闭；无聚合任务运行

#### Scenario: 开启写 settings
- **WHEN** 用户切到开启
- **THEN** settings 写入 `telemetry.enabled=true`；下次每日聚合任务启动

### Requirement: 本地聚合表
migration 010 SHALL 额外建 `telemetry_local` 表：
```sql
CREATE TABLE telemetry_local (
  date TEXT PRIMARY KEY,       -- YYYY-MM-DD
  ai_requests INTEGER,
  ai_tokens INTEGER,
  agent_steps INTEGER,
  clips_saved INTEGER
);
```

若 telemetry.enabled=true，每日 00:10（本地时区）SHALL 运行一次聚合 job（复用 phase 14 jobs 表，kind='telemetry-aggregate'），把前一天的 AI usage / agent.step perf / 剪藏计数写入 telemetry_local。本阶段聚合数据 MUST **不外发**；仅本地可查。

#### Scenario: 每日聚合
- **WHEN** telemetry.enabled=true 且今天 00:10
- **THEN** job 执行；telemetry_local 新增昨日一行；数字来自 ai_usage / perf_samples / clips 表

#### Scenario: 开关关闭停止
- **WHEN** 用户关闭 telemetry 开关
- **THEN** 下次 00:10 不再聚合；历史 telemetry_local 保留不删

### Requirement: 数据访问与隐私
telemetry_local SHALL **不包含**：用户笔记 / 剪藏 body / API key / session_messages / URL 明文。只存聚合计数。开关说明文案 MUST 明确 "不外发"；且文档 README 列出所存字段清单。

#### Scenario: 表字段审计
- **WHEN** 检查 telemetry_local 所有列
- **THEN** 只含 date + 计数类整数；无字符串业务字段
