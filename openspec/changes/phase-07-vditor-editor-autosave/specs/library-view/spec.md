## MODIFIED Requirements

### Requirement: 预览面板
预览面板 SHALL 展示：category/site/字数 header、标题、评分星、AI 摘要卡片（含 highlights bullets）、tags chips、"打开编辑器"按钮。无 summary 的文件 MUST 显示"理果中"占位（脉动 loader + 文案）。"打开编辑器"按钮点击 MUST 真实跳转到 `/editor/<encodedPath>` 并成功加载编辑器页（不再是占位）。

#### Scenario: 选中已理果文件
- **WHEN** 用户选中一个含 summary 的文件
- **THEN** 摘要卡片渲染 summary 文本 + highlights 列表 + tags

#### Scenario: 选中未理果文件
- **WHEN** 选中 `summary IS NULL` 的文件
- **THEN** 摘要卡片显示 "理果中 · DeepSeek 正在生成摘要"（模型名可占位，phase 15 再接真实）

#### Scenario: 跳编辑器
- **WHEN** 用户点击"打开编辑器"按钮或双击文件行
- **THEN** navigate 到 `/editor/<encodedPath>`；editor 页正常加载 frontmatter + body 并进入 ready 状态

### Requirement: 文件列表虚拟化
文件列表 SHALL 使用 `@tanstack/react-virtual`。1000 行滚动 MUST 流畅（60fps）且仅渲染可见窗口 + overscan 10。列表行 Enter 键 MUST 等价于"打开编辑器"（跳 `/editor/<encodedPath>`）；双击同义。

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
