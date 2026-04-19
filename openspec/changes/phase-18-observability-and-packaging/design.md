## Context

phase 1-17 建立了所有功能；phase 18 是"让产品可发布、可运维"的最后一公里。核心挑战：
- 日志量大：AI / 索引 / 队列 / agent 会频繁写；rotate 与总量控制要有纪律
- 崩溃分两种：renderer 崩（仅该页面挂）与 main 崩（整个 app 挂）；要都捕获到
- 打包签名：mac 需要 notarization；win 需要 authenticode；Linux AppImage 无签名但要 SHA256
- 自动更新：既要静默又要给用户控制；更新源在 phase 18 用 generic HTTP（GitHub Releases 可直接当源）

PRD N-1（稳定） / N-2（可观测） / N-5（可打包交付）对应本阶段。

## Goals / Non-Goals

**Goals:**
- 统一 logger API；所有现有 console.\* 替换（关键 area）
- Usage / 队列 / ops_log / perf 一页看全；用户能自查 AI 花销
- `npm run dist:mac|win|linux` 出可安装包；mac dmg 已签名 + 公证
- 自动更新链路从 app 内"检查更新" 按钮到下载安装走通一次
- 崩溃时至少留日志；下次启动看到提示

**Non-Goals:**
- 不做远程错误上报（Sentry / Bugsnag）；本地日志为主
- 不做 Windows 代码签名证书采购（CI 上环境变量占位，用户自配）
- 不做 Linux 自动更新（AppImage 可手动替换；electron-updater 支持 AppImage 但本阶段不启）
- 不做用户实名分析；telemetry 严格脱敏且默认 off
- 不做多语言日志（日志英文即可；UI i18n 不变）
- 不做 A/B 实验框架（PRD 未要求）
- 不做 licensing / 付费流程（开源单机产品）

## Decisions

### D1: logger 设计

`electron/obs/logger.ts`:

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;        // ISO8601
  level: LogLevel;
  area: string;      // 'indexer' | 'clipper' | 'ai' | 'agent' | 'app' | ...
  op?: string;       // e.g., 'readability-extract'
  ok?: boolean;
  ms?: number;
  msg?: string;
  meta?: Record<string, unknown>;
}

logger.info('clipper', { op: 'save', ok: true, ms: 812, meta: { url, chars } });
```

输出 JSON Lines 到 `~/Library/Logs/Acornvo/app-YYYY-MM-DD.log`（linux: `~/.config/Acornvo/logs/`; win: `%APPDATA%\Acornvo\logs\`）。

**Rotate 策略：**
- 每日一个文件（按 UTC 日期）
- 启动时扫描日志目录：删除 7 天前的文件；若总量 > 50MB 从旧到新删到 ≤ 40MB
- 单文件达 10MB 时分片 `app-YYYY-MM-DD.1.log`、`.2.log`

同时也镜像到 DevTools console（开发构建），不镜像到生产 console。

**理由：** JSON Lines 易于 grep/jq 分析；按天 rotate 方便排查"某天问题"；大小上限保护磁盘。

### D2: perf 采样

`electron/obs/perf.ts`:

```ts
const end = perf.start('agent.step', { sessionId });
// ... work ...
end({ ok: true, ms: endMs });   // 写 perf_samples 表
```

`perf_samples` 表：
```sql
CREATE TABLE perf_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  area TEXT NOT NULL,    -- 'indexer.scan' | 'agent.step' | 'clipper.save' | 'search.query'
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  meta TEXT              -- JSON
);
CREATE INDEX idx_perf_area_ts ON perf_samples(area, ts);
```

保留最近 10 万行；超时按 ts 滚动删。observability 页面展示每个 area 的 P50/P95/成功率（过去 24h / 7d）。

**key path 埋点：**
- `project.open`
- `indexer.scan` + `indexer.update`（每文件）
- `clipper.save`
- `clipper.ai-review`
- `agent.step`（每步 LLM 调用）
- `search.query`

### D3: crash reporter

`electron/obs/crashReporter.ts`:

- `app.on('render-process-gone', (event, webContents, details))` → 写 `crash-YYYYMMDD-HHMMSS.log`（含 reason / exitCode / url）
- `process.on('uncaughtException' | 'unhandledRejection')` → 同上
- 使用 Electron 内置 `crashReporter.start({ uploadToServer: false, submitURL: '' })`（仅本地 minidump；放到 `~/Library/Logs/Acornvo/crashes/`）
- 启动时检查是否有未 ack 的 crash 文件 → 主窗口内 toast "上次运行似乎异常，查看日志" + "导出诊断包" 按钮
- 用户 ack 后文件移到 `acked/` 子目录，超 30 天清理

**不做**：向第三方服务发送 minidump。

### D4: diagnostic bundle

按钮在 `/settings/observability` 底部 "导出诊断包"：
- 汇总最近 7 天 `.log` + `crashes/` + `app_version.json`（含 electron/chrome/node/git hash）+ `about.json`
- zip 到 `~/Downloads/Acornvo-Diagnostics-YYYYMMDD.zip`
- 不包含 user data / notes / clips body；仅日志与版本信息
- 导出成功后打开 Finder/Explorer 定位到该文件

### D5: observability 页面

`src/pages/settings/Observability.tsx`，路由 `/settings/observability`。三个卡片区：

1. **AI 使用**：
   - 标题条：过去 24h / 7d / 30d 切换
   - 数字卡：总请求、总 token、预计成本（用 phase 15 的 usage）
   - 按 profile 横条：每个 profile 的 call / token
   - 按工具折叠：search_files / read_file / update_frontmatter 调用次数（来自 tool_calls 表）
   - 日期折线：每日 token 趋势

2. **队列健康**：
   - 当前 pending / running / failed 计数（phase 14）
   - 最近 20 条失败 job（kind / last_error / updated_at）"重试" / "丢弃" 按钮
   - 最近 20 条 ops_log（area / message / ts）

3. **性能**：
   - 每 key area 的 P50 / P95 / 成功率
   - 红色阈值：搜索 P95 > 500ms / agent.step P95 > 30s / clipper.save P95 > 10s

底部 "导出诊断包" 按钮。

### D6: about 页面

`/settings/about`：

- 应用名 + 版本（来自 `package.json.version`） + git hash（构建期 webpack DefinePlugin 注入）
- Electron / Chromium / Node 版本（运行时取）
- 许可证列表（MIT / Apache / ...）前 20 条依赖；"完整清单" 展开
- 官网链接（占位 `https://acornvo.local/` 使用 shell.openExternal）
- "检查更新" 按钮 → 触发 autoUpdater.checkForUpdates（见 D8）

### D7: telemetry 开关

`settings.telemetry.enabled: boolean`（默认 false）。

启用后：
- 每日聚合一次：`SELECT count(*), sum(total_tokens) FROM ai_usage WHERE ts >= today`
- 写入本地 `telemetry_local` 表；当前**不外发**；phase 18 只铺通道和 UI
- 用户可在 /settings/observability 打开/关闭；关闭时停止聚合且不删历史

**理由：** 外发 telemetry 需要后端与用户协议；本阶段先打好开关与数据形状，外发留给后续云版本。

### D8: 打包与签名

`electron-builder.yml`:

```yaml
appId: cc.acornvo.app
productName: Acornvo
directories: { output: dist, buildResources: build }
files: [dist-electron/**, dist-renderer/**, package.json]
mac:
  category: public.app-category.productivity
  target: [{ target: dmg, arch: [x64, arm64] }]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  notarize: { teamId: ${env.APPLE_TEAM_ID} }
win:
  target: [nsis]
  certificateFile: ${env.WIN_CERT_FILE}
linux:
  target: [AppImage]
  category: Utility
publish:
  provider: generic
  url: https://releases.acornvo.local/
```

- icon 必备：mac icns / win ico / linux png（build/icon.\*）
- mac entitlements：`com.apple.security.network.client`（LLM 访问）、`com.apple.security.files.user-selected.read-write`
- Windows：NSIS 安装器；per-user 安装；快捷方式开始菜单 + 桌面

**CI**：GitHub Actions `release.yml`：
- 触发：push tag `v*.*.*`
- 矩阵：macos-latest / windows-latest / ubuntu-latest
- secrets：`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`、`CSC_LINK`、`CSC_KEY_PASSWORD`（win）
- 产物：dmg / exe / AppImage + `latest-mac.yml` 等 publish metadata → 上传 GitHub Release

### D9: 自动更新

`electron/update/updater.ts` 封装 `electron-updater`：

- 启动 60s 后首次检查；此后每 4h 一次（若 `settings.update.autoCheck=true`）
- 有新版本 → 静默下载到临时目录 → 完成后主窗口下弹出 "有新版本 <vX.Y.Z>，点此安装"
- 用户点安装 → `autoUpdater.quitAndInstall()`
- 任何错误（网络 / 签名失败）静默记日志；不打扰用户
- `/settings/about` "检查更新" 手动触发；无新版显示"已是最新"

**更新源**：phase 18 用 `publish.provider=generic` 指向 `https://releases.acornvo.local/`（占位；实际可用 GitHub Releases：`provider=github`）。

### D10: devtools / 安全

- 生产构建 `webContents.on('devtools-opened')` → 立即 close；日志记录尝试
- 开发构建 `NODE_ENV === 'development'` 时允许
- CSP：保持 phase 1 的 `default-src 'self'`；`connect-src` 放开 LLM 端点与 update url

### D11: 迁移

`migrations/010_perf_samples.sql`：
```sql
CREATE TABLE perf_samples (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, area TEXT NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL, meta TEXT);
CREATE INDEX idx_perf_area_ts ON perf_samples(area, ts);
CREATE INDEX idx_ops_log_ts ON ops_log(ts);   -- 若 phase 3/14 未建
PRAGMA user_version = 10;
```

### D12: i18n keys

```
obs.title / obs.tabs.ai / obs.tabs.queue / obs.tabs.perf
obs.ai.totalRequests / totalTokens / estimatedCost
obs.queue.pending / running / failed / retry / discard
obs.perf.p50 / p95 / successRate / threshold.warn
obs.export.diagnostic / obs.export.success
about.version / about.hash / about.runtime / about.licenses / about.checkUpdate / about.upToDate / about.newVersion
crash.detectedLastRun / crash.viewLogs / crash.exportDiag
update.available / update.downloading / update.installNow / update.upToDate
telemetry.enable / telemetry.description
```

## Risks / Trade-offs

- [日志体量爆表] → rotate + 总量上限；key area 外使用 `debug` 级别且生产默认不写
- [mac 公证失败阻塞发布] → CI 加手动 retry step；本地预公证脚本 `npm run notarize:mac`
- [Windows 未签名导致 SmartScreen 警告] → README 明示获取证书步骤；本阶段可以先 ship 未签名 beta
- [自动更新误伤正在使用的用户] → 下载后不自动重启；仅 toast；用户主动点击
- [perf_samples 膨胀] → 保留 10 万行滚动删；按 area 分页查询
- [crash report 泄露路径隐私] → 诊断包只含日志；日志脱敏文件路径（只保留 basename）
- [telemetry 开关误解] → 默认 off + 文案明确 "仅本地统计"；后续外发须二次同意

## Migration Plan

- migration 010 增量建 `perf_samples` 表；无破坏性
- 现有 console.\* 保留一版过渡期；关键 area（clipper/ai/agent/indexer）本阶段强制替换为 logger
- 打包配置逐平台验证：先 mac dmg，后 win exe，最后 linux AppImage
- 回滚：logger 切回 console；打包回归手工 `electron-builder` 本地；自动更新可通过 `settings.update.autoCheck=false` 全局关闭

## Open Questions

- telemetry 外发的云端在哪？→ phase 19+ 再定（可能是自托管 ingest 或暂不做）
- 是否提供 Portable 版本？→ 本阶段不做；仅 installer
- 更新源是否从 GitHub Release 直接拉？→ 上线前二选一（generic HTTP / GitHub）；本阶段 generic，配合 mirror
- macOS Apple Silicon Universal 包？→ 默认 arm64 + x64 双产物；不做 universal（体积翻倍）
