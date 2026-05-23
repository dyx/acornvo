## Why

后续阶段（phase 15 AI reviewer、phase 16 松语 agent）需要调用外部 LLM：

- 必须存 API key（OpenAI / Anthropic / 本地兼容 endpoint 等）
- 必须允许用户切换 provider / model / base URL / 温度等
- 不能把 key 明文写进 JSON / SQLite

同时 phase 11 / 12 / 14 零散的"默认开启广告拦截 / 固定 inbox 目录 / 队列并发度硬编码"都应该收口到**用户可见的设置页**。没有设置页，后续阶段只能继续写死，用户无法自定义。PRD P-6 / S-9 明确要求"设置与密钥安全，API Key 存于 OS keychain 不在 DB"。

## What Changes

- 新建 `/settings` 路由与页面（分 4 tab：通用 / 外观 / AI / 浏览器）
- 引入 OS keychain 存储：macOS Keychain、Windows Credential Manager、Linux libsecret；用 `keytar` 或 Electron 内置 `safeStorage.encryptString` 二选一（下方 design 决定）
- 非敏感 settings 存 SQLite `settings` 表（key-value JSON）；敏感 API key 存 keychain
- 设置模型：`generalSettings` / `appearanceSettings` / `aiSettings` / `browserSettings`（均 Zustand + 持久化）
- 暴露 IPC：`settings.get(namespace)` / `settings.set(namespace, patch)` / `settings.secret.get(key)` / `settings.secret.set(key, value)` / `settings.secret.delete(key)`
- AI tab 可添加 / 编辑 / 删除 **多个 provider profile**（OpenAI、Anthropic、Ollama、自定义 OpenAI-compatible）；每个 profile 含 `id / name / provider / baseUrl / model / temperature / topP / maxTokens / apiKeyRef`
- 浏览器 tab：广告拦截开关、剪藏图片本地化开关（占位）、清除 cookies 按钮
- 通用 tab：语言、自动备份频率占位、vault 路径显示（只读，phase 2 已定）
- 外观 tab：主题（system/light/dark）、字号缩放、编辑器字体选择
- migration 006：`settings` 表 + `ai_provider_profiles` 表
- 连带改造：phase 11 广告拦截开关由硬编码改为读 `browserSettings.blockAds`；phase 12 剪藏目录保留 `inbox/YYYYMM/` 但预埋将来可配置的 setting key（本阶段仍 `inbox/`）；phase 16 之前的 `aiSettings` 可先空

## Capabilities

### New Capabilities

- `settings-store`: SQLite `settings` 表 + CRUD + 命名空间模型
- `secrets-store`: 基于 OS keychain 的加密敏感值存取
- `settings-page`: `/settings` 路由与四个 tab UI
- `ai-provider-profiles`: 多 provider profile 的管理 + 默认 profile 选择
- `settings-ipc`: `settings` / `settings.secret` IPC 契约

### Modified Capabilities

- `browser-navigation`: 广告拦截开关从硬编码改为读 `browserSettings.blockAds`，关闭时移除 `onBeforeRequest` 监听或放行
- `app-shell`: 路由补齐 `/settings` 真实页面（不再占位）；AppRail 增加"设置"入口（底部位置）

## Impact

- `package.json` 新增 `keytar`（或放弃 keytar 用 `safeStorage`，详见 design D1）
- `migrations/006_settings.sql`：`settings` + `ai_provider_profiles` 表
- `electron/settings/`：`store.ts`（SQLite）、`secrets.ts`（keychain）、`defaults.ts`（初始值）
- `electron/ipc/settings.ts`
- `src/pages/Settings.tsx` + `src/components/settings/*`
- `src/stores/settings.ts`
- `shared/settings-types.ts`
- 主题切换：phase 1 root store 的 `theme` 从内存改为从 settings 拉初始值 + 变更反持久化
- 验收上 phase 15 AI reviewer 与 phase 16 chat agent 将使用 `ai-provider-profiles` 的默认 profile；本阶段不依赖 AI
- **Trade-off**：keychain 需要 native module rebuild（electron-rebuild）；会稍微延长 CI 时间
