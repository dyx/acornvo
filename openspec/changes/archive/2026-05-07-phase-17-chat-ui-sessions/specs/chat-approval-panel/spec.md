## ADDED Requirements

### Requirement: 右侧 Approval 抽屉

ApprovalPanel SHALL 渲染在页面右侧，默认宽 0 隐藏；当收到 `tool.approval-needed` 事件且对应 session 为当前 session 时 MUST 滑入 320px 展开（transition 200ms）。面板关闭条件：用户点同意 / 取消 或 approval 被 agent 超时释放。

#### Scenario: 收到 approval 展开

- **WHEN** 当前 session 收到 tool.approval-needed
- **THEN** 右侧栏滑入 320px；MessageList 区域宽度相应缩减

#### Scenario: 非当前 session 不展开

- **WHEN** approval 事件来自其他 session
- **THEN** 当前右栏不展开；SessionList 中该 session 行加红点标记

#### Scenario: 处理后收起

- **WHEN** 用户点同意 / 取消 且队列清空
- **THEN** 右栏滑回 0

### Requirement: 审批面板结构

面板从上到下 SHALL 包含：

1. 标题区：工具 icon + 名称（如"更新 frontmatter"）+ "待审"标签
2. Reason 区：显示 approval.reason 文本
3. 参数区：
   - `update_frontmatter`：两栏 before / after YAML，变更行底色高亮（绿加 / 红减）
   - 其他工具：`<pre>` JSON + 可切换为 textarea 编辑模式
4. 底部动作栏：
   - 主按钮 "同意" → 调 `chat.approveTool({ callId, editedArgs? })`
   - 次按钮 "取消" → 调 `chat.rejectTool({ callId })`
   - 文本按钮 "编辑参数" → 切参数区为可编辑 textarea；启用后"同意"会携带 editedArgs

#### Scenario: update_frontmatter diff

- **WHEN** 工具为 update_frontmatter 且 args 含 before / after
- **THEN** 展示两栏 YAML；变更行着色；不允许编辑 before

#### Scenario: 编辑参数后同意

- **WHEN** 用户点"编辑参数"修改 JSON 后点"同意"
- **THEN** 调 approveTool 传 editedArgs=解析后的 JSON；若 JSON 非法显示错误 toast 不关闭面板

### Requirement: 审批队列

若同一 session 有多个 pending approval SHALL 按到达时序排队，每次仅渲染队首；底部 MUST 显示 "还有 N 条待审"（N ≥ 1）。处理完当前 → 自动切换到下一条。

#### Scenario: 多条待审

- **WHEN** 连续收到 3 个 approval-needed
- **THEN** 面板显示第 1 条；底部文字 "还有 2 条待审"

#### Scenario: 顺序处理

- **WHEN** 用户同意当前
- **THEN** 面板切到第 2 条；底部 "还有 1 条待审"

### Requirement: 超时与异常显示

Approval 30 分钟未处理会被 agent 层自动拒绝；UI 收到对应 `tool.result` 的 `E_APPROVAL_TIMEOUT` 时面板 MUST 显示"此操作已超时取消"并 2 秒后自动关闭当前条目。

#### Scenario: 超时取消

- **WHEN** 30 分钟未处理
- **THEN** agent emit tool.result 带 error=E_APPROVAL_TIMEOUT；面板闪现超时提示并移除该条
