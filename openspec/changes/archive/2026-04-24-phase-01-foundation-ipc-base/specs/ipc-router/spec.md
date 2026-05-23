## ADDED Requirements

### Requirement: 类型安全的 IPC 契约

系统 SHALL 以单一 TypeScript 契约文件 `shared/ipc-contract.ts` 定义所有 IPC 命名空间与方法签名（输入/输出类型）。主进程 handler 注册 MUST 从契约派生类型；preload 暴露的 `window.api` MUST 与契约保持一致。

#### Scenario: 契约漂移被编译器捕获

- **WHEN** 开发者在主进程注册了一个命名空间/方法但未在契约中声明
- **THEN** TypeScript 编译失败
- **WHEN** 渲染端调用契约中不存在的 `window.api.xxx.yyy`
- **THEN** TypeScript 编译失败

### Requirement: 统一错误形状

所有 IPC 调用 SHALL 以 `{ ok: true, data }` 或 `{ ok: false, error: { code: string, message: string } }` 的形状返回。`code` MUST 为稳定字符串常量（至少涵盖 `E_INTERNAL` / `E_INVALID_ARGS` / `E_NOT_FOUND` / `E_PERMISSION`）。渲染端客户端 MUST 自动把 `ok: false` 转化为抛出 `IpcError`（携带 `code` 与 `message`）。

#### Scenario: handler 抛异常

- **WHEN** 主进程 handler 内部抛出未捕获异常
- **THEN** IPC 调用方收到 `{ ok: false, error: { code: 'E_INTERNAL', message: <异常消息> } }`
- **AND** 主进程日志记录完整堆栈

#### Scenario: 渲染端错误类型

- **WHEN** 渲染端调用 `window.api.<ns>.<method>()` 且主进程返回 `ok: false`
- **THEN** Promise reject 一个 `IpcError` 实例，可通过 `e.code` 稳定区分错误种类

### Requirement: preload 白名单

preload 脚本 SHALL 通过 `contextBridge.exposeInMainWorld('api', ...)` 仅暴露契约中声明的命名空间与方法。渲染端 MUST 无法访问 `ipcRenderer`、`require`、`process`、`Buffer` 等 Node 原语。

#### Scenario: renderer 无法越权

- **WHEN** 渲染端尝试访问 `window.ipcRenderer` 或 `window.require`
- **THEN** 值为 `undefined`

#### Scenario: 未白名单方法不可调用

- **WHEN** 渲染端尝试调用 `window.api.unknown.method()`
- **THEN** TypeScript 编译失败；运行时 `window.api.unknown` 为 `undefined`

### Requirement: 基线 ping 接口

系统 SHALL 内建 `ping` 命名空间用于验证 IPC 管道健康：`ping.echo(input: string): string` 原样回显输入。

#### Scenario: ping 回显

- **WHEN** 渲染端调用 `window.api.ping.echo('hello')`
- **THEN** 返回 `'hello'`
