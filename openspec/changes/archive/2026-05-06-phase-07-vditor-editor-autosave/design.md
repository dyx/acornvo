## Context

前置：
- phase 4 `file.read(path)` / `file.write(path, body, { expectedMtime })` / `frontmatter.parseFile` / `frontmatter.stringify`
- phase 5 `selfWrites` 注册由 main 侧在 `file.write` 内部完成（renderer 无感）
- phase 6 果仓已有 "打开编辑器" 按钮指向占位组件
- PRD：Vditor 作为默认 md 编辑器；最大限度保持 md 原貌（Vditor 的 `ir`/`wysiwyg` 模式都会重新组织 md，要按需选择）

UI 参考：无 prototype，但 PRD 约定"左侧果仓不常驻，编辑态占据主区"。本阶段**编辑器单栏全屏**，左侧不做侧栏；TitleBar 顶部展示相对路径与 dirty/saving 状态；"返回果仓"按钮走 `navigate(-1)` 或 `/library`。

## Goals / Non-Goals

**Goals:**
- 用户在 `/editor/:encodedPath` 可打开 md，正文以所见即所得形式编辑，保存时 md 仍保持 LF + 原 frontmatter
- 自动保存稳健：无论用户停止输入、切换页面、最小化窗口、关闭窗口，都能把最后一次修改落盘
- 保存经 phase 4 的原子写通路，触发 phase 5 `selfWrites` 静默处理（不重新全量索引）
- 为 phase 9 冲突处理预留接缝：`E_MTIME_MISMATCH` 一路抛到 editor store，暂时以 toast 兜底
- 不破坏 frontmatter：本阶段 Vditor 只改 body，frontmatter 原样透传

**Non-Goals:**
- 不做 frontmatter 可视化编辑（侧卡只读，修改留后续）
- 不做图片/附件上传（粘贴图片暂提示"尚未支持"）
- 不做冲突解决 UI（phase 9）
- 不做多 tab 编辑（单文件单 route 实例；`/editor/:path` 路径即标识；切换文件 = 切路由）
- 不做撤销栈持久化（关闭窗口丢失 undo 历史，可接受）

## Decisions

### D1: Vditor 模式选择 —— 使用 `ir`（即时渲染）

三种模式：
- `wysiwyg`：所见即所得；会把 md 序列化后再反序列化，**不可避免地对原 md 做归一化**（空行、HTML 标签处理等）
- `ir`：即时渲染（在原 md 文本上就地高亮+预览），**保持 md 原文忠实度最高**
- `sv`：左源码 + 右预览（分栏）

**选 `ir`**：PRD 强调"最大保留原 md 结构"，避免用户在 Obsidian/其他工具中看到 Vditor 改写过的标记（比如把 `*x*` 改成 `_x_`）。Vditor 的 `getValue()` 返回原始 md 文本（在 `ir` 模式下就是编辑区的文本）。

备选 `wysiwyg` 被拒：归一化后跨工具编辑会造成无意义 diff。

### D2: 数据流与状态机

Editor 页核心状态（Zustand `src/stores/editor.ts`）：

```ts
type EditorState =
  | { kind: 'idle' }
  | { kind: 'loading'; path: string }
  | { kind: 'ready'; path: string; frontmatter: Frontmatter; body: string;
      savedBody: string; savedMtimeMs: number; dirty: boolean; saving: boolean;
      lastError: string | null }
  | { kind: 'error'; path: string; error: string }
```

转移：
- 路由进入 → `loading` → 调 `files.get(path)` → `ready` 或 `error`
- 用户输入 → `dirty=true`；未达 debounce 时机 → 仅更新 `body`
- 触发保存 → `saving=true` → IPC `file.write(path, fullText, { expectedMtime: savedMtimeMs })`
  - 成功：`savedBody=body`、`savedMtimeMs=newMtime`、`dirty = (body !== savedBody)`、`saving=false`
  - `E_MTIME_MISMATCH`：`saving=false`、`lastError='conflict'`；本阶段 toast 提示，phase 9 接弹窗
  - 其他错误：`saving=false`、`lastError=error.code`；toast
- 路由离开 / 关窗前 → 调 `flushSave()`（同步 await 一次）

**理由**：把 saved* 与当前值分开，可在任何时刻算出 `dirty`；`savedMtimeMs` 是下一次 `expectedMtime`。

### D3: 自动保存调度器

统一一个 `scheduleSave()`：
- 每次输入 `scheduleSave()` → 取消旧 timer → 启新 1s timer → 到点调 `save()`
- `onBlur` 编辑器容器 → `flushSave()`（立即清 timer + 如 dirty 立即 save）
- `router` 离开 → `flushSave()`
- `window:beforeHide`（electron-vite 可在 main 侧拦 `before-quit` / `hide`，然后 invoke 一个 `editor.flushBeforeHide` 渲染端接力，但更简单做法：renderer 监听 `visibilitychange` 变 hidden → `flushSave()`）
- `Cmd+S` → `flushSave()`

**并发防护**：`save()` 内部若 `saving=true`，当次请求合并到 in-flight（不排队）；in-flight 完成后若 `body !== savedBody` 再起一次。

**理由**：防 debounce 期间用户继续输入，触发多次保存导致乱序（最后一次变成更早的 body）；合并策略保证"最后一次确认的 body 一定被写入"。

### D4: 文件组装与 LF

- 读：`files.get(path)` 返回 `{ frontmatter, body }`，body 已被 phase 4 归一化为 LF
- 写：`stringify(frontmatter, body)` 产生全文；**body 结尾确保以 LF 收尾**（Vditor 输出最后一行若无换行补一个）
- 写入参数：`file.write(path, fullText, { expectedMtime: savedMtimeMs })`

**理由**：保持 LF + frontmatter 原样是 phase 4 的契约；editor 只负责合成。

### D5: selfWrites 与 watcher 静默

`file.write` 在 main 进程内部注册 `selfWrites.set(absPath, { mtimeMs, expiresAt: now+3s })`（phase 5 MODIFIED 已约定）。renderer 不关心。Library 侧因此不会因编辑器写入而闪动；仅当 3s 外有变更才触发 `index:fileChanged`。

### D6: TitleBar 信息与快捷键

- 左：`← 返回果仓` 按钮
- 中：`相对路径` + dirty 点（●） + `saving...` 脉动（右侧灰文字）
- 右：`Cmd+S 保存` 小字提示（macOS）/ `Ctrl+S`（Win/Linux）

全局快捷键绑定：
- `Cmd/Ctrl+S` → `flushSave()`
- `Cmd/Ctrl+W` → 先 `flushSave()` 再 `navigate(-1)`（不真的关窗；窗口关闭走 macOS 的隐藏语义 phase 1 已处理）

### D7: Frontmatter 只读侧卡

右侧 320px 抽屉，展示 frontmatter 全字段（category / tags / rating / site / summary / highlights / clipped_at 等），**不可编辑**。提供"在系统文本编辑器中打开"入口（调 `shell.openPath(absPath)`）——救急，phase 10 右键菜单也会有。

**理由**：phase 7 只保证 body 编辑；frontmatter 的可视化表单需单独设计字段校验、tag 自动补全，拆到后续。

### D8: Vditor 配置要点

- 关闭 upload（`upload: { url: '' }` + `after: () => false` 拦截粘贴图片并提示）
- 关闭 counter 里"字符数"之外的噪音
- 主题：优先沿用 app 主题（light/dark），phase 1 的主题 store 透传到 Vditor 初始化参数
- cdn：默认从 CDN 加载 icon/语言包 → **必须离线**：把 `vditor/dist` 复制到 `public/vditor/`，设置 `cdn: '/vditor'`

**理由**：App 是离线优先，不能依赖公网。

### D9: 错误态与重试

- `files.get(path)` 失败：
  - `E_NOT_FOUND`：editor 页显示"文件已被移除"+ 返回按钮
  - `E_ENCODING`：显示"无法解析文件编码" + 路径 + "在系统文本编辑器中打开"
  - 其他：通用 error 页 + `retry`
- `file.write` 失败：
  - `E_MTIME_MISMATCH`：toast "文件在外部被修改，请先刷新"（phase 9 接管）
  - `E_PERMISSION` / `E_NOSPACE`：toast + 保留 dirty；用户下次输入继续尝试
  - 连续 3 次失败：弹 "保存持续失败，查看日志" 链到 `~/.acornvo/logs/`

## Risks / Trade-offs

- [Vditor `ir` 模式表格/公式支持度弱] → 本阶段支持基本 md；表格/LaTeX 渲染若异常，用户仍能看到源码，后续 phase 评估切 `wysiwyg`
- [离线 Vditor assets 体积约 3-5MB] → 打包大小略涨；可接受
- [debounce 1s 与 mtime 冲突概率] → 同人单机场景极少；phase 9 专门处理；当前 toast 兜底
- [粘贴图片无反应] → 用户体验损失；phase 12 拾果会处理图片本地化，届时编辑器可接同一 pipeline
- [Window hide → flushSave 异步未完成即 hide] → 用 `navigator.sendBeacon` 式思路不适用（Electron 内没有）；改为 renderer 监听 `visibilitychange` 时同步 `await` 一次 flush；极端情况（强制 kill 进程）仍可能丢最后 1s 输入——写到 TODO 接 phase 13 的 safeStorage 外可以加"编辑草稿缓存"

## Migration Plan

- 无存量编辑器代码；phase 6 的占位路由组件直接替换为真实 `Editor` 组件
- 回滚：删除 `src/pages/Editor.tsx` + `src/stores/editor.ts`，恢复占位；Library 侧 "打开编辑器" 按钮退回 `navigate('/editor-placeholder')`

## Open Questions

- Vditor 的 `ir` 模式能否完美保留原 md 空格/空行？**先用 `ir` 验证一周，发现问题再切 `wysiwyg`**
- 是否需要"最近编辑文件"列表？**暂不做**，Library 的 `clipped_at` 排序已可见
- 保存失败时 dirty body 要不要写临时文件备份？**本阶段否**，phase 13 的 safeStorage 再考虑"编辑草稿"持久化
