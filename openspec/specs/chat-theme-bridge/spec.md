## ADDED Requirements

### Requirement: XProvider 包根
`App.tsx` 顶层 SHALL 用 `@ant-design/x` 的 `XProvider` 包含整个应用根节点。XProvider 接收 `theme: { token, components }` 与 `locale` 两个 prop。其他页面（Library / Browse / Editor / History / Settings / Search）渲染在 XProvider 内 NOT 受副作用影响——这些页面不引入 antd 组件，视觉保持现状。

#### Scenario: XProvider 渲染
- **WHEN** App 挂载
- **THEN** XProvider 包根渲染；children 接收 antd ConfigProvider 上下文

#### Scenario: 非 chat 页不受影响
- **WHEN** 用户切到 Library / Browse / Editor 等非 chat 页
- **THEN** 这些页面仍按 Tailwind / Radix / 自定义 CSS 变量渲染，视觉无差异

### Requirement: CSS 变量 → antd token 映射
`src/lib/theme.ts` SHALL 导出 `themeTokens` 对象（类型 `ThemeConfig['token']`），至少含以下条目（值为 `'var(--xxx)'` 字符串或字面值）：

- `colorBgContainer`: `'var(--color-paper)'`
- `colorBgLayout`: `'var(--color-paper-2)'`
- `colorBorder`: `'var(--color-line)'`
- `colorText`: `'var(--color-ink)'`
- `colorTextSecondary`: `'var(--color-ink-3)'`
- `fontFamily`: `'"Source Han Serif SC", serif'`
- `borderRadius`: 数字 `6`

`src/index.css` 中既有 CSS 变量定义与 light/dark 切换逻辑（`body` 类切换或 `prefers-color-scheme` 监听）MUST 不动。

#### Scenario: light mode 渲染
- **WHEN** body 类为 light（或无 dark 类）
- **THEN** Bubble 背景色 = 当前 `--color-paper` 解析值

#### Scenario: dark mode 切换
- **WHEN** 用户切换到 dark mode
- **THEN** CSS 变量自动更新；antd / antd-x 组件背景与文字色跟随；XProvider NOT 需要 remount

#### Scenario: 已知派生 token 限制
- **WHEN** antd 内部从 colorPrimary 派生 hover/focus 色变种
- **THEN** 派生色基于字面值算 HSL，CSS 变量会成不透明字符串；hover 色可能在 dark mode 下不同步。该限制是已知 trade-off，覆盖范围限于 hover/focus 派生色

### Requirement: antd locale 桥
XProvider 的 `locale` SHALL 根据 `i18n.language` 切换：`zh*` 开头 → antd `zhCN`；其他 → antd `enUS`。`i18n.language` 变化时 locale MUST 跟着变（通过订阅 `i18n.on('languageChanged')` 或 `useTranslation` 间接触发 re-render 实现），XProvider key 保持稳定不重挂载。

业务字符串（如 `t('chat.untitled')`、`t('approval.approve')`）仍走 react-i18next；antd 内置字符串（Modal OK/Cancel、Attachments 默认提示等）由 antd locale 提供。

#### Scenario: 中文 locale
- **WHEN** i18n.language = 'zh-CN'
- **THEN** XProvider.locale = zhCN；antd Modal 默认按钮显示 "确定" / "取消"

#### Scenario: 英文 locale
- **WHEN** i18n.language = 'en-US'
- **THEN** XProvider.locale = enUS；antd Modal 默认按钮显示 "OK" / "Cancel"

#### Scenario: 运行时切换
- **WHEN** 用户从中文切换到英文
- **THEN** App 不重新挂载；XProvider.locale prop 更新为 enUS；antd 内置字符串立即切换；i18n 业务键也同步刷新
