## ADDED Requirements

### Requirement: 编辑器路由与加载
系统 SHALL 提供 `/editor/:encodedPath` 路由；渲染前 MUST 调 `files.get(decodeURIComponent(encodedPath))` 加载 frontmatter + body。加载过程中显示 loading 占位；成功后进入编辑态；失败时进入错误态。

#### Scenario: 正常打开
- **WHEN** 用户从果仓点击"打开编辑器" → navigate 到 `/editor/notes%2Fa.md`
- **THEN** 页面先显示 loading，随后展示 body 正文在编辑器中；header 显示相对路径 `notes/a.md`

#### Scenario: 路径不存在
- **WHEN** `files.get` 返回 `E_NOT_FOUND`
- **THEN** 页面显示"文件已被移除或重命名"+ "返回果仓"按钮；不渲染编辑器

#### Scenario: 编码异常
- **WHEN** `files.get` 返回 `E_ENCODING`
- **THEN** 显示"无法解析文件编码，请检查文件" + 路径 + "在系统文本编辑器中打开"入口（`shell.openPath(absPath)`）

### Requirement: Vditor 集成（IR 模式）
编辑器 SHALL 使用 Vditor 的 `ir`（即时渲染）模式，保持 md 文本忠实度，不做格式归一化重写。Vditor 资源 MUST 从本地 `public/vditor/` 加载（`cdn: '/vditor'`），不访问公网 CDN。

#### Scenario: 离线可用
- **WHEN** 断网打开 Acornvo 并进入 `/editor/:path`
- **THEN** 编辑器正常渲染、图标/语言包齐全

#### Scenario: 保持原 md 结构
- **WHEN** 文件 body 含 `*斜体*` 与 `_斜体_` 混用
- **THEN** 编辑器打开并立即保存（不做任何修改） → 磁盘文件 body 与保存前逐字节一致（仅允许结尾 LF 规整）

### Requirement: 图片粘贴/上传提示
本阶段 MUST 禁用 Vditor 自带的 upload 与图片上传流程。用户粘贴图片时 SHALL 拦截并 toast 提示"尚未支持图片粘贴，将在拾果阶段接入"。

#### Scenario: 粘贴图片被拦截
- **WHEN** 用户在编辑区 Ctrl/Cmd+V 一张图片
- **THEN** 编辑器不插入任何 data URL 或上传请求；toast 显示占位提示

### Requirement: Frontmatter 只读侧卡
页面 SHALL 在右侧 320px 展示 frontmatter 只读信息卡（category / tags chips / rating 星 / site / summary / highlights / clipped_at / published_at）。卡片 MUST 不可编辑；提供"在系统文本编辑器中打开"按钮调 `shell.openPath(absPath)`。

#### Scenario: 卡片内容与磁盘一致
- **WHEN** 文件 frontmatter.rating=4，tags=['ai','attention']
- **THEN** 侧卡显示 4 颗实心星 + 两个 chip

#### Scenario: 无 frontmatter 的文件
- **WHEN** 文件只有 body 没有 frontmatter 区块
- **THEN** 侧卡显示"该文件暂无 frontmatter"占位，不渲染空字段

### Requirement: 编辑器 TitleBar
编辑器页 SHALL 替换默认 TitleBar：左侧"← 返回果仓"；中间相对路径 + dirty/saving 指示；右侧快捷键提示。dirty MUST 显示空心或实心点（●）；saving 期间 MUST 有轻量脉动/旋转。

#### Scenario: dirty 指示
- **WHEN** 用户输入新字符，尚未触发保存
- **THEN** TitleBar 中间显示 `notes/a.md ●`

#### Scenario: saving 指示
- **WHEN** 保存正在进行
- **THEN** 路径旁显示"保存中…"文字（或脉动点）

#### Scenario: 保存完成
- **WHEN** 保存成功且 body == savedBody
- **THEN** dirty 点消失；路径后无额外状态

### Requirement: AI 徽章挂载点
`/editor/:encodedPath` 页 SHALL 在 TitleBar 右侧预留 AI 徽章挂载点；当打开的 md 文件 frontmatter 含 `ai_reviewed_at` 时渲染 `AiReviewBadge`（见 ai-review-ui）。徽章 MUST 与 dirty/saving 指示共存且不重叠。

#### Scenario: 打开 AI 审读过的剪藏
- **WHEN** 用户在果仓双击一个含 `ai_reviewed_at` 字段的 md
- **THEN** 编辑器加载后 TitleBar 右侧显示 AI 徽章

#### Scenario: 非剪藏普通文件
- **WHEN** 用户打开 frontmatter 中无 AI 字段的 md
- **THEN** 不渲染徽章；TitleBar 其他元素布局不变

### Requirement: frontmatter 侧卡扩展 AI 字段显示
phase 7 的 Frontmatter 只读侧卡 SHALL 在存在 AI 字段时增加一行 "AI 审读" 区，显示 summary 的前 80 字符 + "展开" 按钮（点击打开 `AiReviewDrawer`）。该行 MUST NOT 替换原有的 category / tags / rating 等显示。

#### Scenario: 显示 AI 行
- **WHEN** frontmatter 有 ai_summary='xxx' 且原有 tags 若干
- **THEN** 侧卡原字段照常显示；末尾多一行 "AI 审读"，文本为 summary 前 80 字 + "展开"

#### Scenario: 无 AI 字段
- **WHEN** frontmatter 无任何 ai_* 字段
- **THEN** 侧卡不显示 AI 区

### Requirement: 接受后自动保存
用户在 AiReviewDrawer 点击 "一键接受" 或 "用作标题" 或 "合并到标签" 时，编辑器 SHALL 通过现有 autosave 链路（phase 7 的 debounce 调度 + phase 4 原子写）完成保存，不走旁路直写。保存成功后 TitleBar dirty 指示器 MUST 正确恢复（可能短暂显示 saving）。

#### Scenario: 合并到标签的保存
- **WHEN** 用户在抽屉点"合并到标签"，merge 结果使 tags 新增一项
- **THEN** 编辑器状态进入 dirty → saving → saved；磁盘文件 frontmatter.tags 更新；content_hash 不变（body 未改）
