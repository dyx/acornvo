## MODIFIED Requirements

### Requirement: 多行输入与自动增高
ChatInputArea SHALL 使用 `@ant-design/x` 的 `Sender` 组件作为底层输入；其内部 textarea 原生支持多行。默认 3 行可视高度，内容超出时 auto-grow 到 `max-height: 240px`；超出后内部滚动。聚焦时 Sender 外层容器 MUST 显示 antd token 的主色 border（通过 theme components.Sender 配置）。

#### Scenario: 单行输入
- **WHEN** 用户输入 "hello"
- **THEN** Sender 保持默认最小高度

#### Scenario: 多行自动增高
- **WHEN** 用户输入 20 行文本
- **THEN** Sender 高度增到 240px 上限；内部滚动继续输入

### Requirement: 发送快捷键
Sender SHALL 支持以下键位（部分由 Sender 内置，必要时通过 onKeyDown 透传补足）：

- `Enter`：插入换行（不发送）
- `Shift+Enter`：插入换行（等价 Enter）
- `Cmd+Enter`（macOS）/ `Ctrl+Enter`（其他平台）：触发 `Sender.onSubmit`
- `Esc`：若有活跃流则调 `chat.cancelStream`；否则失焦

`Sender.onSubmit` MUST 调 `chat.sendUserMessage({ text, attachments })`；text 与 attachments 任一非空即可发送；同一 session 若已在流式中再次发送 SHALL 被 store 层（`BusyError`）阻止并通过 antd `message.error` 反馈。

#### Scenario: Enter 换行
- **WHEN** 用户按 Enter
- **THEN** Sender 插入换行；内容不发送

#### Scenario: Cmd+Enter 发送
- **WHEN** 用户按 Cmd+Enter 且 text 非空
- **THEN** 调 sendUserMessage；Sender 文本清空；pendingAttachments 清空

#### Scenario: 空消息不发送
- **WHEN** text 和 attachments 都为空且按 Cmd+Enter
- **THEN** 不调 sendUserMessage；Sender 提交按钮保持 disabled

#### Scenario: 流式中 Esc 取消
- **WHEN** 当前 session 正在流式且用户按 Esc
- **THEN** 调 `chat.cancelStream`；UI loading 视觉解除

### Requirement: 发送按钮状态
Sender 右下区域 SHALL 渲染发送按钮（X 内置，由 `loading` prop 控制视觉）：

- 空闲且可发送 → 主色提交图标（enabled）
- text 与 attachments 均空 → 灰色（disabled）
- 当前 session status='streaming' → `Sender.loading=true`，按钮切为 "停止" 图标，点击触发 `Sender.onCancel` → `chat.cancelStream`

#### Scenario: 空闲可发送
- **WHEN** text 非空且 status='idle'
- **THEN** 发送按钮 enabled 可点

#### Scenario: 流式变停止
- **WHEN** 当前 session status='streaming'
- **THEN** `Sender.loading=true`；按钮显示 "停止"；点击触发 `chat.cancelStream`

### Requirement: 底部状态栏
chat 页 Sender 下方 SHALL 渲染 `ProfileFooter`（保留组件，仅 antd token 视觉对齐）：显示当前 session 所用 profile 名 + 模型；点击打开 profile 选择下拉（与顶栏一致）；若 `defaultProfileId === null` 且 `session.profileId === null` MUST 显示 "未配置 AI profile" + "前往设置" 链接（路由到 `/settings/ai`）。

#### Scenario: 显示 profile
- **WHEN** session.profileId 有效（指向已存在的 profile）
- **THEN** ProfileFooter 显示 "<profile.name> · <profile.model>"

#### Scenario: 未配置
- **WHEN** 无默认 profile 且 session.profileId 为 null
- **THEN** 显示灰色警示文案 + 链接到 `/settings/ai`
