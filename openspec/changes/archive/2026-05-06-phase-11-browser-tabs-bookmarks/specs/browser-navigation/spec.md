## ADDED Requirements

### Requirement: 外链策略
系统 SHALL 在每个 WebContentsView 注册 `setWindowOpenHandler`：
- 协议为 `http` / `https` 的目标 URL → `{ action: 'allow', overrideBrowserWindowOptions: { ... } }`；main 侧监听新建的 WebContents → 把它包成新 tab 并 attach
- 其他协议（`mailto:`/`tel:`/自定义）→ `{ action: 'deny' }`；同时 main 调 `shell.openExternal(url)`

同 tab 的 `will-navigate`（点击 `<a href>` 无 target）不拦截；浏览器默认同 tab 跳转。

#### Scenario: target=_blank 新 tab
- **WHEN** 当前页用户点 `<a href="https://x.com" target="_blank">`
- **THEN** 新 tab 被创建并 loadURL x.com；新 tab 激活

#### Scenario: mailto 跳外部
- **WHEN** 页面链接 `mailto:someone@ex.com` 被点
- **THEN** 浏览器内无新 tab；`shell.openExternal` 把 URL 交给系统邮件客户端

#### Scenario: 同 tab 链接
- **WHEN** 普通 `<a href="https://x.com">` 被点
- **THEN** 当前 tab loadURL x.com；不开新 tab

### Requirement: 广告 / 追踪域名拦截
系统 SHALL 加载 `public/hosts/block-domains.txt` 到内存 Set；`session.webRequest.onBeforeRequest` 回调中若 `new URL(details.url).hostname` 命中 MUST `callback({ cancel: true })`。拦截生效时 MUST 记录日志的计数（仅 aggregate count，不记 URL）。

#### Scenario: 拦截
- **WHEN** 页面请求 `https://googletagmanager.com/gtm.js`（命中列表）
- **THEN** 请求被 cancel；页面仍正常渲染（只是少了 tracking）

#### Scenario: 非命中放行
- **WHEN** 页面请求 `https://example.com/normal.js`
- **THEN** 请求正常发出

### Requirement: Reader Mode 最小实现
每个 tab SHALL 有 `readerMode: boolean` 状态；切换时：
- 开启：`webContents.insertCSS(READER_CSS)` 得到 key，保存到 `tab.readerCssKey`
- 关闭：`webContents.removeInsertedCSS(readerCssKey)`

`READER_CSS` MUST 限制正文宽度 720px、增大行高、隐藏常见 `header/nav/footer/aside/[class*="sidebar"]` 等元素。导航到新 URL 时 tab.readerMode MUST 重置为 false（避免跨页脏状态）。

#### Scenario: 开启阅读模式
- **WHEN** 用户点 AddressBar 的 reader toggle（当前 readerMode=false）
- **THEN** insertCSS 执行；页面排版变简洁；tab.readerMode=true

#### Scenario: 跳新页重置
- **WHEN** tab 从 `A` 导航到 `B`
- **THEN** tab.readerMode 自动回 false；若此前 insertCSS 已加入，removeInsertedCSS 被调

### Requirement: 前进/后退/刷新
AddressBar SHALL 提供前进/后退/刷新按钮；前进/后退 disabled 跟随 `webContents.canGoBack/canGoForward`。`Cmd/Ctrl+[` 后退，`Cmd/Ctrl+]` 前进，`Cmd/Ctrl+R` 刷新。

#### Scenario: 后退
- **WHEN** tab 已有导航历史，用户点"后退"
- **THEN** `webContents.goBack()`；tab.url 更新为历史上一项

#### Scenario: 无历史时 disabled
- **WHEN** tab 首次加载完仅一页
- **THEN** 后退按钮 disabled；前进亦 disabled
