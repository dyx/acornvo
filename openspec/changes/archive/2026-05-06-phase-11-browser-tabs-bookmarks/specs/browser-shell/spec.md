## ADDED Requirements

### Requirement: /browse 路由布局
系统 SHALL 注册 `/browse` 路由，页面 SHALL 含：
- 顶部 TabBar（高 60px）
- AddressBar（高 40px，含地址输入、前进/后退/刷新按钮、reader toggle、剪藏按钮占位）
- 左侧可折叠 Bookmarks 侧栏（默认折叠，展开宽 200px）
- 右侧主区为 `#browser-viewport` 占位 div，由 main 侧 WebContentsView 填充

#### Scenario: 打开拾果
- **WHEN** 用户点击 AppRail 的"拾果"或 navigate `/browse`
- **THEN** 页面渲染 TabBar + AddressBar；若首次进入无 tab 则自动创建一个"新标签页"空白 tab

#### Scenario: 主布局同步 bounds
- **WHEN** 用户拖动窗口边缘改变尺寸
- **THEN** `#browser-viewport` 的新矩形通过 `browser.setViewport({x,y,w,h})` 在 16ms debounce 后推送 main；main 更新当前激活 WebContentsView 的 setBounds

### Requirement: WebContentsView 生命周期
每个 tab SHALL 对应一个独立 `WebContentsView`；其 webPreferences MUST 为 `{ sandbox: true, contextIsolation: true, nodeIntegration: false, preload: '' }`（或无 preload）。session MUST 为 `session.fromPartition('persist:browser-default')`（默认持久化）。

#### Scenario: 创建 tab
- **WHEN** 用户在 TabBar 点 "+" 或通过 `window.open` 创建
- **THEN** main 创建新 WebContentsView、attach 到 contentView、记录进 tabs store；若此前已有激活 tab，其 view 被 detach

#### Scenario: 关闭 tab
- **WHEN** 用户关闭一个 tab
- **THEN** main 调 `contentView.removeChildView(view)` + `webContents.close()`；store 移除该 tabId；若为当前激活 tab → 切到右侧 tab 或新建空白

#### Scenario: LRU 挂起
- **WHEN** alive tab 数 > 20，用户再创建一个
- **THEN** 最久未访问的 tab 被 suspend（WebContents destroy；保留 { url, title, favicon } 元数据）；tab 在 TabBar 仍可见

#### Scenario: 挂起后切回
- **WHEN** 用户点击一个 suspended tab
- **THEN** 重新创建 WebContentsView 并 `loadURL(savedUrl)`；loading 指示可见；加载完成恢复 title/favicon

### Requirement: AddressBar 输入处理
AddressBar 的输入 SHALL 按以下规则处理：
- 包含 `://` 的字符串：原样 loadURL
- 形如域名（含至少一个 `.` 且无空格）：补 `https://` 前缀 loadURL
- 其他（含空格或单词）：按搜索处理，跳 `https://www.google.com/search?q=<encodeURIComponent(q)>`

Enter 触发导航；Esc 回填原 URL 并失焦。

#### Scenario: 完整 URL
- **WHEN** 输入 `https://example.com` 回车
- **THEN** loadURL 为该字符串

#### Scenario: 域名补 https
- **WHEN** 输入 `example.com` 回车
- **THEN** loadURL `https://example.com`

#### Scenario: 搜索
- **WHEN** 输入 `注意力机制` 回车
- **THEN** loadURL `https://www.google.com/search?q=%E6%B3%A8%E6%84%8F%E5%8A%9B%E6%9C%BA%E5%88%B6`

#### Scenario: 粘贴快捷按钮
- **WHEN** 剪贴板含 URL `https://news.com/x` 且 AddressBar 聚焦
- **THEN** 下方出现 "粘贴并打开 https://news.com/x" 按钮；点击等价回车
