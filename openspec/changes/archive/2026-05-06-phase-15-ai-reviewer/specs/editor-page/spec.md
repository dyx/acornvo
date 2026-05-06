## ADDED Requirements

### Requirement: AI 徽章挂载点
`/editor/:encodedPath` 页 SHALL 在 TitleBar 右侧预留 AI 徽章挂载点；当打开的 md 文件 frontmatter 含 `ai_reviewed_at` 时渲染 `AiReviewBadge`（见 ai-review-ui）。徽章 MUST 与 dirty/saving 指示共存且不重叠。

#### Scenario: 打开 AI 审读过的剪藏
- **WHEN** 用户在果仓双击一个含 `ai_reviewed_at` 字段的 md
- **THEN** 编辑器加载后 TitleBar 右侧显示 AI 徽章

#### Scenario: 非剪藏普通文件
- **WHEN** 用户打开 frontmatter 中无 AI 字段的 md
- **THEN** 不渲染徽章；TitleBar 其他元素布局不变

### Requirement: frontmatter 侧卡扩展 AI 字段显示
phase 7 的 Frontmatter 只读侧卡 SHALL 在存在 AI 字段时增加一行 "AI 审读" 区，显示 summary 的前 80 字符 + "展开" 按钮（点击打开 `AiReviewDrawer`）。该行 MUST NOT 替换原有的 category / tags / rating 等显示。

#### Scenario: 显示 AI 行
- **WHEN** frontmatter 有 ai_summary='xxx' 且原有 tags 若干
- **THEN** 侧卡原字段照常显示；末尾多一行 "AI 审读"，文本为 summary 前 80 字 + "展开"

#### Scenario: 无 AI 字段
- **WHEN** frontmatter 无任何 ai_* 字段
- **THEN** 侧卡不显示 AI 区

### Requirement: 接受后自动保存
用户在 AiReviewDrawer 点击 "一键接受" 或 "用作标题" 或 "合并到标签" 时，编辑器 SHALL 通过现有 autosave 链路（phase 7 的 debounce 调度 + phase 4 原子写）完成保存，不走旁路直写。保存成功后 TitleBar dirty 指示器 MUST 正确恢复（可能短暂显示 saving）。

#### Scenario: 合并到标签的保存
- **WHEN** 用户在抽屉点"合并到标签"，merge 结果使 tags 新增一项
- **THEN** 编辑器状态进入 dirty → saving → saved；磁盘文件 frontmatter.tags 更新；content_hash 不变（body 未改）
