# history-panel Specification

## Purpose

The History page providing tabs for Trash, Conflicts, Ops, and Jobs views. Accessible via `/history` route.

## Requirements

### Requirement: /history 路由

系统 SHALL 注册 `/history` 路由；默认 redirect 到 `/history/trash`。页面 SHALL 用 Tabs 组件展示四个子 tab：Trash（回收站记录）、Conflicts（冲突快照）、Ops（所有操作）、Jobs（任务队列）。URL 与 tab 双向同步。

#### Scenario: 进入默认 tab

- **WHEN** navigate 到 `/history`
- **THEN** URL 变为 `/history/trash`；Trash tab 激活

#### Scenario: 切换 tab

- **WHEN** 点击 Conflicts tab
- **THEN** URL 变为 `/history/conflicts`；Conflicts 内容显示

#### Scenario: 任务 tab URL

- **WHEN** 点击 Jobs tab
- **THEN** URL 变为 `/history/jobs`；Jobs 面板显示

### Requirement: Trash tab

Trash tab SHALL 列出 `ops.list({ op: 'trash' })` 近 90 天的行（虚拟化列表）。每行显示：path / ts（distance）/ "已在系统回收站中"。顶部提供"打开原目录"入口（若目录仍存在 → `shell.openPath(dirname)`；否则 disable）。页面 MUST 显示提示"Acornvo 不管理系统回收站；请到系统的废纸篓恢复"。

#### Scenario: 列表渲染

- **WHEN** 近期 trash 了 3 个文件
- **THEN** Trash tab 有 3 行；顶部提示文案可见

#### Scenario: 原目录已删

- **WHEN** 某行的 path 所在目录也被删
- **THEN** "打开原目录"按钮 disable；tooltip "目录不存在"

### Requirement: Conflicts tab

Conflicts tab SHALL 左右分栏：左列 `conflict.list({ limit, offset })` 虚拟化列表（ConflictItem）；右列 ConflictDetailPanel。左列行点击 → 右列加载对应快照；URL `?id=<conflictId>` 深链接。列表顶部提供"清空所有快照"按钮（二次确认）。

#### Scenario: 基本渲染

- **WHEN** `.acornvo/conflicts/` 含 5 条
- **THEN** 左列 5 行；右列默认加载第一条

#### Scenario: 深链接

- **WHEN** URL 为 `/history/conflicts?id=<cid>`
- **THEN** 左列选中该行，右列加载其详情

#### Scenario: 清空

- **WHEN** 用户点"清空所有快照"并二次确认
- **THEN** 全部快照目录被删；每条产生一条 `op='conflict_delete'` ops_log

### Requirement: Ops tab

Ops tab SHALL 以虚拟化列表展示 `ops.list()` 所有行（按 ts 降序）。顶部提供 op 过滤 chips：`全部 / trash / conflict_resolve / conflict_delete / rename / hard_delete`。行渲染含：op 徽标、路径、时间 distance、meta 的摘要文本。点击 `op='conflict_resolve'` 行 MUST 跳 `/history/conflicts?id=<meta.id>`。

#### Scenario: 过滤

- **WHEN** 用户点 "trash" chip
- **THEN** 列表仅剩 op='trash' 的行

#### Scenario: 跳转到冲突详情

- **WHEN** 点某 conflict_resolve 行
- **THEN** navigate 到 `/history/conflicts?id=<meta.id>`；该 conflict 详情加载

### Requirement: History 面板空态

任一 tab 为空时 SHALL 显示友好空态：

- Trash 空："没有已删除的文件"
- Conflicts 空："没有冲突历史。你的文件在 Acornvo 与外部工具之间同步良好。"
- Ops 空："还没有任何操作记录"
- Jobs 空："没有待办任务"

#### Scenario: 全新树林

- **WHEN** 刚创建的树林打开 `/history`
- **THEN** 四个 tab 均显示对应空态文案
