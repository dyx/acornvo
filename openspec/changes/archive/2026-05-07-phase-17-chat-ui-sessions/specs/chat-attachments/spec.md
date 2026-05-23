## ADDED Requirements

### Requirement: @ 触发 QuickSwitcher

ChatInput SHALL 在用户输入 `@` 字符时立刻触发 QuickSwitcher 覆盖层（复用 phase 8 组件），候选范围 MUST 包含：

- 笔记文件（title / path 全文检索）
- 剪藏（以 `clip:` 前缀标识，显示 title + url）

用户选中一项后 input 中 MUST 插入一个不可分割的展示 token（文字形如 `@file:<title>` 或 `@clip:<title>`，样式为浅色 chip inline）并在 `pendingAttachments` store 追加结构化条目；QuickSwitcher 关闭。

#### Scenario: @ 唤起搜索

- **WHEN** 用户在输入框键入 `@`
- **THEN** QuickSwitcher 覆盖层弹出；搜索输入自动聚焦；不影响 chat 页其他区域交互

#### Scenario: 选中文件

- **WHEN** 用户在 QuickSwitcher 选中某 `.md` 文件
- **THEN** input 光标处插入 `@file:<title>` 只读 chip；pendingAttachments push `{type:'file', path, title}`；QuickSwitcher 关闭

#### Scenario: 选中剪藏

- **WHEN** 用户选中一条剪藏条目
- **THEN** 插入 `@clip:<title>` chip；pendingAttachments push `{type:'clip', clipId, url, title}`

#### Scenario: 取消搜索

- **WHEN** 用户按 Esc 关闭 QuickSwitcher
- **THEN** input 中仅保留已输入的 `@` 字符；无 attachment 入队

### Requirement: Attachments chips 展示

ChatInput SHALL 在 textarea 上方紧贴显示已引用的 attachments 列表；每个 chip MUST 显示：图标（file / clip）+ title + 右侧 "×" 移除按钮。列表为空则不占空间。

#### Scenario: 移除 attachment

- **WHEN** 用户点某 chip 的 "×"
- **THEN** pendingAttachments 对应条目移除；对应 input 中的 @ chip 文字同步删除

#### Scenario: 发送后清空

- **WHEN** 用户按 Cmd+Enter 发送
- **THEN** 消息发出后 pendingAttachments 清空；chips 区域折叠

### Requirement: Attachment 协议

Attachment 类型 SHALL 在 `shared/agent-types.ts` 定义如下：

```ts
type Attachment =
  | { type: 'file'; path: string; title: string }
  | { type: 'clip'; clipId: number; url: string; title: string }
```

`chat.sendUserMessage` SHALL 接受 `attachments: Attachment[]` 参数；attachments 不作为独立 `session_message` 持久化；仅会合并到运行时 LLM 消息上下文（由 agent-loop 负责，见 agent-loop spec）；`session_messages` 中 user 行 content 存"用户实际输入的 text"（不含 attachment body，避免 DB 膨胀）。

#### Scenario: 发送带 attachments

- **WHEN** 用户发送 text="总结这篇" 且 attachments=[{type:'file', path:'notes/a.md', title:'A'}]
- **THEN** chat.sendUserMessage 调用 IPC 传 attachments；session_messages 仅写入 text；agent-loop 将 attachment 拼入 LLM 上下文

#### Scenario: 刷新后不重建 attachment body

- **WHEN** 刷新应用后打开该 session 历史
- **THEN** 滚动回看上次消息 → 看到 user text 与 chips 标记（来自 session_messages 附带的 attachments 引用），但 attachment 正文不重新读取回显
