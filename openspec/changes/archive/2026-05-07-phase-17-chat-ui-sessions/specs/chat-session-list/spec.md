## ADDED Requirements

### Requirement: SessionList 左栏渲染

SessionList SHALL 渲染在 Chat 页面左侧（300px），顶部 MUST 包含 "+" 新建按钮与搜索框，下方按 `updated_at DESC` 列出所有 session。每行 MUST 显示：title（单行截断）、相对时间、hover 显示删除按钮；active session 左侧 3px 主色竖线。

#### Scenario: 初次打开

- **WHEN** 打开 /chat 且 sessions.list 非空
- **THEN** 列表按时间倒序渲染；默认选中第一个 session；MessageList 加载该 session 的消息

#### Scenario: 无 session 自动建

- **WHEN** sessions.list 返回空
- **THEN** 自动调 chat.sessions.create；新建的 session 出现在顶部且被选中

#### Scenario: 搜索过滤

- **WHEN** 用户在搜索框输入 "笔记"
- **THEN** 本地 filter title 包含"笔记"的 session；其他隐藏

### Requirement: CRUD 操作

SessionList SHALL 支持以下操作：

- 新建：顶部 "+" → 调 `chat.sessions.create()` → activate
- 重命名：双击 title 或右键 "重命名" → 变 inline input；Enter 提交；Esc 取消
- 删除：hover 行的删除按钮或右键 "删除" → 二次确认对话框 → 调 `chat.sessions.delete` → 若删的是当前 session，选中下一条或新建
- 复制 session id：右键菜单 "复制 session id" → clipboard

#### Scenario: 新建

- **WHEN** 用户点 "+"
- **THEN** 调 sessions.create（默认 title="未命名对话"）→ 新 session 出现在顶部 → 自动 activate → 中间区域显示空态引导

#### Scenario: 重命名

- **WHEN** 用户双击某 session 的 title 输入 "旅行计划" 按 Enter
- **THEN** 调 sessions.rename；列表 title 更新

#### Scenario: 删除当前 session

- **WHEN** 用户删除当前选中的 session 并确认
- **THEN** 调 sessions.delete；列表下一条被选中；若列表空 → 自动新建

### Requirement: 状态指示

SessionList 行 SHALL 用可选 badge 显示状态：

- session 正在流式中 → 行右侧一个跑马灯小点（主色脉动）
- 有 pending approval（非当前 session）→ 红点
- 最近一次错误（E_NETWORK 等）→ 黄色感叹号 icon（点击查看错误详情）

#### Scenario: 后台流式

- **WHEN** 用户在 A session 发送后切到 B session 继续聊天
- **THEN** A session 行显示主色脉动；完成后脉动消失

#### Scenario: 后台 approval 提示

- **WHEN** B session 发生 approval-needed 且当前在 A session
- **THEN** B 行右侧红点；点 B → 切到 B session；右侧 approval 展开
