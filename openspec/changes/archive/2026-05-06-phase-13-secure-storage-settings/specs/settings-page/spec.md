## ADDED Requirements

### Requirement: `/settings` 路由页

`src/pages/Settings.tsx` SHALL 挂载到路由 `/settings`，并 SHALL 布局为左侧 tab 列表（60px 宽，icon + 标签）+ 右侧详情区的双栏。Tab 顺序：通用 → 外观 → AI → 浏览器。tab 切换用子路由 `/settings/general` / `/settings/appearance` / `/settings/ai` / `/settings/browser`，默认重定向 `/settings` → `/settings/general`。

#### Scenario: 打开设置页

- **WHEN** 用户 navigate 到 `/settings`
- **THEN** 页面渲染双栏；默认显示"通用" tab；URL 重定向到 `/settings/general`

#### Scenario: 切 tab

- **WHEN** 用户点击"外观"
- **THEN** navigate 到 `/settings/appearance`；右侧区域切换为外观字段

### Requirement: 通用 tab

通用 tab SHALL 包含：

- `locale`：下拉选择 `zh-CN` / `en-US`；onChange 立即写 settings
- `autoBackup`：占位（disabled + tooltip "即将推出"）
- `vaultPath`：只读文本 + 复制按钮（值来自 phase 2）

#### Scenario: 切语言

- **WHEN** 用户从 zh-CN 切到 en-US
- **THEN** `settings.set('general', { locale: 'en-US' })`；i18n 切资源；页面文案实时变英文

### Requirement: 外观 tab

外观 tab SHALL 包含：

- `theme`：三选一 system / light / dark（radio 或 segmented control）
- `fontScale`：slider 0.8 → 1.4，步长 0.1
- `editorFont`：下拉（系统字体列表取 `queryLocalFonts`，失败 fallback 固定列表 `['system-ui','Georgia','SF Mono','Courier New']`）

#### Scenario: 切换主题

- **WHEN** 用户选 dark
- **THEN** `settings.set('appearance', { theme: 'dark' })`；`document.documentElement[data-theme='dark']` 立即生效

#### Scenario: 字号

- **WHEN** slider 从 1.0 拖到 1.2
- **THEN** 300ms debounce 后 `settings.set('appearance', { fontScale: 1.2 })`；CSS var `--font-scale` 同步更新

### Requirement: AI tab

AI tab SHALL 展示：

- 顶部 banner：若 keychain 不可用显示红底 "OS 密钥环不可用"
- "添加 profile" 按钮；profile 列表（卡片形式，每张显示 name / provider / model / 默认 badge）
- 每个 profile 卡片含"编辑" / "删除" / "设为默认" 按钮
- 编辑 modal 字段：name / provider（select）/ baseUrl（可选）/ model / temperature（slider 0-2，默认 0.7）/ topP（0-1，默认 1.0）/ maxTokens（number input 可空）/ apiKey（password input）

apiKey input MUST 在进入编辑态时显示为空（而非 `••••••`），空提交保持原值；输入非空则覆盖。

#### Scenario: 添加 profile

- **WHEN** 用户点"添加" → 填 name='openai-prod' / provider='openai' / model='gpt-4o' / apiKey='sk-xxx' → 保存
- **THEN** `profiles.create` 成功；列表 prepend 新卡片；输入的 apiKey 被清空（不再驻留 renderer 内存）

#### Scenario: 设为默认

- **WHEN** 用户在 profile B 上点"设为默认"
- **THEN** `settings.set('ai', { defaultProfileId: <B.id> })`；A 的默认 badge 消失，B 显示

#### Scenario: name 冲突

- **WHEN** 新建的 name 与已存在的相同
- **THEN** UI 显示错误 "名称已被占用"

### Requirement: 浏览器 tab

浏览器 tab SHALL 含：

- `blockAds`：toggle（默认 on）
- `clipImagesLocalize`：toggle（默认 off，带 tooltip "即将推出" 标签但不 disabled，设为 true 时 phase 13 仍 no-op 但存值）
- `searchEngine`：三选一 google / bing / duckduckgo（默认 google；影响 AddressBar 非 URL 输入的跳转）
- "清除 cookies" 按钮 + 确认对话框

#### Scenario: 关闭广告拦截

- **WHEN** 用户把 blockAds toggle 切到 off
- **THEN** `settings.set('browser', { blockAds: false })`；phase 11 的 webRequest 监听立刻移除；页面所有请求放行

#### Scenario: 清除 cookies

- **WHEN** 用户点"清除 cookies" → 确认
- **THEN** `settings.browser.clearCookies()` IPC 调用 `session.clearStorageData({ storages: ['cookies'] })`；toast "已清除"

### Requirement: 设置入口与快捷键

AppRail 底部 SHALL 有齿轮图标，点击 navigate `/settings`；全局快捷键 `Cmd/Ctrl+,` SHALL 打开 `/settings`。

#### Scenario: 齿轮入口

- **WHEN** 用户点 AppRail 底部齿轮
- **THEN** navigate `/settings`

#### Scenario: Cmd+, 打开

- **WHEN** 用户在任何页面按 `Cmd+,`
- **THEN** navigate `/settings`
