## ADDED Requirements

### Requirement: 果仓三栏布局
`/library` 路由 SHALL 渲染三栏布局：左侧分类侧栏（视图 + 分类树 + 标签云）、中间文件列表、右侧预览面板。布局 MUST 适应窗口大小（响应式），中间列表固定宽度 360px，左侧 200px，预览面板占剩余。

#### Scenario: 打开果仓
- **WHEN** 索引完成后用户停留在 `/library`
- **THEN** 三栏全部渲染；默认选中"全部"视图；文件列表按 `clipped_at` 倒序；预览面板显示首行选中文件

#### Scenario: 空树林
- **WHEN** 打开一棵空树林
- **THEN** 列表区显示空态："还没有文件，去[拾果]或手动新建一篇"（链接占位，拾果跳 phase 11、新建到 phase 7）
- **AND** 左侧分类侧栏仅展示"视图"分组，分类树和标签云为空

### Requirement: 文件列表虚拟化
文件列表 SHALL 使用 `@tanstack/react-virtual`。1000 行滚动 MUST 流畅（60fps）且仅渲染可见窗口 + overscan 10。

#### Scenario: 大库滚动
- **WHEN** 列表含 5000 行，用户快速拖动滚动条到底部
- **THEN** DOM 内任一时刻 `.file-row` 节点数 ≤ 可视行数 + 20
- **AND** 滚动过程中无明显卡顿

#### Scenario: 被选中行始终可见
- **WHEN** 用户按 ↑↓ 键移动选中项超出可视窗口
- **THEN** 虚拟化容器自动滚动使选中行进入视图

### Requirement: 文件行视图
每个文件行 SHALL 展示：标题、相对路径、5 格评分点阵（或"· 理果中"）、采集时间。`frontmatter.rating` 为 null 时评分区 MUST 显示脉动点表示"理果中"。

#### Scenario: 已理果文件
- **WHEN** 某行 rating = 4
- **THEN** 5 格点阵前 4 格实心

#### Scenario: 未理果文件
- **WHEN** 某行 rating = null
- **THEN** 评分区显示脉动的小圆点 + "理果中"文字（或 phase 预留 `is_reviewing=false` 时仍显示占位）

### Requirement: 分类侧栏
分类侧栏 SHALL 含三个分组：视图（全部 / 果篮 / 待理果）、分类树（从 `files.category` 派生）、标签云（`tags.usage_count` Top 30）。每项 MUST 显示计数。

#### Scenario: 点击分类
- **WHEN** 用户点击分类树中的"技术/深度学习"
- **THEN** filter.category = "技术/深度学习"；列表刷新；条件下文件计数正确显示

#### Scenario: 点击标签
- **WHEN** 用户点击标签 `#attention`
- **THEN** filter.tag = "attention"；列表刷新

#### Scenario: 点击果篮
- **WHEN** 用户点击"果篮"
- **THEN** filter.pathPrefix = "inbox/"；列表只显示果篮内文件

### Requirement: 预览面板
预览面板 SHALL 展示：category/site/字数 header、标题、评分星、AI 摘要卡片（含 highlights bullets）、tags chips、"打开编辑器"按钮。无 summary 的文件 MUST 显示"理果中"占位（脉动 loader + 文案）。

#### Scenario: 选中已理果文件
- **WHEN** 用户选中一个含 summary 的文件
- **THEN** 摘要卡片渲染 summary 文本 + highlights 列表 + tags

#### Scenario: 选中未理果文件
- **WHEN** 选中 `summary IS NULL` 的文件
- **THEN** 摘要卡片显示 "理果中 · DeepSeek 正在生成摘要"（模型名可占位，phase 15 再接真实）

#### Scenario: 跳编辑器
- **WHEN** 用户点击"打开编辑器"按钮或双击文件行
- **THEN** navigate 到 `/editor/<encodedPath>`（phase 7 占位路由或真实页面）

### Requirement: 顶部快速过滤
文件列表顶部 SHALL 提供搜索输入框，输入时按标题 + 路径做 SQL LIKE 过滤。输入框 placeholder SHALL 提示 `⌘P 跳转 · ⌘⇧F 全文`（两者分别在 phase 8 实装）。

#### Scenario: 标题片段匹配
- **WHEN** 用户输入 "注意力"
- **THEN** 列表只保留标题或路径含"注意力"的行

### Requirement: 索引变化同步
果仓 SHALL 订阅 `index:fileChanged` / `index:fileDeleted` / `index:fileRenamed` 事件，收到后 MUST 重新加载当前视图。被删文件若正被选中 MUST 清空预览面板。

#### Scenario: 外部新增文件
- **WHEN** 外部在树林内新建 md 文件
- **THEN** 1 秒内果仓列表出现该新行

#### Scenario: 被选中文件被删
- **WHEN** 当前选中 `notes/x.md`，外部删除该文件
- **THEN** 列表该行消失，预览面板回到空态

### Requirement: 索引状态可视
果仓顶部 SHALL 根据 `IndexState` 显示提示：`scanning` 时 banner "索引中，数据可能不完整"；`error` 时红色 banner + "查看日志"入口（`shell.openPath(~/.acornvo/logs/)`）。

#### Scenario: 扫描中进入果仓
- **WHEN** 进入果仓时扫描仍在进行（例如用户用"后台继续"跳过遮罩）
- **THEN** 页面顶部出现黄色提示条，列表正常渲染已索引行

### Requirement: 右键菜单（最小）
文件行 SHALL 支持右键菜单，至少含"打开"与"在 Finder 中显示"两项。

#### Scenario: 在 Finder 中显示
- **WHEN** 用户右键某文件选"在 Finder/资源管理器中显示"
- **THEN** 调 `shell.showItemInFolder(absPath)`，操作系统跳转到该文件
