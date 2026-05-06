## 1. 依赖与 schema

- [x] 1.1 `migrations/006_settings.sql`：建 `settings` / `settings_secrets` / `ai_provider_profiles` 表 + 索引；`user_version = 6`
- [x] 1.2 `shared/settings-types.ts`：`GeneralSettings` / `AppearanceSettings` / `AiSettings` / `BrowserSettings` / `AiProviderProfile`
- [x] 1.3 `electron/settings/defaults.ts`：DEFAULTS 常量
- [x] 1.4 启动检查：`safeStorage.isEncryptionAvailable()` 结果缓存到模块状态

## 2. 存储层

- [x] 2.1 `electron/settings/store.ts`：`get(ns)` / `set(ns, patch)`；内部 EventEmitter 派发 `onChange`
- [x] 2.2 `electron/settings/secrets.ts`：`set(key, plain)` / `get(key)` / `delete(key)`；基于 safeStorage + SQLite BLOB；不可用时抛 `E_KEYCHAIN_UNAVAILABLE`
- [x] 2.3 `electron/settings/profiles.ts`：profiles CRUD；事务内处理 secret 级联
- [x] 2.4 `electron/settings/profile-key.ts`：`getProfileDecryptedKey(id)` main-only 导出

## 3. IPC

- [x] 3.1 `shared/ipc-contract.ts`：`settings.get/set`；`settings.ai.profiles.*`；`settings.browser.clearCookies`
- [x] 3.2 `electron/ipc/settings.ts`：handlers + 统一错误封装
- [x] 3.3 preload：暴露 `window.api.settings.*`；**明确排除** `secret.*` 与 `getDecryptedKey`
- [x] 3.4 renderer 订阅：main `broadcast('settings.changed', payload)`；preload `onSettingsChanged(cb)`

## 4. renderer store 与页面

- [x] 4.1 `src/stores/settings.ts`：启动时 `settings.get('general'/'appearance'/'ai'/'browser')` 四连；维护本地缓存；订阅 `settings.changed` 合并
- [x] 4.2 `src/pages/Settings.tsx` 双栏布局 + 子路由；redirect `/settings` → `/settings/general`
- [x] 4.3 `src/components/settings/GeneralTab.tsx`：locale / autoBackup / vaultPath
- [x] 4.4 `src/components/settings/AppearanceTab.tsx`：theme / fontScale / editorFont；theme 变化 `documentElement.dataset.theme`
- [x] 4.5 `src/components/settings/AiTab.tsx`：profiles list + 添加/编辑 modal + 设默认；keychain 不可用 banner
- [x] 4.6 `src/components/settings/BrowserTab.tsx`：blockAds / clipImagesLocalize / searchEngine / 清除 cookies
- [x] 4.7 `src/components/settings/ProfileDialog.tsx`：apiKey 空串 ↔ 覆盖语义

## 5. 热更新订阅

- [x] 5.1 `electron/browser/ad-block.ts`：启动读 blockAds；订阅 onChange 动态添加/移除 `onBeforeRequest`
- [x] 5.2 renderer 根组件订阅 `settings.changed` → 主题 / 字号 / locale 实时 apply
- [x] 5.3 phase 12 剪藏目录 & searchEngine 占位（读设置但行为暂与 phase 12 / 11 保持一致）

## 6. App-shell 接线

- [x] 6.1 AppRail 底部 slot：齿轮图标 → `/settings`；active 态样式
- [x] 6.2 `/settings` 路由注册；phase 1 占位页移除
- [x] 6.3 全局快捷键 `Cmd/Ctrl+,` → `navigate('/settings')`

## 7. i18n

- [x] 7.1 添加 `settings.*` keys（见 design D9）

## 8. 安全审查

- [x] 8.1 写单测/手测：profile CRUD 不在 list 返回 `apiKey`
- [x] 8.2 手动用 `window.api.settings.secret` 验证 renderer 拿不到明文
- [x] 8.3 删除 profile 后用 `secrets.get(oldRef)` 验证返回 null

## 9. 验收

- [x] 9.1 `/settings` 路由存在；双栏布局渲染；默认 general tab
- [x] 9.2 切主题 dark → 全局 `data-theme=dark` 立即生效；重启后保持
- [x] 9.3 切语言 en-US → 全部文案英文
- [x] 9.4 字号 slider 拖 1.2 → `--font-scale: 1.2` 立即生效
- [x] 9.5 AI tab 添加 openai profile 带 key → 列表出现；`ai_provider_profiles` 行存在；`settings_secrets` 有加密 BLOB
- [x] 9.6 编辑 profile 不填 key 保存 → 原 key 保留（main 仍能解密为原值）
- [x] 9.7 编辑 profile 清空 key 保存 → secret row 删除
- [x] 9.8 删除 profile → profile row 删；对应 secret row 删；若为默认则 defaultProfileId 切换或置空
- [x] 9.9 AI tab 名称冲突 → UI 报 "名称已被占用"
- [x] 9.10 关闭广告拦截 → phase 11 页面内请求不再被 cancel（验证 googletagmanager 可达）
- [x] 9.11 重开广告拦截 → 请求重新被 cancel
- [x] 9.12 清除 cookies → 再访问已登录站点需重新登录
- [x] 9.13 keychain 不可用的环境 → AI tab banner 显示；添加带 key 的 profile 失败并提示
- [x] 9.14 renderer devtools 尝试 `window.api.settings.secret` → undefined
- [x] 9.15 `Cmd+,` 任何页面都能打开 settings
- [x] 9.16 `openspec validate phase-13-secure-storage-settings --strict` 通过
