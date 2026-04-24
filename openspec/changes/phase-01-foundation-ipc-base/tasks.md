## 1. 依赖与项目结构

- [x] 1.1 `package.json` 添加 `react-router-dom`、`zustand`、`electron-log`、`i18next`、`react-i18next`
- [x] 1.2 新建目录 `electron/ipc/`、`electron/services/`、`preload/`、`shared/`、`src/stores/`、`src/ipc/`、`src/i18n/`
- [x] 1.3 更新 `tsconfig.json` 路径别名 `@/` → `src/`、`@shared/` → `shared/`
- [x] 1.4 调整 `electron.vite.config.ts` 确保 main/preload/renderer 三段均启用 TS 严格模式且能互相 import `shared/`

## 2. IPC 契约（shared/ipc-contract.ts）

- [x] 2.1 定义 `IpcOk<T>` / `IpcErr` 联合类型与 `IpcError` 类（含 `code: IpcErrorCode`）
- [x] 2.2 枚举 `IpcErrorCode`：`E_INTERNAL` / `E_INVALID_ARGS` / `E_NOT_FOUND` / `E_PERMISSION`（预留扩展）
- [x] 2.3 声明 `IpcContract` 类型：`{ ping: { echo(input: string): string }, log: { debug/info/warn/error(msg, ctx?): void } }`
- [x] 2.4 导出 `IpcChannelName<NS, M>` 与 `IpcClient<C>` 工具类型，后续模块复用

## 3. 主进程 IPC 路由（electron/ipc/router.ts）

- [x] 3.1 `registerHandlers<C extends IpcContract>(handlers)`：遍历 ns/method，`ipcMain.handle('<ns>.<method>', wrap(fn))`
- [x] 3.2 `wrap(fn)`：`try { ok: true, data: await fn(input) } catch (e) { log + { ok: false, error: normalize(e) } }`
- [x] 3.3 `normalize(e)`：保留 `IpcError.code`，其他异常归为 `E_INTERNAL`，message 脱敏（去掉栈与内部路径）
- [x] 3.4 内建 ping 与 log 两组 handler

## 4. preload（preload/preload.ts）

- [x] 4.1 基于 `IpcContract` 类型自动生成 `window.api.<ns>.<method>` 代理（Proxy 或代码生成均可，先用显式对象写死 ping/log 两组）
- [x] 4.2 代理内部：`const res = await ipcRenderer.invoke('<ns>.<method>', input); if (!res.ok) throw new IpcError(res.error)`
- [x] 4.3 `contextBridge.exposeInMainWorld('api', api)`；禁止暴露 `ipcRenderer`、`process`、`require`
- [x] 4.4 TypeScript 声明文件 `src/global.d.ts`：`interface Window { api: IpcClient<IpcContract> }`

## 5. 主进程入口（electron/main.ts）

- [x] 5.1 `app.whenReady()` 前调用 `logger.init()`（创建 `~/.acornvo/logs/` 并挂 electron-log）
- [x] 5.2 创建 `BrowserWindow`：尺寸 1280×800，最小 960×600，居中；WebPreferences 固定安全配置（见 design D6）
- [x] 5.3 挂 CSP：`session.defaultSession.webRequest.onHeadersReceived` 注入 `Content-Security-Policy`
- [x] 5.4 `window.webContents.setWindowOpenHandler`：非白名单 URL 走 `shell.openExternal`，返回 `{ action: 'deny' }`
- [x] 5.5 `window.webContents.on('will-navigate')`：同上拦截
- [x] 5.6 `registerHandlers(ipcHandlers)`（ping + log 两组）
- [x] 5.7 生命周期：macOS `window-all-closed` 不退出；`activate` 重新显示；`Cmd+W` 隐藏而非关闭；Win/Linux 关窗退出
- [x] 5.8 暴露 `appLifecycle.onBeforeQuit` / `onWindowResume` 订阅器；`app.on('before-quit')` 与 `powerMonitor.on('resume')` 串行触发订阅者

## 6. 日志服务（electron/services/logger.ts）

- [x] 6.1 配置 electron-log：文件路径 `~/.acornvo/logs/main-YYYY-MM-DD.log`，单文件 10 MB，保留 14 天
- [x] 6.2 level：`process.env.NODE_ENV === 'development'` → `debug`，否则 `info`
- [x] 6.3 启动日志："app started" 含 `app.getVersion()`、`process.platform`、`process.versions.electron`
- [x] 6.4 启动时清理 `~/.acornvo/logs/` 下 mtime 超过 14 天的文件
- [x] 6.5 `log` IPC handler 实现：按 level 写主进程 logger，前缀 `[renderer]`

## 7. 渲染端基座

- [x] 7.1 `src/main.tsx`：挂载 React 根、`<MemoryRouter>`、全局错误边界
- [x] 7.2 `src/App.tsx`：定义路由表（`/`、`/picker`、`/library`、`/editor/:path`、`/browser`、`/chat`、`/settings`），除 `/` 外全部挂 `<Placeholder name="xxx" />`
- [x] 7.3 `src/stores/root.ts`：Zustand store 含 `theme`、`locale`、`setTheme`、`setLocale`
- [x] 7.4 `setTheme` 副作用：写 `document.documentElement.dataset.theme`；`system` 时订阅 `matchMedia('(prefers-color-scheme: dark)')`
- [x] 7.5 `src/i18n/index.ts`：i18next 初始化，resources 只含 `zh-CN`，默认 `zh-CN`；占位 key 几条
- [x] 7.6 `src/ipc/client.ts`：导出 `ipc = window.api` 的强类型 re-export；定义 `useIpc()` hook 占位
- [x] 7.7 `/` 路由渲染 "Hello Acornvo"，按钮 "ping" 调用 `window.api.ping.echo('hi')` 并把结果写 store 显示

## 8. 验收

- [ ] 8.1 `npm run dev` 启动桌面窗口，显示 Hello Acornvo
- [ ] 8.2 DevTools Console 执行 `window.api.ping.echo('x')` 返回 `'x'`；`window.require` 为 `undefined`
- [ ] 8.3 `~/.acornvo/logs/main-YYYY-MM-DD.log` 存在且含 "app started" 行
- [ ] 8.4 `window.api.log.error('boom', { where: 'smoke' })` 能在日志文件里看到
- [ ] 8.5 macOS `Cmd+W` 后点击 Dock 图标窗口重新出现
- [x] 8.6 TypeScript `tsc --noEmit` 无错；违反契约的改动（删掉某方法）编译报错
- [x] 8.7 `openspec validate phase-01-foundation-ipc-base --strict` 通过
