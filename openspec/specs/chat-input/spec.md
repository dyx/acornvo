# chat-input Specification

## Purpose
Chat 输入组件：多行 textarea 自动增高、发送快捷键、状态按钮、profile 底栏。

## Requirements

### Requirement: 多行输入与自动增高
ChatInput SHALL 使用 `<textarea>` 实现多行输入，默认 3 行高度，内容超出时 auto-grow 到 `max-height: 240px`；超出后内部滚动。textarea 聚焦时外层容器 MUST 显示主色边框。

#### Scenario: 单行输入
- **WHEN** 用户输入 "hello"
- **THEN** textarea 保持默认最小高度

#### Scenario: 多行自动增高
- **WHEN** 用户输入 20 行文本
- **THEN** textarea 高度增到 240px 上限；内部滚动继续输入

### Requirement: 发送快捷键
ChatInput SHALL 支持以下键位：
- `Enter`：插入换行（不发送）
- `Shift+Enter`：插入换行（等价 Enter）
- `Cmd+Enter`（macOS）/ `Ctrl+Enter`（其他平台）：发送消息并清空 input
- `Esc`：若有活跃流则调用 `chat.cancelStream`；否则失焦

发送 MUST 调用 `chat.sendUserMessage({ sessionId, text, attachments })`；text 与 attachments 任一非空即可发送；同一 session 若已在流式中再次发送 SHALL 被 store 层阻止并显示 toast。

#### Scenario: Enter 换行
- **WHEN** 用户按 Enter
- **THEN** textarea 插入换行；内容不发送

#### Scenario: Cmd+Enter 发送
- **WHEN** 用户按 Cmd+Enter 且 text 非空
- **THEN** 调用 sendUserMessage；input 清空；attachments chips 清空

#### Scenario: 空消息不发送
- **WHEN** text 和 attachments 都为空且按 Cmd+Enter
- **THEN** 不调用 sendUserMessage；发送按钮保持 disabled

#### Scenario: 流式中 Esc 取消
- **WHEN** 当前 session 正在流式接收且用户按 Esc
- **THEN** 调 chat.cancelStream；loop 中止；UI 显示"已停止"

### Requirement: 发送按钮状态
ChatInput 右下 SHALL 放置发送按钮：
- 空闲且可发送 → 主色箭头图标（enabled）
- text 与 attachments 均空 → 灰色（disabled）
- 当前 session 流式中 → 变成"停止"图标，点击调 `chat.cancelStream`

#### Scenario: 空闲可发送
- **WHEN** text 非空且无流式
- **THEN** 发送按钮 enabled 可点

#### Scenario: 流式变停止
- **WHEN** 当前 session 正在流式
- **THEN** 按钮切换为方块"停止"图标；点击触发 cancelStream

### Requirement: 底部状态栏
ChatInput 底部 SHALL 显示当前 session 所用 profile 名 + 模型；点击打开 profile 选择下拉（同顶栏）；若 `defaultProfileId === null` MUST 显示 "未配置 AI profile" + "前往设置" 链接。

#### Scenario: 显示 profile
- **WHEN** session.profile_id 有效
- **THEN** 底部显示 "<profile.name> · <profile.model>"

#### Scenario: 未配置
- **WHEN** 无默认 profile 且 session.profile_id 为 null
- **THEN** 显示灰色警示 + 链接到 /settings/ai
