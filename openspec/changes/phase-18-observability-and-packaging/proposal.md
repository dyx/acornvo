## Why

前 17 个 phase 覆盖了功能面；但 PRD N-1 / N-2 / N-5 要求产品可**运维、可调优、可发布**：
- 用户端要能查看 AI 开销（累计 token + 费用）、剪藏 / 索引 / 队列的运行健康度，以及排查失败原因；
- 工程侧要有一致的结构化日志与性能采样，才能在用户汇报问题时定位根因；
- 产品侧要能一键打包、签名、自动更新，否则无法真正交付桌面应用。

phase 18 把这些"产品化最后一公里"事情合到一起，作为整个 18 phase 路线的收尾。

## What Changes

- `/settings/observability` 新页面：AI usage 聚合视图（按 profile / 按日 / 按工具）、队列健康表、ops_log 最近 200 条流水、最近失败剪藏/笔记列表
- 结构化日志 `electron/obs/logger.ts`：统一 `logger.info / warn / error` 写 `~/Library/Logs/Acornvo/app-YYYY-MM-DD.log`（rotate 7 天 / 总量 50MB 上限）；字段：`ts, level, area, op, ok, ms, meta`
- 性能采样 `electron/obs/perf.ts`：对 key path（打开项目 / 搜索 / 生成 summary / agent loop 单步）埋点写 `perf_samples` 表；settings 页显示 P50/P95
- 崩溃上报：Electron `app.on('render-process-gone')` / 未捕获异常 → 写 `crash.log` 本地文件 + 下一次启动弹提示"发现上次崩溃，查看日志"，不向外发送
- Telemetry 开关：`settings.telemetry.enabled`（默认 off）；若用户开启，**仅**上报脱敏 usage 计数到本地 SQLite（保留 anonymized 通道，不做外发，phase 19+ 再做云）
- **打包**：`electron-builder` 配置：macOS `.dmg` + Windows `.exe` + Linux `.AppImage`；签名（mac 需 developer id / win 需 cert）；`CI: GitHub Actions release workflow`
- **自动更新**：`electron-updater` + S3 / generic HTTP update server；静默下载 + 启动时提示安装；用户可在 settings 关闭自动检查
- 关于窗口 `/settings/about`：版本号、git hash、runtime(electron/chrome/node)、许可证信息、官网链接
- 第一次启动检测 DevTools Protection（禁 devtools 默认；开发/测试构建可开）
- 异常诊断按钮：`/settings/observability` 底部 "一键导出诊断包"：把最近 7 天日志 + app 版本 + 平台信息打包成 zip 供用户发送支持

## Capabilities

### New Capabilities
- `observability-logger`: 统一结构化日志与 rotate 文件输出
- `observability-perf`: key path 性能采样 + 聚合表
- `observability-page`: `/settings/observability` 页面；usage/队列/ops_log/perf 聚合视图
- `crash-reporting`: 本地崩溃日志与启动时提示
- `diagnostic-bundle`: "一键导出诊断包" 打包近 7 天日志 + 元信息
- `app-packaging`: electron-builder 多平台打包与签名脚本
- `auto-update`: electron-updater 检查 / 下载 / 安装流程
- `about-page`: `/settings/about` 版本与许可信息
- `telemetry-switch`: 用户可控的脱敏 usage 统计开关

### Modified Capabilities
- `settings-page` (phase 13): 新增 `Observability` 与 `About` 两个子 section
- `app-shell` (phase 13): 启动时读 crash.log 弹提示；异常上报接线

## Impact

- 新目录：`electron/obs/`（logger / perf / crashReporter）、`electron/update/`（updater 封装）、`build/`（electron-builder 资源 icon / entitlements）
- 新 migration 010_perf_samples（`perf_samples` 表；可加 `ops_log` 索引）
- 新 npm 依赖：`electron-builder`、`electron-updater`、`electron-log`（可选；也可自写 logger）
- CI：`.github/workflows/release.yml` 打 tag 触发
- README 新增 "Install / Update / Troubleshoot" 指南；开发文档新增 "如何排查用户问题"
- 回滚成本：本阶段增量大但各子系统独立；可分别 disable（settings 开关）
