## ADDED Requirements

### Requirement: 剪藏触发入口

`/browser` 路由 SHALL 提供剪藏触发的两条路径：

1. AddressBar 右侧的剪刀按钮（原 phase 11 "即将在拾果阶段实装" toast 占位）
2. `Cmd/Ctrl+Shift+S` 快捷键

两者 MUST 调用同一 `clipper.clip(activeTabId)` IPC 入口，进入 clipper-pipeline。按钮的 disabled / 已剪藏 / spinner 状态由 clipper-ui 规格定义。

#### Scenario: 按钮触发

- **WHEN** 用户在 `/browser` 点击剪刀按钮
- **THEN** 调用 `clipper.clip(activeTabId)`；pipeline 进入 extracting 状态

#### Scenario: 快捷键触发

- **WHEN** `/browser` 路由聚焦时按 `Cmd/Ctrl+Shift+S`
- **THEN** 效果等同按钮触发，进入 pipeline

#### Scenario: 替代 phase 11 toast

- **WHEN** 用户点击剪藏按钮（phase 12 已交付）
- **THEN** 不再出现 phase 11 占位 toast "即将在拾果阶段实装"；弹出 ClipPreviewDialog 或对应错误态

### Requirement: 已剪藏指示

AddressBar 的剪刀按钮 SHALL 根据当前激活 tab 的 URL 是否已存在于 `clips` 表显示不同样式：

- 未剪藏 → 空心图标
- 已剪藏 → 实心图标 + 右下角小对勾

状态 MUST 随 tab 切换与当前 tab 导航事件实时更新（`did-navigate` / `did-navigate-in-page` 触发重查 `clips.getByUrl`）。

#### Scenario: 跳到已剪藏页面

- **WHEN** 用户在 tab 中从 `example.com/a` 导航到已剪藏的 `example.com/b`
- **THEN** 按钮在 `did-navigate` 后 200ms 内变为实心 + 对勾

#### Scenario: 切换到未剪藏 tab

- **WHEN** 激活另一个未剪藏 URL 的 tab
- **THEN** 按钮变为空心

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
