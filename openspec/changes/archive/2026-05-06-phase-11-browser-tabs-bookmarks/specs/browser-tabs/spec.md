## ADDED Requirements

### Requirement: Tabs Store 模型

`src/stores/browser.ts` SHALL 维护：

```
tabs: { id, url, title, favicon, loading, canGoBack, canGoForward, readerMode, suspended }[]
activeTabId: string | null
```

操作 actions：`createTab(url?)` / `closeTab(id)` / `activateTab(id)` / `reorderTab(id, targetIndex)` / `setReaderMode(id, on)` / `navigate(id, url)`。

#### Scenario: 初始化

- **WHEN** 首次打开 `/browse`
- **THEN** tabs 数组恰为 1 个空白 tab（url='about:blank' 或 'acorn://new-tab'）；activeTabId 指向它

#### Scenario: 关闭最后一个 tab

- **WHEN** 用户关闭仅存的唯一 tab
- **THEN** 自动创建一个新 blank tab；不让 tabs 为空

### Requirement: TabBar UI

TabBar SHALL 水平展示全部 tab，每个 tab 含 favicon + 截断标题 + 关闭按钮。激活 tab MUST 有视觉差异（底色 + 底部边框）。tab 宽度自适应（最小 120px，最大 240px）；tab 数过多时可横向滚动。

#### Scenario: 切换 tab

- **WHEN** 用户点击另一个 tab
- **THEN** `activateTab(id)` 被调；内容区切换到该 tab 的 WebContentsView

#### Scenario: 拖拽重排

- **WHEN** 用户拖拽某 tab 到另一位置
- **THEN** `reorderTab(id, targetIndex)` 被调；tabs 数组顺序更新；UI 反映

#### Scenario: loading 指示

- **WHEN** 某 tab loading=true
- **THEN** 其 favicon 位置显示 spinner 动画

#### Scenario: Cmd+W 关闭当前 tab

- **WHEN** 聚焦在 `/browse`（非编辑器）按 `Cmd/Ctrl+W`
- **THEN** 关闭激活 tab（不是关闭窗口）；窗口保持

### Requirement: 快捷键

系统 SHALL 在 `/browser` 路由聚焦时注册以下快捷键：

- `Cmd/Ctrl+T`：新建 tab（空白，聚焦 AddressBar）
- `Cmd/Ctrl+W`：关闭当前 tab（最后一个 tab 被关闭时 MUST 改为新建空白而非真正关窗）
- `Cmd/Ctrl+Tab` / `Ctrl+Tab`：下一个 tab（循环）
- `Cmd/Ctrl+Shift+Tab`：上一个 tab
- `Cmd/Ctrl+1..9`：跳到第 N 个 tab（不存在时忽略）
- `Cmd/Ctrl+L`：聚焦 AddressBar 并全选

#### Scenario: 新建 tab

- **WHEN** 在 `/browse` 按 `Cmd+T`
- **THEN** 创建空白 tab + 激活 + AddressBar 聚焦

#### Scenario: 跳到第 3 个

- **WHEN** 按 `Cmd+3`
- **THEN** 第 3 个 tab 激活（不存在则忽略）

### Requirement: Tab 状态同步

main 侧 `webContents` 事件 MUST 转发到 renderer：`did-start-loading` / `did-stop-loading` / `page-title-updated` / `page-favicon-updated` / `did-navigate` / `did-navigate-in-page`。renderer 通过 `browser.tabStateChanged({ tabId, patch })` 事件更新 store。

#### Scenario: 导航完成

- **WHEN** 某 tab 导航到新 URL 完成
- **THEN** store 的 tab.url/title/favicon/canGoBack 都更新

#### Scenario: favicon 变化

- **WHEN** 页面的 favicon link 变了
- **THEN** tab.favicon 字段更新；TabBar 即时反映
