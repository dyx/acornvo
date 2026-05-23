## Context

前置：

- phase 1：AppRail（占位）、Electron 主窗口（BrowserWindow + contextIsolation/sandbox）
- phase 3：`better-sqlite3` + migrations 机制
- PRD P-2 / S-6：拾果必须"内置浏览器体验"，不能跳外部浏览器

技术取舍：

- **webview 标签** (Chromium tag)：已被官方标记为 legacy，不推荐
- **iframe**：隔离弱，无法访问 webContents / session，不能注入脚本
- **WebContentsView** (Electron 30+)：主进程托管的视图；**采纳**

## Goals / Non-Goals

**Goals:**

- 用户在 `/browse` 可像普通浏览器一样开多个 tab、输入网址、访问、前进后退、收藏
- 为 phase 12 的拾果做好宿主：拾果发起时可直接拿到当前 tab 的 webContents + URL + HTML
- 广告拦截默认开启（保护注意力 + 减少网络）
- 书签可按 tag 过滤；数据进 SQLite 便于 phase 17 松语做"@网页引用"

**Non-Goals:**

- 不做扩展（AdBlock 插件、Tampermonkey 等）
- 不做密码管理器 / 表单自动填写
- 不做隐私模式（默认都走非持久 session 还是持久化？→ **持久化**，用户登录态保留，符合内置浏览器体验）
- 不做浏览历史记录（隐私 + 存储成本；若 phase 12 需要可补）
- 不做下载管理（WebContents 默认对话框交由系统即可）
- 不做多窗口浏览（一切在 /browse 内的 tabs）
- 不做 Readability 级阅读模式（只做 CSS 简陋化，phase 12 再真正抽取）

## Decisions

### D1: WebContentsView 布局与生命周期

- 每个 tab 一个 `WebContentsView`；父窗口（BrowserWindow）持有 `contentView`（根 View）
- Renderer 层渲染常规 React DOM（TabBar / AddressBar），留出一个**内容区占位 div**（`id="browser-viewport"`）
- main 监听来自 renderer 的 `browser.setViewport({ x, y, width, height })` 事件（renderer 在占位 div 上 `ResizeObserver`），把 bounds 同步到当前激活的 WebContentsView
- 切 tab：`contentView.removeChildView(prev)` + `contentView.addChildView(next)` + `setBounds`

**理由**：WebContentsView 是 native 层；renderer 的 React DOM 在它之上"描画 UI"，底下是 native view；需要显式同步坐标。

### D2: Tab 进程/内存策略

- 每个 WebContentsView 内核是 Chromium render process；默认独立 site isolation
- 限制：同时 alive tab ≤ 20；超过时按 LRU 把最久未访问的 tab "suspend"（destroy WebContents，保留 tab 元数据 { url, title, favicon }）
- 切回被 suspend 的 tab：懒加载重新创建 WebContentsView + `loadURL(savedUrl)`

**理由**：10+ tab 的内存压力（600MB+）对桌面应用可接受，但 50 个就崩；LRU suspension 是常见模式。

### D3: 地址栏语义

- 输入非 URL（如 "attention mechanism"）→ 拼 Google 搜索 `https://www.google.com/search?q=<q>`（或用户可选 Bing/DuckDuckGo，预埋设置项，本阶段硬编码 Google）
- 输入 URL（`xxx.com` 或 `https://...`）：
  - 含 `://`：直接 load
  - 不含：补 `https://`；若失败（DNS 错）fallback `http://`
- 粘贴剪贴板含 http(s) 时，AddressBar 下方出现"粘贴并打开 <url>"快捷按钮

### D4: 外链策略

`webContents.setWindowOpenHandler(details => ...)`：

- 同源 / http(s) → `{ action: 'allow' }` + renderer 观察到后追加新 tab（`setWindowOpenHandler` 返回 `action:'allow'` 会自动 attach 到我们的父 view）
- 非 http(s)（`mailto:`、`tel:`、应用自定义 scheme）→ `{ action: 'deny' }` + main 侧 `shell.openExternal(url)`

tab 内链接（`<a href="...">`）通过 `webContents.on('will-navigate')`：同页 / 同域走默认；**不**自动新 tab（符合浏览器通行行为）。

### D5: 广告 / 追踪拦截

- 打包 `public/hosts/block-domains.txt`（Steven Black unified hosts 子集，去除过长条目）
- 启动时加载成 `Set<string>`
- `session.webRequest.onBeforeRequest` 回调：`new URL(details.url).hostname` 命中 set → `callback({ cancel: true })`
- 设置项：`settings.blockAds: boolean`（phase 13 实装；本阶段默认开启，硬编码）
- **注意**：Google Analytics 等也会被拦，用户体验可能有部分站点异常；接受

### D6: 阅读模式（最小版）

本阶段的 "reader mode" 只是**注入一段 CSS** 到 WebContents：

```css
body {
  max-width: 720px !important;
  margin: 0 auto !important;
  font-family: Georgia, serif;
  font-size: 18px;
  line-height: 1.7;
  color: #222;
}
header,
nav,
footer,
aside,
[class*='sidebar'],
[class*='banner'],
[class*='ad'] {
  display: none !important;
}
img {
  max-width: 100% !important;
  height: auto !important;
}
```

切换按钮：tab 级状态 `readerMode: boolean`；开启时 `webContents.insertCSS(css)` 拿 key，关闭时 `removeInsertedCSS(key)`。

**理由**：占位级效果；phase 12 会接 Readability 做真正的文章抽取。

### D7: Bookmarks schema

migration 004：

```sql
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  favicon TEXT,           -- data URL 或 URL
  tags_json TEXT,         -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_url ON bookmarks(url);
```

去重：`UNIQUE(url)`；再次"加入书签"已存在的 URL → 提示"已在书签中" + 打开编辑弹窗。

### D8: Bookmarks UI

- 位置：`/browse` 左侧折叠侧栏（默认收起，200px 宽展开）
- 顶部 "+" 按钮：抓当前 tab 的 URL/title/favicon 新建书签，弹表单（tags 可填，复用 tag 自动补全——phase 8 jieba 无关）
- 列表：虚拟化；行显示 title / url 域名 / tags chips / created_at
- 点击：在当前 tab 打开（**不**新建 tab；Cmd+Click 在新 tab 打开）
- 右键：编辑 / 删除
- 搜索 / tag 过滤：顶部 input

### D9: Session 与隐私

- Session 用默认 persistent session（登录态保留）；名称 `browser:default`
- 不与 App 主窗口共享 session（默认 Electron BrowserWindow 的 session 也是 default，这里显式用同一个？→ **是**，代理、Cookie 可共享）
  - Cookie：用户登录 A 网站后，在 Acornvo 内的 /browse 也已登录
  - **Trade-off**：隐私上有点模糊；但 Acornvo 整个是"用户自己的"应用，共享 session 合理
- 清除 cookies 入口：phase 13 设置页预埋

### D10: 坐标同步 + React 布局

TabBar 60px 高 + AddressBar 40px 高 + Bookmarks 侧栏 0/200px；renderer 把剩余矩形通过 `browser.setViewport({ x, y, w, h })` 告诉 main；main 给当前 WebContentsView `setBounds`。

优化：`ResizeObserver` debounce 16ms，避免窗口拉伸时发 IPC 过密。

### D11: 导航状态

`webContents` 事件：

- `did-start-loading` / `did-stop-loading` → tab.loading
- `page-title-updated` → tab.title
- `page-favicon-updated` → tab.favicon（取首个）
- `did-navigate` / `did-navigate-in-page` → tab.url / tab.canGoBack / canGoForward

事件在 main 监听后 IPC 推 renderer（`browser.tabStateChanged({ tabId, ...patch })`）。

## Risks / Trade-offs

- [WebContentsView 内存] → LRU suspend + 用户可手动关 tab
- [广告列表体积 + 假阳性] → 设置页可关；子集 list 控制在 ~100KB
- [session 共享 Acornvo 主窗口] → 隐私需说明；但对"本地工具"可接受
- [`page-favicon-updated` 的 URL 需下载] → 直接用 URL；不转 data URL（SQLite 只存 URL 引用；失效 URL 渲染空）
- [reader mode 对 SPA 不稳] → 占位方案；phase 12 用 Readability 抽取替换
- [macOS 下 WebContentsView 的 traffic light 按钮遮挡] → 父窗口 frame 已 custom；注意顶部留白

## Migration Plan

- migration 004 建 bookmarks 表
- phase 2 的 `.acornvo/` 不需新目录
- 回滚：删 migration 004；移除 `/browse` 路由；AppRail 隐藏拾果入口

## Open Questions

- Bookmarks tags 是否与 `tags` 表（phase 5 md 用）合并？**否**，语义不同（书签 tag 与文件 tag 分治），避免 usage_count 意义混乱
- 是否需要书签导入 HTML（Chrome 导出格式）？**留 backlog**
- 剪藏入口放 AddressBar 右侧 "剪藏" 按钮还是独立 `Cmd+Shift+S`？**AddressBar + 快捷键双路**，phase 12 实装按钮行为
