## ADDED Requirements

### Requirement: electron-updater 封装
`electron/update/updater.ts` SHALL 封装 `electron-updater` 的 `autoUpdater`：
- 导出 `initAutoUpdate()`：app ready 后 60s 首次检查；此后每 4 小时一次（若 `settings.update.autoCheck === true`）
- 导出 `checkForUpdatesManual()`：手动触发检查；在 `/settings/about` 使用
- 事件桥接到主窗口：`update-available` / `download-progress` / `update-downloaded` / `error`
- 错误 MUST 只走 `logger.error('update', ...)` 静默记；不打扰用户

#### Scenario: 自启检查
- **WHEN** 应用启动 60s 且 autoCheck=true
- **THEN** 调用 autoUpdater.checkForUpdates()；logger.info('update', { op:'check' })

#### Scenario: 关闭 autoCheck
- **WHEN** `settings.update.autoCheck === false`
- **THEN** 初始化不设置周期检查；手动检查仍可用

### Requirement: 更新源
`electron-builder.yml` 的 `publish` 段 SHALL 使用 `provider: generic` + url 占位；运行时 autoUpdater 自动读取嵌入的 publish 配置。更新包必须含 `latest-mac.yml` / `latest.yml` 等元数据。

#### Scenario: 从 generic 源拉
- **WHEN** autoUpdater 触发检查
- **THEN** HTTP GET `${url}/latest-mac.yml`（或对应平台）；对比 version 决定是否有新版

### Requirement: 更新通知与安装
有新版本下载完成后 UI SHALL 在主窗口下方显示非阻塞 banner："有新版本 <vX.Y.Z>，[立即安装] [稍后]"：
- "立即安装" → `autoUpdater.quitAndInstall()`
- "稍后" → 关闭 banner；下次启动仍会检查

下载中 MUST 不显示 banner；仅在 download-progress 事件下更新内部 state（不打扰用户）。

#### Scenario: 下载完成
- **WHEN** update-downloaded 事件触发
- **THEN** 主窗口显示 banner 带版本号与两按钮

#### Scenario: 立即安装
- **WHEN** 用户点 "立即安装"
- **THEN** 调用 quitAndInstall；app 退出；下次启动已升级

### Requirement: 手动检查与 UI 反馈
`/settings/about` "检查更新" 按钮 SHALL 在点击时调 `checkForUpdatesManual` 并显示状态：
- 检查中：按钮置 loading
- 已是最新：显示 "已是最新版本 vX.Y.Z"
- 有新版本：显示 "发现新版本 vX.Y.Z，正在下载..."
- 错误：显示 "检查失败：<message>"；logger.error 同时记录

#### Scenario: 已是最新
- **WHEN** 手动检查时版本等于最新
- **THEN** 按钮区显示 "已是最新版本" 绿色文本

#### Scenario: 检查失败
- **WHEN** 网络断开手动检查
- **THEN** 按钮区显示红色 "检查失败：network"；logger 记 error
