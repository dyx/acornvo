## MODIFIED Requirements

### Requirement: ai-review-clip 占位 handler
phase 15 SHALL 用真实 reviewer handler 替换 phase 14 注册的 `ai-review-clip` 占位：
- 新 handler 调 `reviewer.reviewClip(clipId, { force })`
- 按 design D4 的错误映射决定 ok / retry / fail
- 成功后写入 `ai_usage` 表
- 启动时 runner 注册 MUST 只保留 phase 15 的实现（phase 14 占位代码路径被删除或无条件 no-op）

#### Scenario: 真实审读成功
- **WHEN** `ai-review-clip` job 被拾取，defaultProfileId 存在且 LLM 返回合法 JSON
- **THEN** handler 返回 `{ kind:'ok' }`；md 的 frontmatter 新增 ai_* 字段；ai_usage 有成功记录

#### Scenario: 无 profile 直接失败
- **WHEN** `ai-review-clip` job 跑到 handler 时 `settings.ai.defaultProfileId === null`
- **THEN** handler 返回 `{ kind:'fail', error:'E_MISSING_PROFILE' }`；不再自动重试

#### Scenario: 网络错误退避
- **WHEN** fetch 抛 E_NETWORK
- **THEN** handler 返回 `{ kind:'retry', delayMs: nextDelay(attempts), reason:'E_NETWORK' }`

#### Scenario: mtime 冲突退避
- **WHEN** 写回时 md 已被用户修改导致 mtime 不匹配
- **THEN** handler 返回 `{ kind:'retry', delayMs: 600000, reason:'E_MTIME_CONFLICT' }`

#### Scenario: phase 14 占位不再生效
- **WHEN** 剪藏后 runner 拾起 `ai-review-clip` job
- **THEN** 不再出现 phase 14 的 1 小时退避（`E_NOT_IMPLEMENTED`）；调用真实 LLM
