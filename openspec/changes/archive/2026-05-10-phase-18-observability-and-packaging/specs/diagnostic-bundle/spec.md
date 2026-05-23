## ADDED Requirements

### Requirement: 导出诊断包

`electron/obs/diagnostic.ts` SHALL 暴露 `exportDiagnosticBundle() → Promise<string>`。实现步骤：

1. 收集过去 7 天的 `app-*.log` 文件
2. 收集 `crashes/*.log` 与 `crashes/acked/*.log`（不含 minidumps 以降体积）
3. 生成 `about.json`：`{ appVersion, gitHash, electron, chrome, node, platform, arch, locale }`
4. 生成 `env.json`：Node env 非敏感字段（`NODE_ENV`、`LANG`；不含任何 API key）
5. 以 zip 打包到 `<Downloads>/Acornvo-Diagnostics-YYYYMMDD-HHMMSS.zip`
6. 返回 zip 路径并调 `shell.showItemInFolder(zipPath)` 定位

MUST NOT 包含：用户笔记 / 剪藏 body / SQLite 数据库 / API key / session_messages。

#### Scenario: 正常导出

- **WHEN** 用户在 observability 页点 "导出诊断包"
- **THEN** 生成 zip 到 Downloads；打开 Finder/Explorer 定位；UI toast "诊断包已导出"

#### Scenario: 无日志文件

- **WHEN** logs/ 与 crashes/ 均空
- **THEN** zip 中仍含 about.json + env.json；UI toast 成功

#### Scenario: 敏感字段过滤

- **WHEN** 日志中出现疑似路径 `/Users/alice/notes/xxx.md`
- **THEN** 写入 zip 前 basename 化：只保留 `xxx.md`（由 logger 层写入前已脱敏 → diagnostic 仅复制原始日志文件）

### Requirement: API key 白名单过滤

diagnostic 打包前 SHALL 对日志文本做最后一轮正则扫描：命中 `sk-[A-Za-z0-9]{20,}`、`xoxb-`、`AIza[0-9A-Za-z_-]{35}` 等 API key pattern 的行 MUST 替换为 `[REDACTED:api-key]`；原文件不修改。

#### Scenario: 检测 OpenAI key

- **WHEN** 日志含 `"sk-abcdefghijklmnopqrstuvwxyz123"`
- **THEN** zip 内对应行为 `[REDACTED:api-key]`；原始日志文件不变
