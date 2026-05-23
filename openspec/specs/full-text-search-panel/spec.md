# full-text-search-panel Specification

## Purpose

全文搜索页面组件，提供 `/search` 路由页面，支持中文分词全文搜索、结果高亮、防抖输入等功能。

## Requirements

### Requirement: Cmd+Shift+F 打开搜索页

系统 SHALL 在根布局注册全局 `Cmd/Ctrl+Shift+F` 快捷键，navigate 到 `/search`。`/search?q=...` 路由 SHALL 作为路由页（非模态）持久化查询在 URL query 中。再次按快捷键时：若当前已在 `/search` → 输入框 select-all；否则跳 `/search`。

#### Scenario: 从果仓跳搜索

- **WHEN** 用户在 `/library` 按 `Cmd+Shift+F`
- **THEN** navigate 到 `/search`；输入框聚焦

#### Scenario: URL 携带 q

- **WHEN** URL 为 `/search?q=注意力`
- **THEN** 输入框预填 "注意力"，自动触发搜索

### Requirement: 搜索页布局

`/search` 页 SHALL 为单列布局：顶部 TitleBar 固定 + 大号搜索输入 + 结果统计 + 结果列表（虚拟化，复用果仓的 VirtualFileList 变体）。结果行 MUST 显示：标题、相对路径、snippet（多行，`<mark>` 高亮命中词）、clipped_at。

#### Scenario: 首次进入

- **WHEN** 无 q
- **THEN** 页面显示 "输入关键词开始搜索（支持中文分词）" + "最近搜索"列表（最多 5 条，来自 renderer 内存，跨 session 不持久化）

#### Scenario: 有结果

- **WHEN** q="注意力"，命中 120 行
- **THEN** 顶部显示 "120 条结果"；列表虚拟化渲染；底部分页"下一页"按钮或滚动加载

#### Scenario: 零结果

- **WHEN** q="asdfghjkl"，命中 0
- **THEN** 显示 "无匹配结果" + "尝试减少关键词 / 使用引号做精确短语"提示

#### Scenario: 索引构建中

- **WHEN** `search.fullText` 返回 `pending: true`
- **THEN** 顶部显示 "索引构建中 ... / ..." 进度条；结果列表显示"构建完成后将自动重试"

### Requirement: 结果点击行为

结果行点击 SHALL navigate 到 `/editor/<encodedPath>`；本阶段不实装命中高亮定位（Vditor 不支持），但 URL MUST 附加 `#match=<q>` 片段，供后续（phase 9+）编辑器接入时使用。`Cmd/Ctrl+Click` MUST 在 library 定位文件（跳 `/library` + 选中）。

#### Scenario: 普通点击

- **WHEN** 用户点击结果行
- **THEN** navigate 到 `/editor/<encodedPath>#match=<q>`；编辑器正常加载（本阶段忽略 hash）

#### Scenario: Cmd+Click 定位

- **WHEN** Cmd+Click 结果行
- **THEN** navigate `/library` + 选中该文件

### Requirement: 搜索输入防抖与高亮

输入防抖 SHALL 为 200ms；发起新请求前 abort 上一个。snippet 渲染 MUST 按 `<mark>` 高亮命中词（服务器返回已包裹的片段），客户端不再重新切词高亮。

#### Scenario: 快速改 q

- **WHEN** 用户从 "att" 连续删改到 "attention"
- **THEN** 只触发一次最终 `search.fullText("attention")`

### Requirement: 引号短语语法提示

输入框 placeholder 或下方 MUST 有一行小字提示支持引号短语：`输入"xxxx"做精确短语搜索`。

#### Scenario: 提示可见

- **WHEN** 用户首次打开 `/search`
- **THEN** 输入框下方可见该提示文案
