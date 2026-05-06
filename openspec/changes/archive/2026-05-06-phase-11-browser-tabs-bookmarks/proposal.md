## Why

PRD 的"拾果"模块把**阅读** + **剪藏**合为一个整体入口。要让剪藏（phase 12）有意义，必须先有一个应用内浏览器：tab 条、地址栏、书签、阅读模式切换、外链处理。本阶段只做"壳"——能打开网页、在 tab 间切换、收藏网页地址——还**不**做实际的 md 生成（留 phase 12）。选择 Electron 的 `WebContentsView` 而非 `<webview>` 标签或 `<iframe>`，是因为 `WebContentsView` 是主进程托管的视图，能用完整的 `session` 与 `webContents` API（加载拦截器、User-Agent、扩展能力），为 phase 12 的拾果过程做铺垫。

## What Changes

- 新增 `/browse` 路由：TabBar 顶部 + WebContentsView 主体 + AddressBar
- `WebContentsView` 集成：每个 tab 一个 `WebContentsView`；父窗口 `contentView.addChildView` 动态 attach/detach；尺寸跟随窗口自适应
- 标签页 store（renderer）：tabId / url / title / favicon / loading / canGoBack / canGoForward
- 地址栏：URL 输入 → 导航；粘贴网址（剪贴板识别）提供 "直接打开"
- 外链策略：tab 内链接在同 tab 打开；`target=_blank` / `window.open` 打开新 tab；`http(s)://` 外的协议 (`mailto:` / `tel:` / 自定义) → 调 `shell.openExternal` 交给系统
- 书签存储：sqlite `bookmarks(id, url, title, favicon, tags_json, created_at, updated_at)` + migration 004；主界面侧栏提供书签入口
- 阅读模式按钮（预埋）：`toggle reader mode`——本阶段仅**切换一个内置 CSS 注入**让网页更易读；真正的 Readability 抽取在 phase 12
- 拦截：默认 blocking 广告域名列表（Steven Black hosts 子集，embedded）；可在设置关闭
- 导航历史：本阶段不持久化"浏览历史"（只保留 WebContents 原生前进后退）
- TitleBar + AppRail：AppRail 新增"拾果"入口（`/browse`）；"理果"(phase 15) 和 "松语"(phase 17) 先占位

## Capabilities

### New Capabilities
- `browser-shell`: `/browse` 路由、TabBar、AddressBar、WebContentsView 生命周期
- `browser-tabs`: 多 tab 管理（create / close / switch / reorder / history）
- `browser-navigation`: 导航拦截、外链策略、广告域名拦截、reader-mode 切换
- `bookmarks-store`: `bookmarks` 表 + migration 004 + `bookmarks.list/create/update/delete` IPC
- `bookmarks-ui`: 书签侧栏 / "加入书签"按钮 / 搜索与标签过滤

### Modified Capabilities
- `app-shell`: AppRail 正式加入"拾果"tab；主布局新增 `/browse` 路由并兼容 WebContentsView 的子视图定位

## Impact

- 依赖：无新 npm（Electron 自带 WebContentsView）；广告列表打包为 `public/hosts/block-domains.txt`（约 100KB）
- main：
  - `electron/browser/contents.ts`（WebContents 工厂 + 拦截器）
  - `electron/browser/bounds.ts`（尺寸同步：父窗口 resize 时更新所有 WebContentsView 的 bounds）
  - `electron/ipc/browser.ts`（tabs / bookmarks）
- renderer：`src/pages/Browse.tsx`、`src/components/browser/{TabBar,AddressBar,ReaderToggle,BookmarkSidebar}.tsx`、`src/stores/browser.ts`
- migration 004：`bookmarks` 表 + `user_version=4`
- 安全：`WebContentsView` 默认 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`；preload 为空（不暴露 window.api）
- 风险：WebContentsView 在多 tab 时占内存（每个 tab ~60MB Chromium 进程）；限制同时 alive tab ≤ 20，超过者切换 tab 时 suspend（`destroy()` WebContents，切回时 reload URL）
- 体积：`hosts` 文件增加 ~100KB 打包
