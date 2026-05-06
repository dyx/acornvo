## 1. 依赖与资源

- [x] 1.1 `npm install vditor`
- [x] 1.2 拷贝 `node_modules/vditor/dist` 到 `public/vditor/`（postinstall 脚本：`cp -r node_modules/vditor/dist public/vditor`）
- [x] 1.3 `src/pages/Editor.tsx` 目录占位 + `src/components/editor/*.tsx` + `src/stores/editor.ts`

## 2. Editor store（src/stores/editor.ts）

- [x] 2.1 Zustand slice：`state: EditorState`（idle / loading / ready / error）
- [x] 2.2 `open(path)`：state → loading → 调 `files.get(path)` → ready 或 error
- [x] 2.3 `setBody(newBody)`：仅在 ready 下更新；重置 debounce timer，调 `scheduleSave()`
- [x] 2.4 `save()`：若 in-flight 直接返回；否则走 `file.write(path, stringify(fm, body), { expectedMtime: savedMtimeMs })`；完成后若 `body !== savedBody` 再发一次（自迭代）
- [x] 2.5 `flushSave()`：清 debounce timer；await in-flight；如 dirty 立即 save
- [x] 2.6 错误处理：`E_MTIME_MISMATCH` → `lastError='conflict'` toast；`E_PERMISSION/E_NOSPACE` → 错误计数 +1，≥3 弹 modal；其他 → toast
- [x] 2.7 保存成功后 `savedBody=body` / `savedMtimeMs=newMtime` / 错误计数清零
- [x] 2.8 `close()`：切换路由或窗口关闭前统一回收 debounce timer + flushSave

## 3. Editor 页与组件（src/pages/Editor.tsx + src/components/editor/*）

- [x] 3.1 `Editor.tsx`：读路由参数 `decodeURIComponent(encodedPath)` → 调 `editor.open(path)`；根据 state 渲染 loading/ready/error
- [x] 3.2 `EditorTitleBar.tsx`：左侧"← 返回果仓"（调 `flushSave` 后 `navigate(-1)`）；中间路径 + dirty 点 + saving 脉动；右侧快捷键提示
- [x] 3.3 `VditorEditor.tsx`：
  - [x] 3.3.1 `useEffect` 挂载 Vditor，传 `mode:'ir'`、`cdn:'/vditor'`、`lang` 随 i18n
  - [x] 3.3.2 `upload: { url: '' }` + `paste` 拦截图片并 toast
  - [x] 3.3.3 `input` 回调 → `editor.setBody(getValue())`
  - [x] 3.3.4 `blur` 回调 → `editor.flushSave()`
  - [x] 3.3.5 `destroy()` 清理实例防内存泄漏
  - [ ] 3.3.6 主题随 app 主题切换（watch 主题 store 重新 init 或调 `setTheme`）
- [x] 3.4 `FrontmatterCard.tsx`（右侧 320px 只读卡）：
  - [x] 3.4.1 header: category/site
  - [x] 3.4.2 title + rating 5 星
  - [x] 3.4.3 summary + highlights（bullet list）
  - [x] 3.4.4 tags chips
  - [x] 3.4.5 published_at / clipped_at
  - [x] 3.4.6 "在系统文本编辑器中打开"按钮 → `shell.openPath(absPath)`（新 IPC `file.openExternal(path)` 或复用 phase 6 的 reveal 入口——选 `file.openExternal` 更贴合语义）
- [x] 3.5 `EditorErrorState.tsx`：根据 error code 显示文案；"返回果仓"按钮

## 4. 自动保存调度接线

- [x] 4.1 `scheduleSave()` debounce 1000ms
- [x] 4.2 `onVisibilityChange` 监听 → hidden 时 `flushSave()`
- [x] 4.3 全局 keydown：`Cmd/Ctrl+S` → `flushSave()`；阻止浏览器默认保存
- [x] 4.4 `Cmd/Ctrl+W` → `flushSave()` 后 `navigate(-1)`
- [x] 4.5 `useBlocker`（React Router v6+）在 dirty 且 saving 未完成时：先 await flushSave 再放行

## 5. IPC 补丁（main 侧）

- [x] 5.1 `shared/ipc-contract.ts` 新增 `file.openExternal(path)`（封装 `shell.openPath`）
- [x] 5.2 `electron/ipc/files.ts` 新增 handler：`safeResolve` + `shell.openPath(abs)`；返回 `{ ok: true }`

## 6. Library 侧接线（library-view MODIFIED）

- [x] 6.1 `FilePreviewPanel` 的"打开编辑器"按钮 onClick → `navigate('/editor/' + encodeURIComponent(selectedPath))`
- [x] 6.2 `VirtualFileList` 的 Enter 键 → 同上
- [x] 6.3 `FileRow` onDoubleClick → 同上
- [x] 6.4 移除占位路由 `/editor-placeholder`（若 phase 6 建立过）

## 7. i18n 文本

- [x] 7.1 `editor.back` / `editor.saving` / `editor.saved` / `editor.dirty` / `editor.error.not_found` / `editor.error.encoding` / `editor.error.conflict` / `editor.error.save_failed` / `editor.paste_image_unsupported` / `editor.open_external`

## 8. 验收

- [ ] 8.1 从 Library 点 "打开编辑器" → 跳到 `/editor/...` 并在 < 300ms 内加载完成
- [ ] 8.2 输入 "hello" → 停手 1s 后磁盘文件 body 末尾含 "hello"；mtime 改变
- [ ] 8.3 快速连续输入 20 字符 → 网络/IPC 调用不超过 2 次（合并策略）
- [ ] 8.4 `Cmd+S` 立刻保存，dirty 点消失
- [ ] 8.5 切到其他路由 → 返回，文件内容一致；编辑器不再存在旧 Vditor 实例（检查内存/devtools）
- [ ] 8.6 窗口 hide（macOS `Cmd+H`） → 返回后磁盘含 hide 前的最后输入
- [ ] 8.7 粘贴图片 → toast 提示，不插入 data URL
- [ ] 8.8 `ir` 模式下保存后 diff 磁盘与原文件：仅允许行尾 LF 规整，无其他格式差异
- [ ] 8.9 人工修改文件 mtime（touch）后保存 → toast "文件在外部被修改"；dirty 保留
- [ ] 8.10 编辑中 Library 面板 5000 行无闪动（selfWrites 工作，watcher 不触发事件）
- [ ] 8.11 断网启动 → Vditor 加载正常（本地 assets）
- [ ] 8.12 文件 frontmatter 全字段侧卡渲染正确；"在系统文本编辑器中打开"跳转生效
- [x] 8.13 删除打开中的文件（phase 5 watcher 触发） → editor store 感知并显示"文件已被移除"态（本阶段可只在保存时遇到 `E_NOT_FOUND` 后转错误态；观察即可）
- [x] 8.14 `openspec validate phase-07-vditor-editor-autosave --strict` 通过
