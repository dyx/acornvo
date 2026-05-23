# observability-logger Specification

## Purpose

统一结构化日志：`electron/obs/logger.ts` 提供 logger 单例，写 JSON Line 到平台日志目录的 `app-YYYY-MM-DD.log`，支持文件分片、按时间与总容量 rotate；关键 area 强制从 console.\* 切换到 logger。

## Requirements

### Requirement: logger API

`electron/obs/logger.ts` SHALL 暴露 `logger` 单例：

- `logger.debug(area, payload) / info / warn / error`
- `payload` 类型：`{ op?, ok?, ms?, msg?, meta? }`
- 每条 MUST 写一条 JSON Line 到当天的日志文件：`{ ts, level, area, op?, ok?, ms?, msg?, meta? }`

开发构建 MUST 同时输出到 stdout；生产构建只写文件。

#### Scenario: info 调用

- **WHEN** `logger.info('clipper', { op:'save', ok:true, ms:812, meta:{ url } })`
- **THEN** 当天日志文件追加一行 JSON，包含 ts / level='info' / area / op / ok / ms / meta

#### Scenario: error 调用带 meta

- **WHEN** `logger.error('agent', { op:'step', ok:false, msg:'timeout', meta:{ sessionId } })`
- **THEN** 文件写入 level='error' 的 JSON 行；开发构建 console 打印同样内容

#### Scenario: payload 缺省

- **WHEN** `logger.warn('app', { msg:'low memory' })`
- **THEN** 未提供的字段（op/ok/ms）省略；不输出 `undefined` 字面

### Requirement: 文件位置与命名

logger SHALL 按平台选择日志目录：

- macOS：`~/Library/Logs/Acornvo/`
- Windows：`%APPDATA%\Acornvo\logs\`
- Linux：`~/.config/Acornvo/logs/`

文件名 MUST 为 `app-YYYY-MM-DD.log`（UTC 日期）。若单文件超过 10MB MUST 分片为 `app-YYYY-MM-DD.1.log`、`.2.log`。

#### Scenario: macOS 目录

- **WHEN** 在 macOS 启动
- **THEN** 日志写入 `~/Library/Logs/Acornvo/app-YYYY-MM-DD.log`

#### Scenario: 文件分片

- **WHEN** 当天日志文件达 10MB
- **THEN** 新日志写入 `.1.log`；再达 10MB 写 `.2.log`；以此类推

### Requirement: Rotate 与容量上限

应用启动时 logger SHALL 扫描日志目录并执行 rotate：

1. 删除 7 天前的文件
2. 若剩余总体积 > 50MB，按 ts 从旧到新删除，直到 ≤ 40MB
3. 删除前 MUST 至少保留当前日 1 个文件

rotate 失败 MUST 不抛异常到调用方；以内部 `logger.error('obs', ...)` 记录。

#### Scenario: 旧文件清理

- **WHEN** 启动时目录含 10 天前的 `app-2026-04-09.log`
- **THEN** 该文件被删除

#### Scenario: 超容量清理

- **WHEN** 总量 60MB 且其中最旧 3 个文件共 25MB
- **THEN** 从最旧起删除，使总量回到 ≤ 40MB

### Requirement: 关键 area 强制替换

下列 area 在 phase 18 MUST 从 `console.*` 替换为 `logger`：`indexer` / `clipper` / `ai` / `agent` / `app` / `queue` / `update`。其他 area 本阶段允许保留 console 过渡。

#### Scenario: clipper.save 走 logger

- **WHEN** 剪藏保存流程执行
- **THEN** 每步埋点以 `logger.info('clipper', { op:'save', ... })` 记录；不使用裸 console.log

#### Scenario: 错误路径

- **WHEN** Readability 抽取失败
- **THEN** `logger.error('clipper', { op:'extract', ok:false, msg:'readability-timeout', meta:{ url } })`
