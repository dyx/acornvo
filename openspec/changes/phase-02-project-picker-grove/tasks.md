## 1. IPC 契约与依赖

- [x] 1.1 `shared/ipc-contract.ts` 扩展 `project` 命名空间：`listRecent` / `createGrove(parentDir: string, name: string)` / `openGrove(path: string, opts?: { force?: boolean })` / `closeGrove` / `getCurrent` / `removeFromRecent(id: string)` / `selectDirectory(purpose: 'open'|'createParent')`
- [x] 1.2 `shared/ipc-contract.ts` 新增事件通道声明：`project:changed`（主 → renderer push）
- [x] 1.3 添加依赖：`uuid`（生成 id）、`zod`（schema 校验，后续 change 也会用）
- [x] 1.4 `shared/grove.ts` 抽出类型：`Grove`、`RecentItem`、`LockInfo`、`SyncProvider`

## 2. 服务层（electron/services）

- [x] 2.1 `services/recent.ts`：`load()` / `save()` / `upsertToTop(item)` / `removeById(id)`；原子写入；Zod 校验失败时备份原文件并写默认空列表
- [x] 2.2 `services/lockfile.ts`：`acquire(path)` / `release(path)`；读取现有 lock、判定进程是否活着（跨 hostname 视为陈旧）
- [x] 2.3 `services/grove.ts`：
  - [x] 2.3.1 `initialize(path)`：创建 `.acornvo/` + `project.json` + `inbox/` + `assets/` + `.nosync` + `.icloud`（幂等）
  - [x] 2.3.2 `createGrove(parentDir, name)`：校验父目录可写 + 名字合法 + 目录不存在 → 创建 + 调 `initialize`
  - [x] 2.3.3 `openGrove(path, { force })`：acquire lock（force 时覆盖陈旧或活跃 lock）→ 读 `project.json`（损坏则备份 + 重写）→ 更新 `last_opened_at` → 写 recent
  - [x] 2.3.4 `detectSyncDir(absPath)`：正则匹配 iCloud/Dropbox/OneDrive/Google Drive/Nextcloud/pCloud；命中写 `project.json.sync_warning`
  - [x] 2.3.5 `closeGrove()`：release lock，清 current 状态，广播 `project:changed` with null
- [x] 2.4 `services/grove.ts` 暴露 `onChange(handler)` 订阅器；主 → renderer 推送走 `webContents.send('project:changed', payload)`
- [x] 2.5 注册 `app.on('will-quit')` 释放当前 lock

## 3. 主进程 IPC handlers（electron/ipc/project.ts）

- [x] 3.1 `listRecent`：`recent.load()` → 同时校验 `fs.existsSync(path)`，对失效项附 `valid: false`
- [x] 3.2 `createGrove` / `openGrove` / `closeGrove`：委托给 `services/grove.ts`
- [x] 3.3 `getCurrent`：返回 `{ id, path, name, color, sync_warning } | null`
- [x] 3.4 `removeFromRecent`：从 `recent-projects.json` 删除指定 id
- [x] 3.5 `selectDirectory`：包装 `dialog.showOpenDialog`，根据 `purpose` 切换 properties
- [x] 3.6 `registerHandlers(projectHandlers)` 注册到 IPC router

## 4. 启动流水线（electron/main.ts）

- [x] 4.1 `app.whenReady()` 完成后先 `registerHandlers(allHandlers)` 再做决策
- [x] 4.2 `bootstrap()`：用 `Promise.race` 包裹 2s 超时；
  - [x] 4.2.1 `recent.load()` → 过滤失效
  - [x] 4.2.2 首项存在则 `grove.openGrove(firstValid.path)`；`locked: true` 则把信息传给 renderer Picker
  - [x] 4.2.3 成功则 `initialRoute='/library'`；否则 `/picker`
- [x] 4.3 `BrowserWindow` 加载后 push 初始路由到 renderer（通过 hashbang 或 IPC 事件 `bootstrap:ready`）
- [x] 4.4 Picker 首屏收到 bootstrap 结果后渲染列表 + 可能的"被占用"提示

## 5. 渲染端 Grove store（src/stores/grove.ts）

- [x] 5.1 Zustand slice：`current: Grove | null`、`recent: RecentItem[]`、`lastError`
- [x] 5.2 actions：`loadRecent` / `openGroveById` / `createGrove(parent, name)` / `openExisting` / `switchTo(id)` / `removeFromRecent(id)`
- [x] 5.3 订阅 `window.api.on('project:changed', handler)` 更新 `current` 并触发全局业务 slice 清空 hook（暴露 `grove.onSwitch(cb)`）

## 6. Project Picker UI（src/pages/ProjectPicker.tsx）

- [ ] 6.1 用 shadcn + Tailwind 复刻 `docs/ui/src/project-picker.jsx` 的两栏布局：左品牌区 + 右列表
- [ ] 6.2 `AcornLogo` 抽为 `src/components/AcornLogo.tsx`（SVG props: size, theme）
- [ ] 6.3 `ProjectCard`：颜色块 + 名称 + 路径 + 文件数 + 上次打开 + hover 动画；失效态置灰 + "移除"按钮；被占用态"接管"按钮
- [ ] 6.4 "新建树林"按钮 → 调 `selectDirectory({ purpose: 'createParent' })` → 弹出命名 Dialog（shadcn `Dialog` + `Input`）→ 调 `createGrove`
- [ ] 6.5 "打开已有目录"按钮 → 调 `selectDirectory({ purpose: 'open' })` → 调 `openGrove`
- [ ] 6.6 成功打开后 `useNavigate()` 到 `/library`
- [ ] 6.7 i18n key：`picker.title` / `picker.subtitle` / `picker.new` / `picker.open` / `picker.hint` / `picker.recent` / `picker.empty` 等写入 `zh-CN.json`

## 7. TitleBar 切换树林菜单（src/components/GroveSwitcher.tsx）

- [ ] 7.1 组件：触发按钮显示当前树林颜色块 + 名称；点击弹 dropdown
- [ ] 7.2 Dropdown 内容：最近 5 项 + 分隔线 + "新建树林" + "打开已有目录"
- [ ] 7.3 路由守卫：若当前为 `/picker` 则组件返回 null
- [ ] 7.4 集成到 TitleBar（在 `src/components/TitleBar.tsx` 或 `src/App.tsx` 的 header 内，依 phase 1 约定扩展）

## 8. 接管对话框

- [ ] 8.1 `src/components/TakeoverDialog.tsx`：显示 holder `{ pid, hostname, started_at }`
- [ ] 8.2 按钮：`取消` / `强制接管`；后者调 `openGrove(path, { force: true })`
- [ ] 8.3 接管成功后跳 `/library`；失败则 toast 错误

## 9. 验收

- [ ] 9.1 首次启动（无 `~/.acornvo/recent-projects.json`）→ 显示 Picker 空态
- [ ] 9.2 新建树林 → 目录结构正确（`.acornvo/project.json` / `inbox/` / `assets/` / `.nosync` / `.icloud`）
- [ ] 9.3 关闭应用后重启 → 自动进入最近树林
- [ ] 9.4 同一树林启动第二个 Acornvo 实例 → 第二个显示接管确认；接管后第一个失效
- [ ] 9.5 把树林目录手动移动到新位置 → 最近列表里该项变失效，点"移除"消失
- [ ] 9.6 打开 Obsidian vault → `.acornvo/` 被自动创建，`.obsidian/` 未被动
- [ ] 9.7 树林路径含 `iCloud` → `project.json.sync_warning` = `"iCloud"`，日志有警告
- [ ] 9.8 TitleBar 切换树林菜单可用；切换时发出 `project:changed` 事件
- [ ] 9.9 `openspec validate phase-02-project-picker-grove --strict` 通过
