## ADDED Requirements

### Requirement: 两栏布局

Chat 页 SHALL 渲染两栏布局：左栏 `Conversations`（默认 280px，窗口宽 <960px 时进入折叠态，行为见 chat-session-list 规格）；右栏垂直 Flex（`Bubble.List` 在上，`Sender` 在下，可选 `ProfileFooter` 紧贴 Sender 下方）。**右栏审批面板已删除**。所有 chat UI MUST 在 `XProvider` 包根下渲染。

#### Scenario: 默认宽度

- **WHEN** 用户在 ≥960px 窗口打开 chat 页
- **THEN** 左栏 280px 展开渲染 Conversations 完整布局；右栏占据剩余空间

#### Scenario: 无右侧审批栏

- **WHEN** 当前 session 收到 `tool.approval-needed`
- **THEN** 右栏宽度不变；审批以 inline Actions 出现在对应 assistant 消息的 ThoughtChain step 中

### Requirement: 空态渲染

当用户进入一个无消息历史的 session 时，Bubble.List 区域 SHALL 渲染 `@ant-design/x` 的 `Welcome` 组件 + `Prompts wrap` 显示 4 个示例 prompt 卡片。点击任一卡片 MUST 把卡片对应文本填入 Sender 输入框而 NOT 立即发送。

#### Scenario: 新建 session 后空态

- **WHEN** 用户点 Conversations 新建按钮
- **THEN** 右栏 Bubble.List 区域渲染 Welcome 头部 + 4 个 Prompts 卡片；Sender 自动聚焦

#### Scenario: 点 Prompt 卡片

- **WHEN** 用户点其中一个 Prompts 卡片
- **THEN** Sender 文本被填入卡片对应文本；不调用 `chat.sendUserMessage`；输入框保持可编辑且聚焦

### Requirement: Sender 与 store 绑定

`Sender.onSubmit` SHALL 调 `chat.sendUserMessage({ text, attachments })`；`Sender.onCancel` SHALL 调 `chat.cancelStream()`；`Sender.loading` prop SHALL 等于 `bySession[activeSessionId].status === 'streaming'`。

#### Scenario: 提交消息

- **WHEN** 用户输入文本后按 Cmd+Enter（或点提交按钮）且 status='idle'
- **THEN** 调 `chat.sendUserMessage`；Sender 文本清空；pendingAttachments 清空；status 切到 'streaming'

#### Scenario: 流式中取消

- **WHEN** 当前 session status='streaming' 且用户点 Sender 取消按钮
- **THEN** 调 `chat.cancelStream`；UI loading 视觉立即解除（status 由后端 `canceled` 事件回写为 'idle'）

#### Scenario: 切换 session 后状态隔离

- **WHEN** 用户从 session A（streaming 中）切到 session B（idle）
- **THEN** Sender.loading 跟随 session B 的 status='idle'；session A 的 streaming 仍在 store 中独立维护
