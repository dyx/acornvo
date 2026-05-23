## Why

phase 1-6 已让用户可以"打开树林 → 浏览果仓 → 选中文件"；下一步是让用户能真正**编辑**。Acornvo 是 md 优先的本地工具，编辑器必须贴合 PRD 的"所见即所得"诉求，并在保存时与 phase 4 的原子写、phase 5 的自身写回过滤链路对齐，避免"自己写→watcher 误触发→全量重索引"的回环。本阶段把 Vditor 接进来，并把自动保存的防抖/失焦/离页/关窗四个时机一次性设计完。

## What Changes

- 新增 `/editor/:encodedPath` 路由，用 Vditor 渲染 md 正文 + 右侧 Frontmatter 只读卡片（编辑 frontmatter 由后续阶段单独给 UI）
- Editor 页三态：loading（`files.get` 拉取中）/ ready（可编辑）/ error（E_NOT_FOUND / E_ENCODING 等）
- 自动保存：输入防抖 1s + onBlur + route leave + window hide，四个触发口径统一走同一 `save()`
- `file.write` 带 `expectedMtime`（phase 4 已预留）；mismatch 时先不处理，原样抛 `E_MTIME_MISMATCH` 到 store，phase 9 接入冲突 UI
- 保存成功后把返回的新 `mtimeMs` 回写 store，作为下一轮 `expectedMtime`
- TitleBar：展示相对路径 + dirty 点（●）+ saving 脉动；`Cmd+S` 手动保存；`Cmd+W` 时若 dirty 先 flush 保存再关窗
- 本阶段不改 frontmatter —— Vditor 只绑定 body，提交时通过 `frontmatter.stringify(frontmatter, newBody)` 合成整文件（沿用 phase 4 的 codec）
- `library-view` 的"打开编辑器"按钮由占位改为真实跳转；果仓列表的 Enter / 双击也同时落到 `/editor/:encodedPath`

## Capabilities

### New Capabilities

- `editor-page`: `/editor/:encodedPath` 路由、Vditor 集成、TitleBar、错误态、Frontmatter 只读侧卡
- `editor-autosave`: 防抖/失焦/离页/关窗四时机的保存调度，mtime 乐观锁接线，saving/dirty 状态

### Modified Capabilities

- `library-view`: "打开编辑器"按钮与行 Enter / 双击由占位改为 `navigate('/editor/' + encodeURIComponent(path))`

## Impact

- 依赖：`vditor`（运行时） + phase 4 的 `file.read` / `file.write` / frontmatter codec + phase 5 的 `selfWrites` 注册（保存时 main 侧自动登记，renderer 无感）
- 新增 IPC：`editor.open(path)` 为空（直接复用 `files.get`）；**无新 IPC**，本阶段走既有接口
- renderer：`src/pages/Editor.tsx`、`src/components/editor/*.tsx`、`src/stores/editor.ts`
- Library 只改一个按钮的 onClick + FileRow 的 onDoubleClick / onKeyDown
- 风险：Vditor 的样式注入可能污染全局 CSS；其自带 upload 默认指向公共接口需禁用
