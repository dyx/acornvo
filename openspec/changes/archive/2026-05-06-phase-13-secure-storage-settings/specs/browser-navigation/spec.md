## MODIFIED Requirements

### Requirement: 广告 / 追踪域名拦截
系统 SHALL 加载 `public/hosts/block-domains.txt` 到内存 Set。`session.webRequest.onBeforeRequest` 监听 MUST 受 `settings.browser.blockAds` 控制：
- 首次启动时读一次 `settings.get('browser').blockAds`（默认 true）
- 值为 true → 注册 onBeforeRequest，hostname 命中列表的请求 `callback({ cancel: true })`
- 值为 false → 移除 onBeforeRequest 监听
- 订阅 `settings.onChange` 中 `ns='browser' && key='blockAds'` 的事件 → 切换注册/移除

拦截生效时 MUST 记录日志的计数（仅 aggregate count，不记 URL）。

#### Scenario: 拦截
- **WHEN** `settings.browser.blockAds === true`，页面请求 `https://googletagmanager.com/gtm.js`（命中列表）
- **THEN** 请求被 cancel；页面仍正常渲染

#### Scenario: 非命中放行
- **WHEN** `blockAds === true`，页面请求 `https://example.com/normal.js`
- **THEN** 请求正常发出

#### Scenario: 关闭广告拦截热更新
- **WHEN** 用户在 /settings/browser 把 blockAds toggle 切到 false
- **THEN** main 移除 onBeforeRequest 监听；之后所有请求放行（包括本列表命中的）

#### Scenario: 重新打开热更新
- **WHEN** 用户再次把 blockAds toggle 切到 true
- **THEN** main 重新注册 onBeforeRequest；新请求被过滤
