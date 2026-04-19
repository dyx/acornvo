## Context

前置：
- phase 1：主题 + locale 占位在 root store 内存态
- phase 3：better-sqlite3 + migrations
- phase 11：广告拦截硬编码 `blockAds = true`
- phase 12：剪藏目录硬编码 `inbox/`

PRD S-9 要求 API Key 不落 DB，用 OS 原生加密存储。

## Goals / Non-Goals

**Goals:**
- 用户在 `/settings` 查看与修改应用行为；设置持久化
- 敏感值（API key）经由 OS keychain 加密存储；DB 中只保存指针 `keyRef`
- 多 AI provider profile 可配置，选默认；phase 15/16 只消费这份数据
- 设置变更实时生效（ad block 开关瞬间影响 webRequest；主题切换无需重启）

**Non-Goals:**
- 不做 settings 导入/导出（phase 后续加）
- 不做 cloud sync
- 不做 OAuth / OpenID 登录 provider（profile 仅支持 API key）
- 不做本地 LLM 安装引导（只填 baseUrl + model；用户自己装）
- 不做密码强度校验 / 2FA（API key 本身是不对称的）
- 不做"隐私模式" 无痕窗口（phase 11 已定）

## Decisions

### D1: 敏感存储 — `safeStorage` over `keytar`

两个方案：
- **keytar**：跨平台 node native 绑定到 macOS Keychain / Windows Credential Manager / libsecret。缺点：native module，需 electron-rebuild；某些 Linux 发行版缺 libsecret 提示较丑
- **Electron `safeStorage.encryptString(str)` / `decryptString(buf)`**：Electron 15+ 内置；macOS 用 Keychain + AES256-GCM；Windows DPAPI；Linux 用 libsecret 或 fallback plaintext。**采纳**

**理由**：无额外依赖；Electron 官方维护；隔离"加密"与"写哪"（safeStorage 负责加密，我们负责把密文存 SQLite）；更新代价低。

**实现**：
```ts
// electron/settings/secrets.ts
if (!safeStorage.isEncryptionAvailable()) {
  // Linux 无 libsecret；提示用户并拒绝存 secret
  throw new Error('E_KEYCHAIN_UNAVAILABLE');
}
const enc = safeStorage.encryptString(plainValue); // Buffer
// Buffer 存 SQLite 表 settings_secrets (key TEXT PK, encrypted_value BLOB)
```
- 存储位置：单独 `settings_secrets` 表（BLOB 列）；与非敏感 `settings` 表分离避免误读
- `keyRef`：UUID（v4），表 `ai_provider_profiles.api_key_ref` 指向 `settings_secrets.key`
- 明文永远不写 SQLite；`settings_secrets.encrypted_value` 只有 Electron 同机器、同用户能解

**Trade-off**：Linux 用户无 libsecret 环境下 secret 功能不可用（只能用非登录 Ollama 本地 endpoint 不需要 key）；提示明确即可

### D2: 非敏感 settings schema

`settings` 表用 **namespace + key** 二级模型：
```sql
CREATE TABLE settings (
  ns TEXT NOT NULL,          -- 'general' | 'appearance' | 'ai' | 'browser'
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,  -- JSON-serialized
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ns, key)
);
```
**理由**：k-v 简单；单条读写便捷；namespace 区分让 `settings.get('browser')` 一次性拿回一个 tab 的全部字段。

### D3: 默认值与 "设置缺失" 回退

- `electron/settings/defaults.ts` 导出默认 map：
  ```ts
  export const DEFAULTS = {
    general: { locale: 'zh-CN', autoBackup: 'off' },
    appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
    ai: { defaultProfileId: null },
    browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
  };
  ```
- `settings.get(ns)`：左连默认值（用户未设过的字段回退到 default）
- 迁移时不预插默认值；只在读取时 merge

### D4: AI provider profile schema

```sql
CREATE TABLE ai_provider_profiles (
  id TEXT PRIMARY KEY,           -- uuid
  name TEXT NOT NULL,            -- 用户自定义名，"openai-prod"
  provider TEXT NOT NULL,        -- 'openai' | 'anthropic' | 'ollama' | 'openai-compatible'
  base_url TEXT,                 -- 自定义 provider 时必填
  model TEXT NOT NULL,
  temperature REAL DEFAULT 0.7,
  top_p REAL DEFAULT 1.0,
  max_tokens INTEGER,
  api_key_ref TEXT,              -- UUID 指向 settings_secrets.key；ollama 可为 null
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_profiles_name ON ai_provider_profiles(name);
```
默认 profile id 存 `settings.ai.defaultProfileId`。

CRUD IPC：
- `settings.ai.profiles.list() → Profile[]`（**不含** apiKey，只带 apiKeyRef）
- `settings.ai.profiles.create(input) → { id }`（若 input 含 apiKey 则先存 secret 拿到 ref，再 insert 行）
- `settings.ai.profiles.update(id, patch)`（patch.apiKey 触发 secret 覆盖）
- `settings.ai.profiles.delete(id)`（同时 delete 对应 secret）
- `settings.ai.profiles.getDecryptedKey(id) → string | null`（供 phase 15/16 请求 LLM 前用；**只允许 main 进程内部调**，不暴露到 renderer 的 `window.api` 上）

### D5: Settings 页结构

路由 `/settings`；内嵌子路由（或状态 driven tab 切换）：
```
/settings
├── /general
├── /appearance
├── /ai
└── /browser
```
- 左侧 tab 列表（60px 宽 icon + 标签），右侧详情区
- 每个 tab 的字段有 `onChange` 立即写 store + 发 IPC `settings.set(ns, patch)`（debounce 300ms 合并）
- 对于 AI profile 的 key，保存按钮单独触发（否则每按一键都 keychain 写）

### D6: 热更新生效

- 广告拦截开关：main 订阅 `settings.browser.blockAds` 变更；真变更 → 添加 / 移除 `session.webRequest.onBeforeRequest` handler
- 主题：renderer store 订阅；`document.documentElement.setAttribute('data-theme', value)`，无需重启
- locale：renderer 监听；i18n 切换资源包；无需重启
- editor 字体：phase 7 Vditor 监听；重新应用 CSS var

不支持热更新的（本阶段没有）：API key 变化 → 下次 LLM 调用直接取新值即可，无需重启

### D7: 设置入口

- 路由：`/settings`
- 入口位置：
  - AppRail 底部"齿轮"按钮（phase 11 AppRail 增加底部 slot）
  - 快捷键 `Cmd/Ctrl+,`（macOS 约定）

### D8: 安全审查

- `settings.secret.set` IPC 不回显明文；set 后只返回 `{ ok: true }`
- `settings.secret.get` MUST NOT 暴露到 renderer 的 `contextBridge.api`；renderer 永不解密，只在表单里保留"已保存"占位态（密码框只在新建/编辑时保留输入的 plain；提交后即清空内存态）
- key 在 AI profile UI 展示为 `••••••••`；重填才覆盖，空提交不动
- 删除 profile → 同时调 `secrets.delete(keyRef)`；避免孤儿 secret
- 启动时：如果 keychain 不可用（`safeStorage.isEncryptionAvailable() === false`），AI tab 顶部显红底条 "OS 密钥环不可用，无法保存 API key"，仍允许保存无密钥 profile（ollama 本地）

### D9: i18n key

```
settings.title
settings.tab.general / appearance / ai / browser
settings.general.locale / autoBackup / vaultPath
settings.appearance.theme / fontScale / editorFont
settings.ai.profiles / addProfile / editProfile / deleteProfile / setDefault / name / provider / baseUrl / model / temperature / apiKey / save
settings.browser.blockAds / clipImages / clearCookies / searchEngine
settings.secret.saved / settings.secret.unavailable
```

### D10: 清除 cookies / 数据

设置 `browser.clearCookies` 按钮：
- 调 main 的 `session.fromPartition('persist:browser-default').clearStorageData({ storages: ['cookies'] })`
- 确认框 "确定清除所有站点的登录态？"

phase 11 的 persistent session 分区名与这里对齐。

## Risks / Trade-offs

- [safeStorage Linux 无 libsecret → 加密不可用] → UI 红色 banner 明确提示；支持无 key 的本地 provider
- [设置热更新漏监听导致旧值继续生效] → 所有影响 runtime 的 setting MUST 走 "设置 → 事件 bus → 订阅方" 模式；订阅方集中注册在 main bootstrap
- [DB 里 settings_secrets 的 encrypted_value 若泄露] → safeStorage 绑到当前 OS 用户；迁移到另一台机器解不开；用户需重新填
- [AI profile 删除后 secret 孤儿] → 事务（先 delete profile 成功再 delete secret；反之倒置会留孤儿，采用后删 profile 前删 secret 策略并在失败回滚 profile 状态）
- [`Cmd+,` 与 macOS 原生 preferences 冲突] → Electron 接管菜单时原生行为会被 override；正常

## Migration Plan

- migration 006 建 `settings` / `ai_provider_profiles` / `settings_secrets` 表
- 无需迁移既有 data（phase 13 前未有 settings 存储）
- phase 11 广告拦截：更新 main 初始化代码读 settings；若字段缺失取 default=true（行为一致）
- 回滚：删 migration 006；移除 `/settings` 路由；广告拦截回硬编码 true

## Open Questions

- 是否允许多默认 profile（reviewer 用 A，chat 用 B）？→ **允许**，profile picker 在 phase 15 / 16 各自入口使用；本阶段只需存 `ai.defaultProfileId`
- ollama 的 base URL 默认 `http://localhost:11434`？→ **预填**，用户可改
- "清除数据"是否包含 vault 文件？→ **不包含**；只是浏览器 session / cache；vault 永远用户自管
