## MODIFIED Requirements

### Requirement: 右键菜单（最小）
文件行 SHALL 支持右键菜单，含以下项：
- "打开"（等价双击 / Enter）
- "在 Finder/资源管理器中显示"
- 分隔线
- "移到废纸篓"（触发 `file.trash(path)` 的 confirm 弹窗）

菜单 MUST 在用户右键任意行时弹出，定位 close to the cursor。

#### Scenario: 在 Finder 中显示
- **WHEN** 用户右键某文件选"在 Finder/资源管理器中显示"
- **THEN** 调 `shell.showItemInFolder(absPath)`，操作系统跳转到该文件

#### Scenario: 移到废纸篓
- **WHEN** 用户右键某文件选"移到废纸篓"
- **THEN** 弹 confirm modal 显示路径；用户点"移到废纸篓"按钮 → 调 `file.trash(path)`；成功后该行从列表消失

#### Scenario: 取消删除
- **WHEN** confirm modal 打开时用户按 Esc 或"取消"
- **THEN** 无任何改动；菜单关闭

### Requirement: 文件列表虚拟化
文件列表 SHALL 使用 `@tanstack/react-virtual`。1000 行滚动 MUST 流畅（60fps）且仅渲染可见窗口 + overscan 10。列表行 Enter 键 MUST 等价于"打开编辑器"（跳 `/editor/<encodedPath>`）；双击同义。

列表容器 SHALL 在聚焦状态下响应 `Cmd/Ctrl+Backspace`（macOS）与 `Delete`（Win/Linux）快捷键：
- 仅在有选中行时触发
- 等价触发当前选中行的"移到废纸篓" confirm modal

#### Scenario: 大库滚动
- **WHEN** 列表含 5000 行，用户快速拖动滚动条到底部
- **THEN** DOM 内任一时刻 `.file-row` 节点数 ≤ 可视行数 + 20
- **AND** 滚动过程中无明显卡顿

#### Scenario: 被选中行始终可见
- **WHEN** 用户按 ↑↓ 键移动选中项超出可视窗口
- **THEN** 虚拟化容器自动滚动使选中行进入视图

#### Scenario: Enter 打开编辑器
- **WHEN** 在列表聚焦状态按 Enter
- **THEN** 当前选中行的文件 navigate 到 `/editor/<encodedPath>`

#### Scenario: 双击打开编辑器
- **WHEN** 用户在任一行双击
- **THEN** navigate 到 `/editor/<encodedPath>`

#### Scenario: 快捷键删除
- **WHEN** 用户在 Library 选中一行按 `Cmd+Backspace`
- **THEN** 弹"移到废纸篓"confirm modal
