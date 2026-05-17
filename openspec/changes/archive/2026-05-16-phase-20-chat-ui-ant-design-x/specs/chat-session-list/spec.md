## ADDED Requirements

### Requirement: Conversations 渲染
ConversationsAdapter SHALL 用 `@ant-design/x` 的 `Conversations` 组件渲染 store `sessions` 列表。每个 session 映射为 `{ key: session.id, label: session.title || t('chat.untitled'), group, menu }`，并通过 `activeKey={activeSessionId}` 与 `onActiveChange={selectSession}` 与 store 双向绑定。

#### Scenario: 标题渲染
- **WHEN** session.title 非空
- **THEN** Conversations 显示 session.title

#### Scenario: 空标题占位
- **WHEN** session.title 为空字符串或 null
- **THEN** Conversations 显示 i18n 文案 `t('chat.untitled')`

#### Scenario: 点击切换
- **WHEN** 用户点一个非当前 session
- **THEN** 调 `chat.selectSession(id)`；activeSessionId 更新；右栏渲染该 session 的 messages

### Requirement: 按时间分组
sessions SHALL 按 `updatedAt` 三段分组：今日 / 本周 / 更早。Conversations 的 `groupable` prop MUST 启用。分组键由本地 helper（参考 `groupSession(updatedAt)` ≈ `'today' | 'thisWeek' | 'earlier'`）派生。

#### Scenario: 今日 session
- **WHEN** session.updatedAt 在今日 00:00 至现在之间
- **THEN** 在 "今日" 分组下渲染

#### Scenario: 本周 session
- **WHEN** session.updatedAt 早于今日 00:00 但晚于本周一 00:00
- **THEN** 在 "本周" 分组下渲染

#### Scenario: 更早 session
- **WHEN** session.updatedAt 早于本周一 00:00
- **THEN** 在 "更早" 分组下渲染

### Requirement: 上下文菜单
每个 session 行 SHALL 通过 Conversations item 的 `menu` 字段提供 hover 触发的菜单，至少包含：重命名、删除。

#### Scenario: 重命名
- **WHEN** 用户点菜单 "重命名"
- **THEN** 行内进入编辑态显示 antd `Input`；按 Enter 提交调 `chat.renameSession(id, newTitle)`；按 Esc 取消

#### Scenario: 删除确认
- **WHEN** 用户点菜单 "删除"
- **THEN** 弹 antd `Modal.confirm`（替换原 `DeleteSessionDialog`）；确认后调 `chat.deleteSession(id)`；若删除的是当前 session 则自动切到列表第一个

### Requirement: 新建入口
Conversations 的 `creation` prop SHALL 提供新建按钮，label 为 `t('chat.new')`；点击调 `chat.createSession()`，store 成功后自动激活新 session。

#### Scenario: 新建会话
- **WHEN** 用户点 Conversations 顶部新建按钮
- **THEN** 调 `chat.createSession()`；新 session 出现在列表 "今日" 分组顶；自动激活；Bubble.List 渲染空态

### Requirement: 折叠态桥
窗口宽 <960px 时 ConversationsAdapter SHALL 包一层窄列表 mode：仅显示会话图标 + 截断标题（最多 8 字符）。新建按钮仍可见。其他行为（点击切换、菜单触发）保持。

#### Scenario: 窄窗渲染
- **WHEN** 视窗宽度 <960px
- **THEN** 切换到窄列表 mode；分组标题隐藏；每行仅图标 + 截断标题

#### Scenario: 窄窗下点击切换
- **WHEN** 用户在窄列表 mode 下点击一个 session 行
- **THEN** 该 session 激活；行底色高亮

### Requirement: 后台 session 待审标记
当某 session 收到 `tool.approval-needed` 但不是 activeSessionId 时，Conversations 对应 item SHALL 显示红点标记（antd `Badge` dot）。activeSessionId 切到该 session 后红点 MUST 消失。

#### Scenario: 后台 session 收到待审
- **WHEN** session A 是 active；session B 收到 `tool.approval-needed`
- **THEN** Conversations 中 B 行右侧显示红点

#### Scenario: 切换后清除
- **WHEN** 用户从 A 切到 B
- **THEN** B 的红点立即消失；inline Actions 在 B 的 ThoughtChain step 中显示
