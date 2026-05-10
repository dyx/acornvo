# crash-reporting Specification

## Purpose
本地崩溃捕获与上次崩溃启动提示：renderer / main 进程崩溃落地为 crashes/*.log，启动时检测未 ack 文件并提示用户查看 / 导出诊断包 / 忽略，崩溃文件不上传外部。

## Requirements

### Requirement: 崩溃捕获
`electron/obs/crashReporter.ts` SHALL 在 main 启动时注册：
- `app.on('render-process-gone', (event, wc, details))` → 写 `crashes/renderer-YYYYMMDDTHHMMSS.log`，内容含 reason / exitCode / webContents URL / stack
- `process.on('uncaughtException')` / `unhandledRejection` → 写 `crashes/main-YYYYMMDDTHHMMSS.log`，含 stack
- 调用 Electron 内置 `crashReporter.start({ uploadToServer: false, submitURL: '' })`：minidump 落到 `crashes/minidumps/`

所有崩溃文件 MUST **不上传**任何第三方服务。

#### Scenario: renderer 崩溃
- **WHEN** 渲染进程 crash
- **THEN** crashes/ 生成对应 log 文件；主进程 logger.error('app', { op:'renderer-gone', meta:{ reason, exitCode } })

#### Scenario: main 未捕获异常
- **WHEN** 主进程抛 uncaughtException
- **THEN** 写入 crashes/main-\*.log；继续后续退出流程（不阻止 quit）

### Requirement: 启动检查与提示
启动时 `crashReporter.checkLastRun()` SHALL 扫描 `crashes/` 中未 ack 文件；若存在 MUST 在主窗口加载完成后显示非阻塞 toast / banner："上次运行似乎异常，[查看日志] [导出诊断包] [忽略]"。

用户操作：
- "查看日志" → `shell.showItemInFolder(latestCrashLog)` 打开目录
- "导出诊断包" → 触发 diagnostic-bundle
- "忽略" → 将未 ack 文件移到 `crashes/acked/`

`acked/` 下超 30 天的 MUST 自动清理。

#### Scenario: 有未 ack crash
- **WHEN** 启动时 crashes/ 下有 renderer-2026-04-18T08-00-00.log 未 ack
- **THEN** 主窗口 ready 后显示 banner；提供三按钮

#### Scenario: 无崩溃
- **WHEN** crashes/ 空或全部 acked
- **THEN** 不显示 banner；启动正常

#### Scenario: acked 清理
- **WHEN** crashes/acked/ 有 35 天前的文件
- **THEN** 启动时删除
