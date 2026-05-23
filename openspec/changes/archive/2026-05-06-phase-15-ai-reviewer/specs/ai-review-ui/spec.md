## ADDED Requirements

### Requirement: AI 徽章

phase 7 编辑器页 SHALL 在编辑器右上角渲染 `AiReviewBadge`：

- frontmatter 无 `ai_reviewed_at` → 不渲染徽章
- 含 `ai_reviewed_at` 但无 `ai_review_accepted_at` → 渲染紫色 "AI" 徽章（未处理态）
- 同时含两者 → 渲染灰色 "AI" 徽章（已处理态）

点击徽章 SHALL 打开 `AiReviewDrawer`（右侧 400px 宽）。

#### Scenario: 未审读隐藏

- **WHEN** frontmatter 无 ai_reviewed_at
- **THEN** 徽章不可见

#### Scenario: 未处理徽章

- **WHEN** frontmatter 有 ai_reviewed_at，无 ai_review_accepted_at
- **THEN** 紫色 "AI" 徽章渲染；hover tooltip "AI 审读结果，点击查看"

#### Scenario: 已处理徽章

- **WHEN** 两个字段都存在
- **THEN** 灰色 "AI" 徽章渲染；hover tooltip 显示接受时间

### Requirement: AiReviewDrawer 内容

抽屉 SHALL 展示以下区块（按顺序）：

1. 建议标题（大字）+ "用作标题" 按钮
2. 摘要文本
3. 标签 chips + "合并到标签" 按钮
4. 关键引用（列表，每条可复制）
5. 底部按钮："一键接受" / "拒绝" / "重新审读"
6. 元信息行：审读时间、model、token 用量

数据来自 frontmatter 的 `ai_summary` / `ai_suggested_title` / `ai_tags` / `ai_key_quotes` / `ai_reviewed_at`。model / token 用量查 `ai_usage` 表最近一条（profile_id + 该 job_id 组合）。

#### Scenario: 打开抽屉

- **WHEN** 用户点紫色徽章
- **THEN** 抽屉挂载；四个区块有内容；底部按钮可见

#### Scenario: 用作标题

- **WHEN** 用户点"用作标题"
- **THEN** 编辑器当前文件的 frontmatter.title 被覆写为 ai_suggested_title；触发自动保存；徽章保持紫色（因为仅部分接受）

#### Scenario: 合并到标签

- **WHEN** 用户点"合并到标签"
- **THEN** frontmatter.tags = union(既有 tags, ai_tags)；保存

### Requirement: 一键接受/拒绝

"一键接受" 按钮 SHALL：

- frontmatter.title ← ai_suggested_title（若与原相同则不写）
- frontmatter.tags ← union(既有 tags, ai_tags)
- frontmatter.ai_review_accepted_at ← now
- 调 phase 4 `file.write` 原子写
- 徽章变灰

"拒绝" 按钮 SHALL 仅写 `ai_review_accepted_at = now`，不改 title/tags；徽章变灰。

#### Scenario: 接受

- **WHEN** 用户点"一键接受"
- **THEN** title 被覆写；tags 被合并；ai_review_accepted_at 写入；抽屉关闭；徽章灰色

#### Scenario: 拒绝

- **WHEN** 用户点"拒绝"
- **THEN** 仅 ai_review_accepted_at 写入；title/tags 不变；徽章灰色

### Requirement: 重新审读

"重新审读" 按钮 SHALL 调 `ai.reviewClip(clipId, { force: true })` IPC 入队新 job；UI 显示 "已重新排队，稍后查看" toast；徽章样式切换为 "运行中"（spinner）直到 frontmatter.ai_reviewed_at 更新。

#### Scenario: 触发重审

- **WHEN** 用户点"重新审读"
- **THEN** IPC 返回 jobId；toast 显示；徽章变 spinner；jobs 表新增 ai-review-clip 行

#### Scenario: 非 clip 文件隐藏按钮

- **WHEN** 当前编辑文件不是剪藏（无对应 clips 行）
- **THEN** 抽屉不显示"重新审读"按钮（因 reviewClip 需 clipId）
