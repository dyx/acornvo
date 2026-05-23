# app-packaging Specification

## Purpose

electron-builder 多平台打包配置、构建资源（icon / entitlements）、构建脚本与 GitHub Actions release workflow。

## Requirements

### Requirement: electron-builder 配置

仓库根目录 SHALL 存在 `electron-builder.yml` 定义多平台构建：

- `appId: cc.acornvo.app`，`productName: Acornvo`
- `directories.output: dist`、`directories.buildResources: build`
- `files`: 至少包含 `dist-electron/**`、`dist-renderer/**`、`package.json`
- `mac.target: [{ target: dmg, arch: [x64, arm64] }]`、`hardenedRuntime: true`、`entitlements: build/entitlements.mac.plist`
- `win.target: [nsis]`
- `linux.target: [AppImage]`
- `publish.provider: generic` 指向 update 源（url 占位）

#### Scenario: 配置文件存在

- **WHEN** 检查仓库根目录
- **THEN** 存在 `electron-builder.yml`，含 appId / productName / mac / win / linux / publish 段

#### Scenario: mac dmg 双架构

- **WHEN** 运行 `npm run dist:mac`
- **THEN** dist/ 下产出两个 dmg：一个 x64 / 一个 arm64

### Requirement: icon 与 entitlements 资源

`build/` 目录 SHALL 包含：

- `icon.icns`（macOS，1024x1024 多分辨率）
- `icon.ico`（Windows）
- `icon.png`（Linux 512x512）
- `entitlements.mac.plist`：声明 `com.apple.security.network.client`、`com.apple.security.files.user-selected.read-write`、`com.apple.security.cs.allow-jit`

#### Scenario: 缺 icon

- **WHEN** build/icon.icns 缺失
- **THEN** `npm run dist:mac` 报错提示缺 icon；不生成 dmg

#### Scenario: entitlements 声明

- **WHEN** 检查 entitlements.mac.plist
- **THEN** 三个 key 都存在

### Requirement: 构建脚本

`package.json.scripts` SHALL 包含：

- `dist:mac: electron-builder --mac`
- `dist:win: electron-builder --win`
- `dist:linux: electron-builder --linux`
- `dist:all: electron-builder -mwl`
- `notarize:mac`：封装 `electron-builder --mac` 读取 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 环境变量触发 notarization

#### Scenario: 本地 mac 构建

- **WHEN** 开发者运行 `npm run dist:mac`
- **THEN** 执行打包；产物在 `dist/`

#### Scenario: notarize 需要凭据

- **WHEN** 运行 `npm run notarize:mac` 但未设 `APPLE_TEAM_ID`
- **THEN** 脚本退出码非零；stderr 明确提示缺失的环境变量

### Requirement: CI release workflow

`.github/workflows/release.yml` SHALL 存在并满足：

- 触发：`push` tag 匹配 `v*.*.*`
- matrix：`macos-latest` / `windows-latest` / `ubuntu-latest`
- secrets 引用：`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`、`CSC_LINK`、`CSC_KEY_PASSWORD`
- 上传构件：每平台的 dmg / exe / AppImage + publish metadata（`latest-mac.yml` 等）到对应的 GitHub Release

#### Scenario: tag push 触发

- **WHEN** push tag `v1.0.0`
- **THEN** workflow 启动；三平台 job 并发；成功后产物附到 Release

#### Scenario: 非 tag push

- **WHEN** push 普通 commit 到 main
- **THEN** release workflow 不触发
