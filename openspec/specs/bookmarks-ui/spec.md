# bookmarks-ui Specification

## Purpose
Provides the bookmark sidebar UI, add-bookmark button in the address bar, and bookmark interaction behaviors (open, search, filter, edit, delete) within the browser view.

## Requirements
### Requirement: Bookmarks 侧栏
`/browse` 页 SHALL 左侧有可折叠书签侧栏，默认折叠（48px 宽展示一竖排图标），展开时 200px 宽。展开后含：
- 顶部搜索输入（q）
- 顶部 tag chips（来自所有书签的 union；点击 chip → 过滤）
- 虚拟化列表（行高 ~56px；含 favicon / title / 域名 / tags）

#### Scenario: 折叠/展开
- **WHEN** 用户点侧栏 toggle 按钮
- **THEN** 侧栏宽度 48px ↔ 200px 切换；`#browser-viewport` 的 bounds 随即 resync

#### Scenario: 搜索过滤
- **WHEN** 用户输入 "news" 到搜索框
- **THEN** 200ms debounce 后调 `bookmarks.list({ q: 'news' })`；列表仅剩含 news 的行

#### Scenario: tag 过滤
- **WHEN** 用户点 chip "news"
- **THEN** 调 `bookmarks.list({ tag: 'news' })`；chip 显示 active 态；再点取消

### Requirement: 加入书签按钮
AddressBar 右侧 SHALL 有"加入书签"按钮（星图标）：
- 当前 tab URL 已存在书签 → 按钮实心（indicating saved）+ 点击弹"编辑 / 删除"
- 未存在 → 按钮空心 + 点击弹新建表单，预填 tab.title / url / favicon；用户可输入 tags（逗号分隔）

保存后按钮变实心；被删后变空心。

#### Scenario: 新建
- **WHEN** 当前 tab URL 不在书签，用户点星图标 → 填 tags "news,ai" → 保存
- **THEN** `bookmarks.create` 成功；按钮实心；Bookmarks 侧栏列表 prepend 新行

#### Scenario: 编辑已存在
- **WHEN** 用户点已保存 URL 的星图标
- **THEN** 弹出含现有 title/tags 的编辑 modal；包含"删除"按钮

#### Scenario: 删除
- **WHEN** 用户在编辑 modal 点"删除"并确认
- **THEN** `bookmarks.delete`；按钮变空心；侧栏列表该行消失

### Requirement: 书签打开行为
侧栏列表行点击 SHALL 在**当前** tab 打开该 URL（不新建 tab）；`Cmd/Ctrl+Click` MUST 在新 tab 打开；右键菜单含"打开 / 在新 tab 中打开 / 编辑 / 删除"。

#### Scenario: 当前 tab 打开
- **WHEN** 用户点列表行
- **THEN** 当前激活 tab `loadURL(bookmark.url)`

#### Scenario: 新 tab 打开
- **WHEN** 用户 Cmd+Click 列表行
- **THEN** 创建新 tab loadURL + 激活

### Requirement: 书签列表空态
无书签时侧栏 SHALL 显示空态："还没有书签。浏览时点星号收藏当前页面。"

#### Scenario: 首次打开
- **WHEN** bookmarks 表为空
- **THEN** 侧栏展开后显示该文案；搜索/tag chip 区隐藏
