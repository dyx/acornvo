## ADDED Requirements

### Requirement: 启动时崩溃提示与诊断入口

应用主窗口首次 `ready-to-show` 后 SHALL 调用 `crashReporter.checkLastRun()`；若返回的未 ack 崩溃文件列表非空 MUST 在窗口底部弹出非阻塞 banner："上次运行似乎异常"；banner 上 MUST 有三个按钮：`查看日志` / `导出诊断包` / `忽略`。

`查看日志` → `shell.showItemInFolder(latestCrashLog)`。
`导出诊断包` → 调 `exportDiagnosticBundle()`（diagnostic-bundle 能力）。
`忽略` → 将所有未 ack 文件移到 `crashes/acked/`；banner 消失。

#### Scenario: 有未 ack 崩溃

- **WHEN** 启动时 crashes/ 下有未 ack 文件
- **THEN** 主窗口 ready 后显示 banner；三个按钮可交互

#### Scenario: 忽略 ack

- **WHEN** 用户点 "忽略"
- **THEN** 未 ack 文件全部移动到 crashes/acked/；banner 关闭；下次启动不再提示

#### Scenario: 首次干净启动

- **WHEN** crashes/ 目录为空或全已 ack
- **THEN** 不显示 banner；启动正常
