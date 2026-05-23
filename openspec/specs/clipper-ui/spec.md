## ADDED Requirements

### Requirement: 剪藏预览 Modal

`src/components/browser/ClipPreviewDialog.tsx` SHALL 在 pipeline 的 `previewing` 状态弹出，含：

- 顶部：可编辑 `title` 输入、只读 url（含复制按钮）
- 左栏：`tags` 逗号分隔输入、`site` / `author` / `published_at` 只读展示、`excerpt` 可编辑
- 右栏：Markdown body 预览（前 2000 字符），`max-height: 60vh`，可滚动
- 底部：目标路径（只读 `inbox/YYYYMM/<slug>.md`）、"保存"、"取消"、"重新抽取"

用户点"保存"→ 调用 pipeline 的 save 阶段；点"取消"→ pipeline 置 canceled；点"重新抽取"→ pipeline 回到 extract 阶段重跑。

#### Scenario: 打开 modal

- **WHEN** pipeline 抽取成功进入 `previewing`
- **THEN** ClipPreviewDialog 挂载；表单字段用 extract 结果预填；body 预览显示转换后 md 前 2000 字

#### Scenario: 保存

- **WHEN** 用户在 modal 编辑 tags "ai,news" → 点"保存"
- **THEN** pipeline 写入 `inbox/YYYYMM/<slug>.md`，frontmatter.tags=`['ai','news']`；modal 关闭；toast 显示 "已剪藏"

#### Scenario: 取消

- **WHEN** 用户点"取消"
- **THEN** pipeline 置 `canceled`；modal 关闭；不产生任何文件或 clips 行

#### Scenario: 重新抽取

- **WHEN** 用户点"重新抽取"
- **THEN** pipeline 重跑 extract + transform；modal 用新结果刷新

### Requirement: 剪藏按钮状态

AddressBar 的剪藏按钮（剪刀图标）SHALL 按以下规则渲染：

- 当前 URL 协议非 http/https → disabled（灰色、tooltip "当前页面不支持剪藏"）
- 当前 URL 已在 clips 表 → 实色图标 + 右下角对勾；点击弹 "已剪藏，打开原文件？" 确认框，确认后 navigate 到 phase 7 编辑器
- 其他情况 → 空心图标；点击触发 pipeline；pipeline 运行时按钮显示 spinner 动画

tooltip MUST 显示快捷键提示 "剪藏此页（Cmd+Shift+S）"。

#### Scenario: about:blank 禁用

- **WHEN** 当前 tab url = `about:blank`
- **THEN** 剪藏按钮 disabled；tooltip 显示不支持文案

#### Scenario: 已剪藏打开

- **WHEN** 当前 url 命中 clips 表，用户点按钮 → 确认框点"打开"
- **THEN** 应用导航到 `/editor/:path` 打开原剪藏文件

#### Scenario: 触发剪藏

- **WHEN** 用户点击空心剪藏按钮
- **THEN** pipeline 进入 extracting；按钮显示 spinner；5s 内完成抽取后弹 preview modal

### Requirement: 快捷键

`/browser` 路由聚焦时 SHALL 注册 `Cmd/Ctrl+Shift+S` 触发剪藏。语义 MUST 与点击按钮一致；当前 URL 不支持剪藏时 MUST NOT 触发（no-op + toast 提示）。

#### Scenario: 快捷键触发

- **WHEN** `/browser` 聚焦，按 `Cmd+Shift+S`
- **THEN** 等价于点击剪藏按钮，进入 pipeline

#### Scenario: 不支持页面快捷键 no-op

- **WHEN** 当前 tab `about:blank` 按 `Cmd+Shift+S`
- **THEN** 无副作用；toast 显示 "当前页面不支持剪藏"

### Requirement: 错误态反馈

pipeline 返回错误时 UI SHALL 按 stage 显示具体文案：

- `E_EXTRACT_TIMEOUT` / `E_EXTRACT_EMPTY` → "无法抽取正文" + 两个按钮："查看原始 HTML" / "强制保存整页"
- `E_TRANSFORM_FAILED` → "HTML 转 Markdown 失败" + 按钮 "保存为 .clip.html"
- `E_WRITE_FAILED` → "保存失败" + "重试"
- `E_INDEX_FAILED` → 后台重试，UI 不打扰（phase 5 自愈）

#### Scenario: 抽取超时降级

- **WHEN** extract 超时 → 用户点"强制保存整页"
- **THEN** pipeline 以 degraded 模式重跑：直接把 `document.body.innerHTML` 送入 transform；写入后 clips.degraded = 1
