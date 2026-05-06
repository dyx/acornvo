## ADDED Requirements

### Requirement: ai_provider_profiles 表
migration 006 SHALL 同时建：
```sql
CREATE TABLE ai_provider_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT,
  model TEXT NOT NULL,
  temperature REAL DEFAULT 0.7,
  top_p REAL DEFAULT 1.0,
  max_tokens INTEGER,
  api_key_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_ai_profiles_name ON ai_provider_profiles(name);
```
`provider` 允许值：`'openai' | 'anthropic' | 'ollama' | 'openai-compatible'`。

#### Scenario: 表存在
- **WHEN** migration 006 完成
- **THEN** `ai_provider_profiles` 表 + `idx_ai_profiles_name` 索引存在

#### Scenario: name 唯一
- **WHEN** 尝试插入两个 name = 'prod' 的 profile
- **THEN** 第二个 INSERT 抛 UNIQUE 约束错误

### Requirement: CRUD + key 管理
`settings.ai.profiles` 命名空间 SHALL 提供：
- `list() → Profile[]`（含 `apiKeyRef` 字段，但 NOT 含明文 apiKey）
- `create({ name, provider, baseUrl?, model, temperature?, topP?, maxTokens?, apiKey? }) → { id }`：
  - 生成 UUID id
  - 若 `apiKey` 非空：先调 `secrets.set('ai.key.' + id, apiKey)`；把 `api_key_ref = 'ai.key.' + id` 写入行
  - name 冲突 → 返回 `{ error: 'E_DUPLICATE_NAME' }`
- `update(id, patch)`：
  - 若 patch.apiKey 为非空字符串 → 覆盖 secret
  - 若 patch.apiKey 为 `''`（空字符串）→ 清除 secret + 置 api_key_ref NULL
  - 若 patch.apiKey 为 undefined → 不动 key
- `delete(id)`：先 `secrets.delete(api_key_ref)`（若有）；再 DELETE 行；事务内；失败回滚

#### Scenario: create 带 key
- **WHEN** 调 `profiles.create({ name: 'p1', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-123' })`
- **THEN** 返回 `{ id }`；`ai_provider_profiles` 行有 `api_key_ref = 'ai.key.' + id`；`settings_secrets` 对应 key 有加密值

#### Scenario: list 不含明文
- **WHEN** 调 `profiles.list()`
- **THEN** 返回每个 profile 都含 `apiKeyRef` 字段；没有 `apiKey` 字段

#### Scenario: update 覆盖 key
- **WHEN** 调 `profiles.update(id, { apiKey: 'sk-new' })`
- **THEN** `settings_secrets[api_key_ref]` 的 encrypted_value 变化；解密后为 'sk-new'

#### Scenario: update 清除 key
- **WHEN** 调 `profiles.update(id, { apiKey: '' })`
- **THEN** `settings_secrets` 中该 key 行被删；profile 的 api_key_ref 置 NULL

#### Scenario: delete 级联 secret
- **WHEN** 调 `profiles.delete(id)` 且该 profile 有 api_key_ref
- **THEN** 事务内先删 secret 再删 profile；两个表都不再有对应 row；若 secret 删失败则 profile row 保留

### Requirement: main 内部解密接口
main 进程内部 SHALL 提供 `getProfileDecryptedKey(id) → string | null`：
- 读取 profile.api_key_ref
- ref 为 NULL → 返回 null
- 否则调 `secrets.get(ref)` 返回明文

MUST NOT 暴露到 renderer 的 IPC preload；仅供 main 内其他模块（phase 15 reviewer、phase 16 chat agent）在发起 LLM 请求前调用。

#### Scenario: 内部拿 key
- **WHEN** phase 15 reviewer 在 main 内调 `getProfileDecryptedKey('uuid-1')`
- **THEN** 返回明文字符串；该调用在 main 进程内合法

#### Scenario: renderer 无此入口
- **WHEN** renderer 尝试 `window.api.settings.ai.profiles.getDecryptedKey(...)`
- **THEN** 该方法不存在；任何对 secret 的读取都只能在 main 侧完成

### Requirement: 默认 profile
`settings.ai.defaultProfileId` SHALL 指向一个已存在的 profile id（或 null）。删除一个 profile 时若它恰好是默认：
- 有其他 profile → 把 defaultProfileId 改为第一个剩余 profile 的 id
- 没有其他 profile → defaultProfileId 置 null

#### Scenario: 删除默认 profile 后自动切换
- **WHEN** 删除 id='a' 的 profile，且此时 `defaultProfileId = 'a'`，存在另一 profile 'b'
- **THEN** 删除完成后 `defaultProfileId = 'b'`

#### Scenario: 删除最后一个 profile
- **WHEN** 仅剩一个 profile 'a' 被删
- **THEN** `defaultProfileId = null`
