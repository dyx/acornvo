# about-page Specification

## Purpose

`/settings/about` 页面：展示产品版本、git hash、运行时（electron/chrome/node）、平台信息、依赖许可证清单与"检查更新"入口。

## Requirements

### Requirement: /settings/about 路由

应用 SHALL 新增 `/settings/about`；在 settings 左栏末尾加 "关于" 条目。页面 MUST 展示：

- 产品名 `Acornvo` + 版本（来自 `package.json.version`）
- Git commit hash（构建期通过 Vite define 注入 `__GIT_HASH__`，运行期读取；开发构建显示 "dev"）
- 运行时版本表：Electron / Chromium / Node（通过 `process.versions.*`）
- 平台 + 架构（`process.platform` + `process.arch`）
- 依赖许可证摘要：前 20 条 npm 依赖的 name / version / license；"查看完整清单" 展开 / 链接 opensource-licenses.txt
- 官网链接（占位 `https://acornvo.local/` 通过 `shell.openExternal` 打开）
- "检查更新" 按钮（对接 auto-update 手动检查）

#### Scenario: 显示版本信息

- **WHEN** 用户打开 /settings/about
- **THEN** 页面显示当前 version + gitHash + electron/chrome/node 版本

#### Scenario: 许可证展开

- **WHEN** 用户点 "查看完整清单"
- **THEN** 展开列表显示全部依赖许可证；或打开 licenses.txt

#### Scenario: 外链

- **WHEN** 用户点官网链接
- **THEN** shell.openExternal 打开系统浏览器；不在应用内新开窗口

### Requirement: 依赖清单生成

构建流程 SHALL 在打包前生成 `build/licenses.json` 文件，内容为 `{ name, version, license, repository? }[]`，由 `license-checker` 或等效脚本从 `node_modules` 抓取。打包时 MUST 随产物带入（`electron-builder.files` 含 `build/licenses.json`）。

#### Scenario: licenses.json 生成

- **WHEN** `npm run dist:mac` 触发
- **THEN** 前置 `npm run generate:licenses` 生成 licenses.json；about 页面读取此文件

#### Scenario: 未识别许可证

- **WHEN** 某依赖 license 字段缺失
- **THEN** 记 "Unknown"；logger.warn 提示开发者补充
