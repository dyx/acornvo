## Why

Acornvo 当前仅有 electron-vite 脚手架，缺少可承载后续所有功能（拾果/理果/松语/索引/搜索）的进程间通信骨架。若不先建立可复用的 IPC 约定、渲染端路由、状态与日志基座，后续每个阶段都会各自发明，导致接口不一致、错误无法定位、renderer 安全边界模糊。先集中一次把这层地基浇筑好，后续所有 change 都在此之上搭建。

## What Changes

- 统一主/预加载/渲染三进程启动骨架：`electron/main.ts`、`preload/preload.ts`、渲染端 `src/main.tsx` 入口与 `BrowserWindow` 创建与生命周期管理
- 建立**类型安全的 IPC 路由**：主进程 `registerHandlers({ namespace, methods })` 约定 + preload 通过 `contextBridge` 暴露的 `window.api.<namespace>.<method>()` 客户端；统一错误形状 `{ ok: false, error: { code, message } }`
- **安全默认**：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` / `webSecurity: true`；renderer 仅通过 contextBridge 白名单访问能力
- 渲染端基础设施：`React Router` memory router、Zustand 根 store、全局错误边界、主题（light/dark/system）scaffold、i18next 占位（仅 zh-CN）
- 日志：`electron-log` 写 `~/.acornvo/logs/main-YYYY-MM-DD.log`（生产 info / 开发 debug），主进程覆盖启动、IPC 错误、崩溃
- 应用生命周期：macOS `Cmd+W` 隐藏窗口而非退出；`before-quit` 拦截占位（此阶段无队列，仅空 hook 占位，后续阶段接线）；`powerMonitor.resume` 占位
- 无业务功能：不创建树林、不写 SQLite、不接 AI；渲染端启动后展示"Hello Acornvo"壳页面即可
- **不在本阶段**：Project Picker / SQLite / 文件读写 / Vditor / 浏览器 tab / 理果 / 松语（均由后续 change 引入）

## Capabilities

### New Capabilities
- `app-shell`: Electron 三进程骨架、窗口与生命周期管理、基础 UI 壳与路由
- `ipc-router`: 类型安全的 IPC 注册与调用约定、统一错误形状、contextBridge 白名单
- `app-logging`: 基于 electron-log 的主进程与 renderer 日志采集与文件轮转

### Modified Capabilities
（无 — 本阶段为首批 capability）

## Impact

- **新增代码**：`electron/main.ts`、`electron/ipc/router.ts`、`preload/preload.ts`、`src/main.tsx`、`src/App.tsx`、`src/stores/root.ts`、`src/ipc/client.ts`、`src/i18n/index.ts`、`electron/services/logger.ts`
- **依赖新增**：`react-router-dom`、`zustand`、`electron-log`、`i18next`、`react-i18next`
- **约定产出**（后续所有 change 必须遵守）：IPC 命名空间 + method 签名的 TS 类型、错误形状、preload 白名单结构
- **不影响**：打包配置（electron-vite 默认即可）、后续业务模块的具体实现
- **可观察产物**：`npm run dev` 能起桌面窗口，显示 Hello Acornvo；`~/.acornvo/logs/` 出现日志文件；DevTools 里 `window.api.ping.echo('x')` 能通过 IPC 回显
