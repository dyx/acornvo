## 1. 依赖与 schema

- [ ] 1.1 `migrations/004_bookmarks.sql`：建表 + 索引 + `user_version=4`
- [ ] 1.2 `shared/browser-types.ts`：`Tab` / `Bookmark` / `SetViewportArgs`
- [ ] 1.3 `public/hosts/block-domains.txt`：精简 Steven Black hosts 子集（打包时 copy）
- [ ] 1.4 目录：`src/pages/Browse.tsx`、`src/components/browser/*`、`src/stores/browser.ts`、`electron/browser/*`、`electron/ipc/browser.ts`、`electron/ipc/bookmarks.ts`

## 2. main 侧 WebContentsView 框架

- [ ] 2.1 `electron/browser/contents.ts`：`createTabView({ url, sessionPartition })` 返回 `{ view, webContents }`；webPreferences 为 sandbox/contextIsolation/noIntegration
- [ ] 2.2 `electron/browser/manager.ts`：`Map<tabId, { view, webContents }>`；`attach(tabId)` / `detach(tabId)` / `destroy(tabId)`
- [ ] 2.3 `electron/browser/bounds.ts`：接收 `browser.setViewport`，更新当前 attached view 的 `setBounds`
- [ ] 2.4 `webContents` 事件订阅：did-start/stop-loading / page-title-updated / page-favicon-updated / did-navigate[-in-page] → 推 renderer `browser.tabStateChanged`
- [ ] 2.5 `setWindowOpenHandler`：按 D4 规则允许 / 拒绝；允许时 main 自动创建新 tab 并 `webContents.on('did-create-window')` 接管
- [ ] 2.6 `onBeforeRequest` 拦截：加载 block-domains.txt → Set → hostname 命中 cancel；每次 session 计数 log

## 3. 广告列表与 session

- [ ] 3.1 `session.fromPartition('persist:browser-default')`
- [ ] 3.2 启动时加载 hosts 文件解析为 Set<string>
- [ ] 3.3 默认开启；log 拦截计数（每小时输出一次聚合）

## 4. Tabs store（src/stores/browser.ts）

- [ ] 4.1 state: `tabs[]` / `activeTabId` / `bookmarksOpen`
- [ ] 4.2 actions：`createTab(url?)` / `closeTab(id)` / `activateTab(id)` / `reorderTab` / `setReaderMode(id, on)` / `navigate(id, url)` / `setViewport(rect)`
- [ ] 4.3 订阅 `browser.tabStateChanged` → patch 对应 tab
- [ ] 4.4 LRU suspend：active 改变时若 alive > 20 调 `browser.suspendTab(id)` IPC → main destroy WebContents
- [ ] 4.5 切回 suspended tab：`browser.resumeTab(id)` → main 重新创建 view + loadURL(savedUrl)

## 5. IPC（main）

- [ ] 5.1 `shared/ipc-contract.ts` 追加 `browser` 命名空间：`createTab` / `closeTab` / `activateTab` / `navigate` / `reload` / `goBack` / `goForward` / `setReaderMode` / `setViewport` / `suspendTab` / `resumeTab`
- [ ] 5.2 `bookmarks` 命名空间：`list` / `create` / `update` / `delete` / `getByUrl`
- [ ] 5.3 `electron/ipc/browser.ts`：调 manager / bounds
- [ ] 5.4 `electron/ipc/bookmarks.ts`：SQLite CRUD + prepared statements；create 的 UNIQUE 冲突返回 `E_DUPLICATE + existingId`

## 6. Browse 页面与组件

- [ ] 6.1 `src/pages/Browse.tsx`：根组件，挂载 TabBar + AddressBar + BookmarkSidebar + 内容区占位 div
- [ ] 6.2 `#browser-viewport` div 用 `ResizeObserver` debounce 16ms → 调 `browser.setViewport`
- [ ] 6.3 `TabBar.tsx`：水平 tab，favicon / 标题 / 关闭按钮；拖拽重排（react-dnd 或纯 pointer events）
- [ ] 6.4 `AddressBar.tsx`：
  - [ ] 6.4.1 输入框 + 回车 → 按 D3 规则 `browser.navigate`
  - [ ] 6.4.2 前进/后退/刷新按钮
  - [ ] 6.4.3 Reader toggle
  - [ ] 6.4.4 书签星图标（根据 `bookmarks.getByUrl(tab.url)` 实心/空心）
  - [ ] 6.4.5 剪藏按钮占位（onClick → toast "即将在拾果阶段实装"）
  - [ ] 6.4.6 粘贴快捷按钮
- [ ] 6.5 `BookmarkSidebar.tsx`：
  - [ ] 6.5.1 折叠/展开；toggle 触发 setViewport
  - [ ] 6.5.2 搜索输入 debounce 200ms
  - [ ] 6.5.3 tag chips（从 `bookmarks.list` 数据 union tags）
  - [ ] 6.5.4 虚拟化列表；行点击 navigate 当前 tab；Cmd+Click 新 tab
  - [ ] 6.5.5 右键菜单：打开 / 新 tab 打开 / 编辑 / 删除
- [ ] 6.6 `BookmarkDialog.tsx`：新建/编辑 modal；tags 逗号分隔输入
- [ ] 6.7 空白 tab 页（`about:blank` 或 `acorn://new-tab`）：简单欢迎 + 常用书签（最近 6 条）

## 7. 快捷键

- [ ] 7.1 `Cmd/Ctrl+T` 新建 tab；`Cmd/Ctrl+W` 关当前 tab
- [ ] 7.2 `Cmd/Ctrl+Tab` / `Cmd/Ctrl+Shift+Tab` 切换 tab
- [ ] 7.3 `Cmd/Ctrl+1..9` 跳 tab N
- [ ] 7.4 `Cmd/Ctrl+L` 聚焦 AddressBar 全选
- [ ] 7.5 `Cmd/Ctrl+[` 后退 / `Cmd/Ctrl+]` 前进 / `Cmd/Ctrl+R` 刷新
- [ ] 7.6 `Cmd/Ctrl+D` 加入书签

## 8. App-shell 接线（app-shell MODIFIED）

- [ ] 8.1 AppRail 从占位改为实 item：果仓 / 拾果 / 松语（松语 disabled）
- [ ] 8.2 `/browser` 路由指向 `Browse` 页（替换占位）
- [ ] 8.3 `外部链接拦截` 的 will-navigate 限制确认**只**作用于主 BrowserWindow 的 webContents（WebContentsView 有独立 webContents）

## 9. i18n

- [ ] 9.1 `browser.new_tab` / `browser.search` / `browser.reader` / `browser.reader_on` / `browser.bookmark.save` / `browser.bookmark.saved` / `browser.bookmark.edit` / `browser.bookmark.delete` / `browser.bookmark.empty` / `browser.paste_open` / `browser.clip_soon`

## 10. 验收

- [ ] 10.1 AppRail 点"拾果" → `/browser` 渲染 TabBar + AddressBar + 空白 tab
- [ ] 10.2 AddressBar 输入 `example.com` 回车 → 补 https 并加载
- [ ] 10.3 AddressBar 输入 `注意力机制` 回车 → 打开 Google 搜索结果页
- [ ] 10.4 `Cmd+T` 新建 tab；页面切换顺畅；`Cmd+W` 关闭最后一个 tab → 变为新空白 tab
- [ ] 10.5 某页 `<a target="_blank">` → 新 tab 并激活
- [ ] 10.6 某页 `mailto:` → `shell.openExternal` 打开系统邮件；浏览器内无新 tab
- [ ] 10.7 广告拦截：打开含 googletagmanager 请求的页面 → 日志显示拦截；页面正常
- [ ] 10.8 reader toggle：开启后页面排版变窄居中、header/nav 隐藏；切 URL 自动关闭
- [ ] 10.9 `Cmd+D` 加入书签：成功后按钮变实心；Bookmarks 侧栏列表新增
- [ ] 10.10 重复 URL 再加 → 弹编辑 modal；不产生 duplicate 行
- [ ] 10.11 `bookmarks.list({ q: 'news' })` 命中 title/url 包含 news 的行
- [ ] 10.12 `bookmarks.list({ tag: 'ai' })` 命中 tags 含 ai 的行
- [ ] 10.13 LRU：开 22 个 tab → 最久未用的被 suspend；切回触发 reload；展示内容正常
- [ ] 10.14 窗口 resize → WebContentsView 自适应；debounce 不引发明显 jank
- [ ] 10.15 主 renderer 窗口点击非路由外链 → `shell.openExternal`（phase 1 行为不变）
- [ ] 10.16 WebContentsView 内的跨站导航 → 正常进行（不被 phase 1 的外链拦截影响）
- [ ] 10.17 `openspec validate phase-11-browser-tabs-bookmarks --strict` 通过
