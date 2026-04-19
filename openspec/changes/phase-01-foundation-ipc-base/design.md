## Context

Acornvo 是基于 Electron 32 + React 19 + TypeScript 5 的本地优先桌面应用。`electron-vite` 脚手架已就位但还未定型出**跨进程通信约定**、**renderer 安全边界**、**日志采集**三套最基础的公共设施。后续 17 个 change 全部依赖本阶段产出。

当前状态：
- 仓库中存在 electron-vite 默认产物（未核查具体落地形态）
- 无 IPC 路由约定；无 contextBridge 白名单规范；无 electron-log；渲染端无路由与状态管理

约束：
- 主进程一律使用 TypeScript；**业务逻辑禁止写在 renderer**（所有文件 I/O、数据库、AI 均 main 侧）
- renderer 严格启用 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`
- 所有跨进程数据必须可 structured-clone（不传函数、不传 class 实例）
- 后续 WebContentsView（拾果）必须与主 UI renderer **完全隔离**（此阶段先占位约定）

## Goals / Non-Goals

**Goals:**
- 浇筑一次、后续所有阶段免重造的 IPC 调用约定
- renderer 拿到类型安全的 `window.api.<ns>.<method>()`，错误以统一形状返回
- `electron-log` 可用于主进程与 renderer，文件日志落在 `~/.acornvo/logs/`
- 渲染端有路由（memory router）、Zustand 根 store、i18next 占位、错误边界
- 启动 `npm run dev` 能开桌面窗口显示"Hello Acornvo"
- 定义好应用生命周期 hooks（quit/resume/等）的**扩展点**，后续 change 往里挂钩

**Non-Goals:**
- 不引入 SQLite（交给 `sqlite-schema-migrations`）
- 不实现 Project Picker（交给 `project-picker-grove`）
- 不做文件 I/O、watcher、编辑器、浏览器、AI
- 不做 i18next 的 en-US 文案（仅 zh-CN 占位），英文留到 `observability-and-packaging`
- 不做打包/代码签名

## Decisions

### D1: IPC 以**命名空间 + 方法名**注册，preload 统一白名单暴露

**选择**：主进程集中 `electron/ipc/router.ts`，导出 `registerHandlers({ <ns>: { <method>(ctx, input): output } })`。preload 读同一份 TS 类型描述（`shared/ipc-contract.ts`），用 `contextBridge.exposeInMainWorld('api', { <ns>: { <method>: (input) => ipcRenderer.invoke(\`<ns>.<method>\`, input) } })` 生成客户端。

**备选**：
- tRPC-like 自动生成 —— 过度工程，当前规模不需要
- 单一 `invoke('event', payload)` 字符串通道 —— 无类型、难搜索

**理由**：命名空间天然对应后续模块（`project.*` / `file.*` / `clip.*` / `ai.*` / `search.*` 等），preload 白名单一览即知渲染端可调的全部 API。

### D2: 统一错误形状 `{ ok, data, error }`

所有 handler 强制用 `try/catch` 包裹返回 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。renderer 客户端自动抛出 `IpcError` 类型异常，供调用方 try/catch。`code` 为稳定字符串枚举（`E_INTERNAL` / `E_INVALID_ARGS` / `E_PERMISSION` 等），后续 change 可扩枚举但不改形状。

**理由**：避免每个 change 各自发明错误包装。日志与 UI toast 都能依赖稳定 shape。

### D3: 窗口生命周期

- 主窗 `width: 1280, height: 800, minWidth: 960, minHeight: 600`（数值后续可调，但先定基线）
- macOS：`Cmd+W` 关闭走 `window.hide()` 而非 `window.close()`；Dock 图标点击若窗口全隐则 `window.show()`；`app.on('before-quit')` 里标记 `isQuitting=true` 以允许真正退出
- Win/Linux：关窗即退出
- `before-quit`：提供空钩子数组 `appLifecycle.onBeforeQuit(handler)`，后续队列/未保存编辑等模块注册
- `powerMonitor.resume`：同样是空钩子数组，后续 WebContentsView 注册刷新 tab

**理由**：一次性把生命周期扩展点铺好，避免后续 change 在 `main.ts` 里乱挂监听。

### D4: 日志

`electron-log` 主进程初始化，目录 `~/.acornvo/logs/main-YYYY-MM-DD.log`；轮转策略：按日期文件 + 单文件 10MB 上限 + 保留 14 天。生产 level = `info`，开发（`process.env.NODE_ENV === 'development'`）= `debug`。

renderer 端通过 `window.api.log.<level>(message, ctx?)` 走 IPC 汇到主进程同一 logger（避免 renderer 自写磁盘）。

**理由**：用户反馈 issue 时一个目录即可复制；renderer 错误/AI 调用统一落到一处便于排查。

### D5: 渲染端路由与状态

- `react-router-dom` 的 **memory router**（桌面应用无地址栏，desktop 用 memory 更干净）
- 路由表预占位：`/`（placeholder）、`/picker`（后续 `project-picker-grove` 接入）、`/library`、`/editor/:path`、`/browser`、`/chat`、`/settings`；本阶段仅 `/` 可达，其余路由挂 `<Placeholder name="xxx" />`
- Zustand 根 store `src/stores/root.ts`：`theme: 'light'|'dark'|'system'`、`locale: 'zh-CN'|'en-US'`（本阶段只 zh-CN 生效）；后续 change 新增各自的 slice（模块各自一个文件）

**理由**：为后续阶段留稳定的路由命名与 store 组合方式，减少接线成本。

### D6: 安全

WebPreferences 固定：
```
{
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  preload: <path to preload>,
  spellcheck: false
}
```
CSP：主窗口本地资源；**在 response header 注入** `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:` 的基线（unsafe-inline 只为兼容 vditor/tailwind 注入，可在 `vditor-editor-autosave` 阶段收紧）。

外链：拦截 `window.open` 与 `will-navigate`，非本应用白名单的走 `shell.openExternal`。

## Risks / Trade-offs

- **WebContentsView 与 CSP 冲突风险** → CSP 只作用于主窗；拾果阶段创建的 WebContentsView 不受此 CSP 限制（网页原样加载），此阶段仅约定、具体加固留到 `browser-tabs-bookmarks`
- **memory router 刷新丢状态** → Electron dev 热更会丢路径；可接受（无 deep link 需求）
- **electron-log 路径与 `~/.acornvo/` 目录** → 需先保证目录存在；启动时 `fs.mkdirSync(recursive: true)`，失败则回退到 `app.getPath('userData')/logs/` 并告警
- **preload 白名单漂移** → 日后 change 新增命名空间容易忘记在 preload 里暴露；通过**单一 `shared/ipc-contract.ts`** 作为契约源，preload 和 main 都从中派生，避免双重维护

## Migration Plan

无存量迁移（首阶段）。

回滚：删除 `openspec/changes/foundation-ipc-base/` 并 `git checkout .` 即可；未引入外部副作用。

## Open Questions

- 是否需要在本阶段就支持多窗口？**暂定否**；若后续 `chat-ui-sessions` 想把松语开独立窗，再提 change
- `~/.acornvo/` vs `app.getPath('userData')`？**选 `~/.acornvo/`** 与 PRD 一致（跨平台一目录），但 Windows 下 `~` 解析为 `%USERPROFILE%`；测试覆盖三平台路径
