## ADDED Requirements

### Requirement: safeStorage 加密后落 SQLite
migration 006 SHALL 同时建：
```sql
CREATE TABLE settings_secrets (
  key TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
```
`secrets-store.set(key, plainValue)` MUST 调 `safeStorage.encryptString(plainValue)` 得到 Buffer，UPSERT 到 `encrypted_value`。`secrets-store.get(key)` MUST 读 BLOB 再 `safeStorage.decryptString(buf)` 返回明文。

#### Scenario: 加密写入
- **WHEN** `secrets.set('ai.key.uuid-1', 'sk-abc123')`
- **THEN** `settings_secrets` 表有该 key 行；列 `encrypted_value` 为密文 BLOB；不等于明文字节

#### Scenario: 解密读取
- **WHEN** 同机器同用户后续调 `secrets.get('ai.key.uuid-1')`
- **THEN** 返回 `'sk-abc123'`

### Requirement: keychain 不可用时的降级
启动时 MUST 调 `safeStorage.isEncryptionAvailable()`；返回 false 时：
- `secrets.set` / `secrets.get` MUST 抛 `E_KEYCHAIN_UNAVAILABLE`
- 设置页 AI tab MUST 显示红色 banner "OS 密钥环不可用"
- 已存在的 secrets MUST 保持不动（不擦除）；用户换机器/恢复环境后可继续解密

#### Scenario: 加密不可用的 set
- **WHEN** `safeStorage.isEncryptionAvailable() === false`，调 `secrets.set`
- **THEN** 抛 `E_KEYCHAIN_UNAVAILABLE`；表未修改

#### Scenario: 设置页 banner
- **WHEN** 用户进入 /settings AI tab 且 keychain 不可用
- **THEN** 页面顶部红色 banner 文案 "OS 密钥环不可用，无法保存 API key"

### Requirement: 删除 secret
`secrets.delete(key)` MUST 从 SQLite 移除对应 row（若存在）；不存在时 no-op。

#### Scenario: 删除
- **WHEN** 调 `secrets.delete('ai.key.uuid-1')` 且该 key 存在
- **THEN** `settings_secrets` 表该 row 被删；后续 `secrets.get('ai.key.uuid-1')` 返回 `null`

#### Scenario: 删除不存在的 key
- **WHEN** 调 `secrets.delete('ai.key.notfound')`
- **THEN** 无错误；表未变

### Requirement: 不暴露明文到 renderer
`secrets.get` IPC handler MUST NOT 注册到 preload 的 `contextBridge.exposeInMainWorld` 中。renderer 任何时候都 MUST NOT 能拿到明文 API key。需要 key 的调用（phase 15/16 LLM 请求）MUST 在 main 进程内完成。

#### Scenario: renderer 无法读取
- **WHEN** renderer 尝试访问 `window.api.settings.secret.get(...)`
- **THEN** 该方法不存在；TypeScript 编译期拒绝；运行期 undefined
