## MODIFIED Requirements

### Requirement: 右侧 Approval 抽屉

**右栏审批面板已删除**（PRD §1.2 + design.md §B-A3）。审批 UI SHALL 改为消息流内 `ApprovalInlineActions`（inline Actions，渲染在对应 assistant 消息 ThoughtChain 中含 pendingApproval 的 step 内）+ Edit 时弹 `ApprovalDrawer`（antd `Drawer`，width=520，从右侧滑入）。布局 MUST 简化为两栏，chat 页右栏宽度 NOT 受审批事件影响。

#### Scenario: 收到 approval 渲染 inline

- **WHEN** 当前 session 收到 `tool.approval-needed`
- **THEN** store 把 PendingApproval push 到 `bySession[sid].pendingApprovals`；`bubbleSelectors` 把它合进对应 assistant 消息的 toolStep；ThoughtChain 该 step 显示 inline Actions（Approve / Reject / Edit）；MessageList 区域宽度 NOT 变（右栏已删）

#### Scenario: 非当前 session

- **WHEN** approval 事件来自其他 session
- **THEN** 当前不渲染 inline Actions；Conversations 中该 session 行加红点（chat-session-list 规格）

#### Scenario: 处理后消失

- **WHEN** 用户点 Approve 或 Reject 且 store 中 pendingApprovals 移除该 callId
- **THEN** inline Actions 立即从 ThoughtChain step 中消失；step 显示 tool result（如已到达）或 loading

### Requirement: 审批面板结构

`ApprovalInlineActions` SHALL 渲染在 ThoughtChain 待审 step 内，包含三个 antd-x `Actions` 按钮：Approve / Reject / Edit；图标分别为 Check / Close / Edit。

`ApprovalDrawer`（点 Edit 后打开）SHALL 包含：

1. 标题：工具名 + "待审" antd `Tag`
2. Reason 区：显示 `approval.reason` 文本
3. 参数编辑区：
   - `update_frontmatter`：保留 `FrontmatterDiff` 组件，展示 before / after YAML，变更行底色高亮；before 区只读
   - 其他工具：保留 `JsonArgsEditor` 组件，可编辑 JSON
4. Drawer 底部 Footer：取消按钮 + "确认并同意" 主按钮（调 `chat.approveTool(sessionId, callId, editedArgs)`）

#### Scenario: update_frontmatter diff

- **WHEN** 用户在 ApprovalDrawer 中工具为 update_frontmatter
- **THEN** Drawer 显示 FrontmatterDiff 两栏；变更行着色；before 区不可编辑

#### Scenario: 编辑参数后同意

- **WHEN** 用户改 JSON 后点 "确认并同意"
- **THEN** 调 `chat.approveTool(sessionId, callId, editedArgs=解析后 JSON)`；Drawer 关闭；inline Actions 移除

#### Scenario: 编辑无效 JSON

- **WHEN** 用户改 JSON 为非法格式后点 "确认并同意"
- **THEN** antd `message.error` 显示 JSON 解析错误；Drawer 不关闭；不调 approveTool

#### Scenario: 关闭 Drawer 不提交

- **WHEN** 用户在 Drawer 编辑参数后点 "取消" 或按 Esc
- **THEN** Drawer 关闭；不调 approveTool；pendingApproval 仍在 store；inline Actions 仍可见

### Requirement: 审批队列

当同一 assistant 消息含多个**并行** toolCalls 且 ≥2 个待审时，ThoughtChain 的每个待审 step SHALL 各自渲染独立 inline Actions。用户 MUST 能独立 approve / reject 每个 step；UI NOT 集中到右栏队列轮转。

当存在多条 assistant 消息各自含待审 toolCall 时，每条消息 SHALL 独立显示自己的 inline Actions（不集中到队列）；按消息时间顺序自然展示。

#### Scenario: 单消息多并行待审

- **WHEN** 单条 assistant 消息含 toolCalls=[A, B] 且两个都待审
- **THEN** ThoughtChain 渲染两个 step；每个 step 独立 Approve / Reject / Edit

#### Scenario: 多消息各自待审

- **WHEN** 历史中两条 assistant 消息各自含一个待审 toolCall
- **THEN** 两条消息各自显示 inline Actions；用户可任意顺序处理

### Requirement: 超时与异常显示

Approval 30 分钟未处理由 agent 层自动拒绝；UI 收到对应 `tool.result` 的 `error: 'E_APPROVAL_TIMEOUT'` 时 inline Actions MUST 消失，对应 ThoughtChain step 改为显示 "此操作已超时取消"（用 antd `Alert.banner` 或 ThoughtChain step 内文案显示）。

#### Scenario: 超时取消

- **WHEN** 30 分钟未处理且 agent emit tool.result 带 error='E_APPROVAL_TIMEOUT'
- **THEN** inline Actions 消失；该 ThoughtChain step 显示 "此操作已超时取消"
