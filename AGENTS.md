# AGENTS.md

code is law：描述（文档、注释）与代码冲突时，以代码为准。

## 架构与边界

四层，严格单向：

- `electron/` 主进程（Node，AI/DB/剪藏/浏览器/IPC handler）
- `preload/` 桥接层，仅经 `contextBridge` 暴露类型化 `window.api`
- `src/` 渲染层（React 19）
- `shared/` 纯类型与契约，三层均可 import

路径别名：`@/` → `src/`（仅渲染层，见 `tsconfig.web.json`）；`@shared/` → `shared/`（全层，见 `electron.vite.config.ts`）。

IPC 约定：`shared/ipc-contract.ts` 是单一真相源；handler 在 `electron/ipc/*`，经 `router.ts` 的 `wrap()` 注册；返回值统一用 `IpcResult<T>` 信封，错误抛 `IpcError`。**渲染层不得直接 import `electron/`**——一律走 `src/ipc/client.ts` 的 `ipc.*`。

全局状态用 zustand，store 放 `src/stores/`（模块级单例）。

## 跨平台

- 渲染层判平台用 `navigator.userAgent`，非 `process.platform`（sandbox 无）。
- 状态信息走 `StatusBar`：Windows 挂顶部标题栏（`isTitleBar` prop），mac 挂底部；按 `isWin` 分流。
- 顶部留白：mac 为红绿灯留 ~40px、win ~14px；新顶部元素按 `isWin` 分流。

## 安全不变量

- 渲染层传入的文件路径**一律**经 `safeResolve`（`electron/services/path-safety.ts`）——禁止 `join(root, path)` 直拼、禁止信任未校验的相对路径。
- SQL **一律参数化**（`?` / 命名参数）；动态 `WHERE` 只拼静态片段，值走绑定。`ORDER BY` 的列名须白名单校验。
- 渲染层**禁止未经转义**使用 `dangerouslySetInnerHTML`；FTS `snippet()` 返回值必须先 HTML 转义再渲染。
- 新建 `BrowserWindow`/`WebContentsView` 必须 `contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true`；`preload` 仅暴露 `window.api`，不暴露 `ipcRenderer/process/require`。
- `shell.openExternal` 仅允许 `http(s)`。

## 数据库

- 时间戳列统一 `INTEGER` 存 epoch 毫秒（`Date.now()`）。

## 样式

token 源：`src/index.css` 的 `@theme`。语义色板（均有 `[data-theme='dark']` 暗色变体，自动生效）：`paper`/`paper-2..4`、`ink`/`ink-2..4`、`line`/`line-2`、`acorn`/`acorn-2`/`acorn-bg`、`leaf`/`leaf-bg`、`berry`/`berry-bg`、`sky`/`sky-bg`。

写法：`bg-[color:var(--color-paper-3)]`、`text-[color:var(--color-ink-2)]`、`border-[color:var(--color-line)]`；shadcn 组件内可用映射 token（`bg-primary` / `text-foreground` / `border-border` 等）。

- **禁止**在组件里写原始 `hex` / `oklch` / `rgb`——仅 canvas/SVG 等无法用 CSS 变量的场景例外。
- **禁止**为主题色手写 `dark:` 变体——暗色已由 `[data-theme='dark']` 自动切换。

## UI 组件

- **先复用、后扩展**：基础原语在 `src/components/ui/`（shadcn `new-york`），已有 button/dialog/input/select/tooltip/sheet/tabs 等。
- 合并类名用 `cn()`（`@/lib/utils`）。
- 扩展用 `cva` 加 variant，**不要 fork** 新组件替代已有原语。
- 确需新原语：用 shadcn CLI 按 `components.json` 别名添加，别手搓。

## 多语言

- 文件 `src/i18n/locales/{zh-CN,en-US}.json`，按功能命名空间（`common`/`library`/`editor`/`chat`/…）。
- 新增文案两文件同加 key；删功能两文件同删 key，别留孤儿。
- `t('ns.key', 'fallback', { var })`，插值 `{{var}}`。

## 代码风格

- prettier：单引号、**无分号**、`printWidth: 100`、`trailingComma: none`。
- 主进程日志用 `logger()`（`electron/obs/logger`），**勿用 `console.*`**。
- 信任边界（IPC handler 入参、解析主进程返回值）**勿用 `as any`** 掩盖类型；用类型守卫或 zod。
- IPC handler 直接 throw `IpcError(code, msg)`——`router.ts` 的 `wrap()` 已自动捕获+记栈+返回 `IpcResult<T>`；`code` 取 `IpcErrorCode`，别空 `catch {}` 吞错。
- 注释只写 why 不写 what。

## 完成前检查

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] 改了样式/组件：确认用的是 `index.css` token、复用 `src/components/ui/`，无原始色、无新造原语
- [ ] 改了主进程安全相关代码：对照「安全不变量」逐条复核
