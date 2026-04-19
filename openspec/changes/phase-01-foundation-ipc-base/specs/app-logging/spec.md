## ADDED Requirements

### Requirement: 本地日志文件
系统 SHALL 使用 `electron-log` 将主进程日志写入 `~/.acornvo/logs/main-YYYY-MM-DD.log`。日志 SHALL 按日轮转，单文件大小上限 10 MB，保留 14 天，超限自动清理。生产环境 level 为 `info`，开发环境为 `debug`。

#### Scenario: 日志目录不存在时自动创建
- **WHEN** 首次启动应用且 `~/.acornvo/logs/` 不存在
- **THEN** 应用启动后该目录被创建，当日日志文件存在
- **AND** 若目录创建失败，日志回退写 `app.getPath('userData')/logs/` 并输出告警

#### Scenario: 日志清理
- **WHEN** `~/.acornvo/logs/` 下存在超过 14 天的日志文件
- **THEN** 应用启动后这些文件被删除

### Requirement: 渲染端日志聚合
渲染端 SHALL 通过 `window.api.log.<level>(message, ctx?)` 把日志汇回主进程统一写文件。支持级别：`debug` / `info` / `warn` / `error`。

#### Scenario: renderer 错误汇集
- **WHEN** 渲染端捕获异常并调用 `window.api.log.error('boom', { where: 'App' })`
- **THEN** 当日主进程日志文件中出现一条 `error` 级别记录，含 `'boom'` 与上下文

### Requirement: 关键路径必记
系统 SHALL 在以下关键路径产生 `info` 级日志：应用启动、应用退出、主窗口创建、IPC handler 异常、`before-quit` 钩子执行。

#### Scenario: 启动日志
- **WHEN** 应用启动完成（主窗口首次 `ready-to-show`）
- **THEN** 日志中出现一条"app started"记录，含版本号、平台、Electron 版本
