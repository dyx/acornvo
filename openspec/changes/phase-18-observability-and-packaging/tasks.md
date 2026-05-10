## 1. 数据库与依赖

- [x] 1.1 `migrations/010_perf_samples.sql`：建 perf_samples + telemetry_local + 补 ops_log 索引；`user_version=10`
- [x] 1.2 `package.json`：新增依赖 `electron-builder`、`electron-updater`、可选 `electron-log`、`license-checker`

## 2. Logger

- [x] 2.1 `electron/obs/logger.ts`：JSON Lines 输出；按平台目录；按天文件名；10MB 分片
- [x] 2.2 启动 rotate：7 天 + 50MB → 40MB 两阶段裁剪
- [x] 2.3 关键 area 替换 console：indexer / clipper / ai / agent / app / queue / update（逐文件迁移）
- [x] 2.4 开发构建镜像到 stdout；生产仅写文件

## 3. Perf 采样

- [x] 3.1 `electron/obs/perf.ts`：`start(area, meta) → end({ok,meta})`；写 perf_samples
- [x] 3.2 key path 埋点：project.open / indexer.scan / indexer.update / clipper.save / clipper.ai-review / agent.step / search.query
- [x] 3.3 滚动清理：启动时 > 100000 行 → 删到 80000
- [x] 3.4 `getAggregates(area, window)` 实现 P50 / P95 / successRate / count

## 4. Crash Reporter

- [x] 4.1 `electron/obs/crashReporter.ts`：`app.on('render-process-gone')` / `process.uncaughtException` / `unhandledRejection` → 写 crashes/ 日志
- [x] 4.2 调 `crashReporter.start({ uploadToServer:false })`；minidumps 落到 crashes/minidumps/
- [x] 4.3 `checkLastRun()` 扫描未 ack；`ack(file)` 移到 crashes/acked/
- [x] 4.4 acked 超 30 天自动删

## 5. Diagnostic bundle

- [x] 5.1 `electron/obs/diagnostic.ts`：`exportDiagnosticBundle()` 生成 zip
- [x] 5.2 内容：7 天 log + crashes/\*.log + about.json + env.json
- [x] 5.3 API key 正则扫描替换 `[REDACTED:api-key]`（zip 内副本；原文件保留）
- [x] 5.4 输出到 Downloads/Acornvo-Diagnostics-YYYYMMDD-HHMMSS.zip + `shell.showItemInFolder`

## 6. Observability 页面

- [x] 6.1 `src/pages/settings/Observability.tsx`：tab 布局（AI / 队列 / 性能）+ 底部导出按钮
- [x] 6.2 AI 使用卡：24h/7d/30d 切换；数字卡片；profile 横条；工具聚合；日期折线
- [x] 6.3 队列卡：pending/running/failed 计数；最近 20 条失败 + 重试/丢弃；最近 20 条 ops_log；5s 轮询
- [x] 6.4 性能卡：每 area 的 P50/P95/成功率；阈值红色标注
- [x] 6.5 settings 侧边新增 "可观测" tab；路由 /settings/observability

## 7. About 页面

- [x] 7.1 Vite define 注入 `__GIT_HASH__`；开发 build 显示 "dev"
- [x] 7.2 `src/pages/settings/About.tsx`：版本 / git hash / 运行时 / 平台架构
- [x] 7.3 依赖清单：构建前跑 `license-checker` 生成 `build/licenses.json`；about 页面读取显示前 20 条 + 完整清单展开
- [x] 7.4 "检查更新" 按钮 → 对接 auto-update 手动触发
- [x] 7.5 官网链接 → `shell.openExternal`
- [x] 7.6 settings 侧边新增 "关于" tab；路由 /settings/about

## 8. Auto Update

- [x] 8.1 `electron/update/updater.ts`：`initAutoUpdate()` 启动 60s + 每 4h；`checkForUpdatesManual()`
- [x] 8.2 事件桥接到主窗口：available / download-progress / downloaded / error
- [x] 8.3 downloaded 后显示 banner（"有新版本 vX.Y.Z" + 立即安装 / 稍后）；quitAndInstall
- [x] 8.4 `settings.update.autoCheck` 开关持久；默认 true
- [x] 8.5 错误静默 logger.error；不打扰用户

## 9. Telemetry

- [x] 9.1 settings 新增 `telemetry.enabled` 默认 false
- [x] 9.2 telemetry_local 表（migration 010 已建）
- [x] 9.3 每日 00:10 聚合 job（kind='telemetry-aggregate'）复用 phase 14 队列；写昨日行
- [x] 9.4 observability 页面底部 "本地遥测" 开关 + 说明文案
- [x] 9.5 关闭开关停止新增聚合；历史数据保留

## 10. Packaging

- [x] 10.1 `electron-builder.yml`：appId / productName / files / mac (dmg x64+arm64) / win (nsis) / linux (AppImage) / publish generic
- [x] 10.2 `build/` 资源：icon.icns / icon.ico / icon.png / entitlements.mac.plist
- [x] 10.3 npm scripts：dist:mac / dist:win / dist:linux / dist:all / notarize:mac / generate:licenses
- [x] 10.4 `.github/workflows/release.yml`：tag push 触发；三平台矩阵；secrets 引用；上传 Release artifacts
- [x] 10.5 README "Install / Update / Troubleshoot" 段 + 签名证书获取指引

## 11. App shell 接线

- [x] 11.1 主进程 app ready → `initAutoUpdate()`（若 settings.autoCheck）
- [x] 11.2 主窗口 ready-to-show → `crashReporter.checkLastRun()` → 若非空 IPC 通知渲染器显示 banner
- [x] 11.3 渲染器 banner 组件：三按钮（查看日志 / 导出诊断包 / 忽略）
- [x] 11.4 生产构建：`webContents.on('devtools-opened')` 立即 close + 记日志

## 12. i18n

- [x] 12.1 `obs.*` / `about.*` / `crash.*` / `update.*` / `telemetry.*` keys
- [x] 12.2 zh-CN + en 同步

## 13. 验收

- [ ] 13.1 启动应用 → ~/Library/Logs/Acornvo/ 下出现当天日志文件；首条是启动 info
- [ ] 13.2 触发剪藏 / 搜索 / agent 调用 → 对应 area 出现 JSON Lines 条目；字段完整
- [ ] 13.3 写 55MB 历史日志启动 → rotate 清理到 ≤ 40MB；7 天前文件被删
- [ ] 13.4 键入搜索 → perf_samples 新增 area='search.query' 行；observability 性能卡显示 P50/P95
- [ ] 13.5 模拟 renderer crash → crashes/renderer-\*.log 生成；下次启动显示 banner；"忽略" 后移到 acked/
- [ ] 13.6 点 "导出诊断包" → Downloads 下 zip 生成；打开 Finder/Explorer；zip 内日志中 `sk-xxxx` 被替换为 REDACTED
- [ ] 13.7 /settings/observability AI tab：显示总 token / 按 profile 横条 / 按工具调用次数
- [ ] 13.8 /settings/observability 队列 tab：失败 job 可重试 → pending → runner 消费
- [ ] 13.9 /settings/about：版本 / git hash / electron/chrome/node 正确；许可证前 20 条 + 完整展开
- [ ] 13.10 手动 "检查更新"：离线 → 红色 "检查失败"；在线无新版 → 绿色 "已是最新"
- [ ] 13.11 `npm run dist:mac` → dist/ 下两个 dmg（x64 / arm64）
- [ ] 13.12 mac dmg 双击安装 → app 启动；Gatekeeper 不报未知开发者（已签名 + 公证前提下）
- [ ] 13.13 `npm run dist:win` → dist/ 下 nsis exe；安装后桌面快捷方式 + 开始菜单条目
- [ ] 13.14 `npm run dist:linux` → dist/ 下 AppImage；chmod +x 后可运行
- [ ] 13.15 push tag v0.1.0 → GitHub Actions release workflow 成功；Release 页面附 dmg/exe/AppImage + latest-mac.yml
- [ ] 13.16 telemetry 开关默认 off；开启后次日（或手动触发）telemetry_local 新增昨日行；数字匹配 ai_usage / clips / perf_samples 聚合
- [ ] 13.17 生产构建 devtools 被禁用；开发构建可开
- [ ] 13.18 `openspec validate phase-18-observability-and-packaging --strict` 通过
