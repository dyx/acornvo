# quick-switcher Specification

## Purpose
QuickSwitcher 快速跳转组件，提供 Cmd+P 全局快捷键打开模态，支持模糊搜索文件名/路径并快速跳转。

## Requirements

### Requirement: Cmd+P 全局快捷键
系统 SHALL 在根布局注册全局 `Cmd/Ctrl+P` 快捷键，打开 QuickSwitcher 模态。键绑定 MUST `preventDefault` 以覆盖浏览器/系统默认行为。快捷键在 `/editor` 页同样生效。

#### Scenario: 任意页面打开
- **WHEN** 用户在 `/library` 按 `Cmd+P`
- **THEN** QuickSwitcher 模态弹出，输入框聚焦

#### Scenario: 编辑器页也生效
- **WHEN** 用户在 `/editor/...` 按 `Cmd+P`
- **THEN** 模态打开；编辑器失焦；input 聚焦

#### Scenario: Esc 关闭
- **WHEN** 模态开启时按 Esc
- **THEN** 模态关闭；焦点还原到触发前元素

### Requirement: QuickSwitcher 模态 UI
QuickSwitcher SHALL 为顶部居中模态（距顶 15%，宽度 600px），包含：输入框（带 placeholder "搜索文件名 / 路径"）+ 候选列表（最多 10 行，行高 48px）。列表项 MUST 显示标题 + 相对路径 + clipped_at。查询防抖 80ms；发起新查询前 abort 旧查询。

#### Scenario: 输入防抖
- **WHEN** 用户快速输入"attention"
- **THEN** 仅最后 80ms 停手后一次调 `search.quickSwitch`

#### Scenario: 空态
- **WHEN** 输入框为空
- **THEN** 候选列表显示 "最近打开"（renderer 内存 LRU，最多 10 条）

### Requirement: QuickSwitcher 键盘与选择
候选列表 SHALL 支持：`↓`/`↑` 移动选中项；`Enter` 跳 `/editor/<encodedPath>`；`Cmd/Ctrl+Enter` 跳 `/library` 并滚动高亮该行（library store 设置 `selectedPath=命中path`）；`Esc` 关闭。点击候选行等价 Enter。

#### Scenario: Enter 打开编辑器
- **WHEN** 选中某候选行按 Enter
- **THEN** 模态关闭 + navigate 到 `/editor/<encodedPath>`

#### Scenario: Cmd+Enter 在果仓定位
- **WHEN** 选中某候选行按 `Cmd+Enter`
- **THEN** 模态关闭 + navigate `/library` + library 的 VirtualFileList 自动 scrollToIndex 到该行 + selectedPath 设为该 path

#### Scenario: 上下箭头
- **WHEN** 连按 ↓
- **THEN** 选中项在 10 行内循环；到底部不再移动

### Requirement: QuickSwitcher 排序
候选排序 SHALL 遵循：(1) 标题完全等于 q；(2) 标题前缀匹配；(3) 标题子串匹配；(4) 路径子串匹配；同级 MUST 按 `clipped_at DESC`。

#### Scenario: 标题优先
- **WHEN** q="笔记"；存在 title="笔记"、title="旅行笔记"、path="notes/旧/x.md"（title="x"）
- **THEN** 顺序：title="笔记" > title="旅行笔记" > path 含"notes"但非标题匹配的其他行
