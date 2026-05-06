# queue-panel-ui Specification

## Purpose
Renderer-side UI for the job queue. Adds a "Jobs" tab to the History page with filtering, virtual list, per-row actions (retry/cancel), real-time updates via IPC subscription, and kind-specific payload summaries.

## Requirements

### Requirement: `/history` 任务 tab
`src/pages/History.tsx` SHALL 增加"任务" tab。该 tab 的面板 SHALL 包含：
- 顶部 filter：kind 下拉（all / ai-review-clip / index-retry / ...）；status 下拉（all / running / pending / failed / done / canceled）；默认 kind=all、status=`running|pending|failed`（隐藏 done/canceled）
- 全局按钮："清除已完成"（调 `jobs.clearDone`），二次确认
- 列表：虚拟化；行高 48px；列：kind / payload 摘要 / status badge / attempts / next_run_at (relative time) / last_error（failed 时红字截断展示前 60 字符）
- 行内按钮：
  - running / pending → "取消"
  - failed → "重试"
- 自动刷新：订阅 `jobs.changed` 事件，列表实时更新

#### Scenario: 打开任务 tab
- **WHEN** 用户 navigate `/history` 并切到"任务"
- **THEN** 列表按默认 filter 加载；显示 running + pending + failed 行

#### Scenario: 重试按钮
- **WHEN** 用户在 failed 行点"重试"
- **THEN** 调 `jobs.retry(id)`；该行 status 变 pending；attempts 重置为 0；next_run_at 变 now

#### Scenario: 取消 running
- **WHEN** 用户在 running 行点"取消"
- **THEN** 调 `jobs.cancel(id)`；handler 接到 AbortSignal；status 最终变 canceled；行隐藏（默认 filter 不包含 canceled）

#### Scenario: 清除完成
- **WHEN** 用户点"清除已完成" → 确认
- **THEN** 调 `jobs.clearDone()`；toast 显示 "已清除 N 条"；列表刷新

### Requirement: payload 摘要渲染
不同 kind SHALL 有专用的摘要行渲染：
- `ai-review-clip`：显示 `AI 审读 · ${clipTitle ?? clipPath}`（若 clipId 在 clips 表已存在则拿 title）
- `index-retry`：显示 `索引重试 · ${path}`
- 未识别 kind：回退 `${kind} · ${JSON.stringify(payload).slice(0, 60)}`

#### Scenario: ai-review-clip 摘要
- **WHEN** job payload = `{ clipId: 42 }`；clips[42].title = '注意力机制'
- **THEN** 行摘要显示 `AI 审读 · 注意力机制`

### Requirement: 空状态
无任务时面板 SHALL 显示文案 "没有待办任务"。

#### Scenario: 空
- **WHEN** jobs 表符合 filter 的行数为 0
- **THEN** 面板中央显示空文案
