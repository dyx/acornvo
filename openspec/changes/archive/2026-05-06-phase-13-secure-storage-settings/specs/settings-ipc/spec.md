## ADDED Requirements

### Requirement: settings IPC 命名空间

`shared/ipc-contract.ts` SHALL 声明 `settings` 命名空间，暴露到 renderer 的方法：

- `get(ns: 'general' | 'appearance' | 'ai' | 'browser') → Record<string, any>`
- `set(ns, patch) → { ok: true }`
- `ai.profiles.list() → Profile[]`
- `ai.profiles.create(input) → { id } | { error: 'E_DUPLICATE_NAME' | 'E_KEYCHAIN_UNAVAILABLE' }`
- `ai.profiles.update(id, patch) → { ok: true } | { error }`
- `ai.profiles.delete(id) → { ok: true }`
- `browser.clearCookies() → { ok: true }`

**MUST NOT** 暴露：

- `secret.get(key)` → 仅 main 内部
- `ai.profiles.getDecryptedKey(id)` → 仅 main 内部

#### Scenario: renderer 调 set

- **WHEN** renderer 调 `window.api.settings.set('appearance', { theme: 'dark' })`
- **THEN** IPC 到 main；main 调 settings-store.set；事件派发；返回 `{ ok: true }`

#### Scenario: renderer 无法调 secret.get

- **WHEN** renderer 尝试 `window.api.settings.secret.get(...)`
- **THEN** 方法不存在（preload 未注册）

### Requirement: renderer 订阅变更

main SHALL 在 `settings-store.onChange` 时广播 IPC 事件 `settings.changed` 到所有 renderer，带 payload `{ ns, key, newValue }`。renderer store 订阅后更新本地缓存。

#### Scenario: 订阅主题变化

- **WHEN** renderer A 订阅 `settings.changed`；renderer B 调 `settings.set('appearance', { theme: 'dark' })`
- **THEN** renderer A 收到 `{ ns: 'appearance', key: 'theme', newValue: 'dark' }`

### Requirement: 错误标准化

所有 settings IPC 的错误 MUST 遵循项目统一错误形状 `{ ok: false, error: { code, message } }`：

- `E_UNKNOWN_NAMESPACE`
- `E_DUPLICATE_NAME`（创建 profile name 冲突）
- `E_KEYCHAIN_UNAVAILABLE`
- `E_PROFILE_NOT_FOUND`

#### Scenario: 未知 ns

- **WHEN** renderer 调 `settings.get('foo')`
- **THEN** 返回 `{ ok: false, error: { code: 'E_UNKNOWN_NAMESPACE', message: ... } }`
