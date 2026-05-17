## ADDED Requirements

### Requirement: Attachments 嵌入 Sender.Header
AttachmentsAdapter SHALL 把 store `bySession[activeSessionId].pendingAttachments` 渲染为 `@ant-design/x` 的 `Attachments` 组件，嵌入 `Sender.Header`。Attachments 的 `overflow` MUST 设为 `'scrollX'`。pendingAttachments 为空时 Sender.Header MUST 不渲染（不占空间）。

#### Scenario: 有附件渲染
- **WHEN** pendingAttachments 非空
- **THEN** Sender.Header 显示 Attachments 横向滚动列表，每个附件显示为 file item

#### Scenario: 空列表隐藏
- **WHEN** pendingAttachments 为空数组
- **THEN** Sender.Header 不渲染（条件渲染移除）

### Requirement: 添加附件
Sender 的 prefix 区域 SHALL 提供 paperclip 图标按钮；点击触发系统文件选择框（通过 `Attachments` 的 ref 暴露的 `select({ multiple: true })` 方法或等价的 IPC 调用）；选中的每个文件 MUST 调 `chat.pushAttachment(att)` 加入 store。

附件类型映射：本地文件路径 → `{ type: 'file', path, title: basename }`；从 clip 引用（其他流程触发）→ `{ type: 'clip', clipId, url, title }`。

#### Scenario: 单文件选择
- **WHEN** 用户点 paperclip 选择 1 个文件
- **THEN** 该文件作为 `{ type: 'file', path, title }` push 进 pendingAttachments；Attachments 立即显示

#### Scenario: 多文件选择
- **WHEN** 用户选择 3 个文件
- **THEN** 3 个 attachment 都 push 进 pendingAttachments；按选择顺序

### Requirement: 移除附件
Attachments 列表中每个 item 的关闭按钮 SHALL 调 `chat.removeAttachment(index)` 从 store 删除对应附件；index 为该附件在 pendingAttachments 数组中的位置。

#### Scenario: 单个移除
- **WHEN** 用户点 Attachments 中第 2 个 item 的关闭按钮
- **THEN** `chat.removeAttachment(1)` 被调；pendingAttachments 长度 -1；UI 立即更新

### Requirement: 发送后清空
发送消息（Sender.onSubmit 触发 `chat.sendUserMessage`）后 store reducer SHALL 把 pendingAttachments 清空 —— 这是 store `sendUserMessage` action 既有契约，本次不改。Attachments 组件 MUST 在该状态变化后立即 unmount Sender.Header（条件渲染回 false）。

#### Scenario: 发送清空
- **WHEN** 用户提交一条含 2 个附件的消息
- **THEN** 消息发出后 pendingAttachments=[]；Attachments 与 Sender.Header 一同隐藏
