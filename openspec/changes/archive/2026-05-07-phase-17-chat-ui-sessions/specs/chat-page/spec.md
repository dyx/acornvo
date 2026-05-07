## ADDED Requirements

### Requirement: /chat 路由
应用 SHALL 在 `/chat` 渲染 `Chat.tsx` 真实页面（取代 phase 1 的 "即将推出" 占位）。页面顶栏 MUST 显示当前 session 标题与绑定 profile 名 + 模型标签；点击 profile 标签可切换 profile（更新 `sessions.profile_id`）。

#### Scenario: 打开 /chat
- **WHEN** 用户点 AppRail "松语" 或通过地址栏进入 /chat
- **THEN** 显示三栏布局；若无 session 则自动新建一个空 session 并选中

#### Scenario: 顶栏切换 profile
- **WHEN** 用户在顶栏点 profile 标签
- **THEN** 弹出下拉列出 ai_provider_profiles；选中后调 IPC 更新 session.profile_id；下一次 sendUserMessage 使用新 profile

### Requirement: 三栏布局
Chat 页面 SHALL 采用三栏布局：左侧 SessionList（默认 300px，可折叠到 48px）、中间 MessageList + ChatInput（flex 1）、右侧 ApprovalRail（默认宽 0；有 pending approval 时滑入 320px）。窗口宽度 < 960px 时 SessionList MUST 自动折叠为 icon-only。

#### Scenario: 正常宽度
- **WHEN** 窗口宽度 ≥ 960px
- **THEN** 三栏完整显示；左栏 300px；右栏按 approval 状态动态展开/收起

#### Scenario: 窄屏折叠
- **WHEN** 窗口宽度 < 960px
- **THEN** SessionList 自动折叠为 48px icon-only；点击头部切换回展开

### Requirement: 空态引导
新建空 session 进入对话区时 SHALL 显示 4 个示例 prompt 卡片作为空态引导（"帮我在笔记里找关于注意力机制的内容"/"总结最近 10 篇剪藏"/"把 a.md 的 tags 改成..."/"列出 tags 前 10"）。点击卡片 MUST 将文本填入 ChatInput 但**不自动发送**。

#### Scenario: 空 session 打开
- **WHEN** 用户打开一个无任何 message 的 session
- **THEN** 中间区域显示 4 个引导卡片；点击任一 → ChatInput 填充对应文本；焦点移到 input 末尾

#### Scenario: 已有消息不显示
- **WHEN** session 至少有 1 条 message
- **THEN** 不再显示引导卡片；只渲染 MessageList
