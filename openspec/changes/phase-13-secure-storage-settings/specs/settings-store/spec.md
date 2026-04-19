## ADDED Requirements

### Requirement: settings 表
migration 006 SHALL 创建：
```sql
CREATE TABLE settings (
  ns TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ns, key)
);
```
并把 `user_version` 设为 6。

#### Scenario: 迁移到 6
- **WHEN** 应用启动时 `PRAGMA user_version = 5`
- **THEN** migration 006 执行完成；`user_version = 6`；`settings` 表存在

### Requirement: get / set 语义
`settings-store` SHALL 提供：
- `get(ns) → Record<string, any>`：返回该 ns 下所有 key，**merge** 在 `DEFAULTS[ns]` 之上（用户值覆盖默认）；ns 必须在已知 ns 集合 `'general' | 'appearance' | 'ai' | 'browser'` 内
- `set(ns, patch: Record<string, any>) → void`：逐 key UPSERT；`updated_at = new Date().toISOString()`；发 `settings.changed` 事件带 `{ ns, patch, nextFull }` 载荷

#### Scenario: 缺失字段回退默认
- **WHEN** 用户未设过 `appearance.theme`
- **THEN** `get('appearance').theme` 返回默认值（'system'）

#### Scenario: 用户覆盖默认
- **WHEN** 用户调 `set('appearance', { theme: 'dark' })`
- **THEN** `get('appearance').theme === 'dark'`；事件 `settings.changed` 被派发

#### Scenario: 未知 ns 拒绝
- **WHEN** 调用 `get('unknown')` 或 `set('unknown', ...)`
- **THEN** 抛 `E_UNKNOWN_NAMESPACE`；不 touch DB

### Requirement: 订阅事件
`settings-store` SHALL 暴露 `onChange(listener)` 供 main 内部订阅。监听器接收 `{ ns, key, newValue, oldValue }`；一次 `set` 含多 key 触发多次回调。

#### Scenario: 订阅广告拦截变更
- **WHEN** main 的 browser-navigation 模块订阅 `settings.onChange`，过滤 `ns==='browser' && key==='blockAds'`
- **THEN** 用户在设置页切换开关时，该模块立刻收到回调并调整 webRequest 监听

### Requirement: 默认值模块
`electron/settings/defaults.ts` SHALL 导出常量 `DEFAULTS`：
```ts
general: { locale: 'zh-CN', autoBackup: 'off' }
appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' }
ai: { defaultProfileId: null }
browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
```
默认值 MUST NOT 被写入 `settings` 表（表内只有用户显式设过的字段）。

#### Scenario: 默认值只在 get 时 merge
- **WHEN** settings 表此时无任何 browser ns 行
- **THEN** `get('browser')` 仍返回 `{ blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }`；表内 row 数仍为 0
