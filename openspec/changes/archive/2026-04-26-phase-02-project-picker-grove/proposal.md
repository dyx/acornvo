## Why

Acornvo 采用多树林（multi-vault）模型：用户先选一片"树林"（独立根目录），之后所有功能（拾果/理果/松语/索引/搜索）都在该树林上下文中运行。没有树林选择器，应用没有入口；没有 `.acornvo/` 初始化，后续 SQLite/历史/标记无处落盘；没有 `recent-projects.json`，用户无法跨启动恢复上下文；没有实例锁，同一树林被两个 Acornvo 同时打开会撕裂 SQLite WAL。本阶段把这些地基一次做完，后续 change 只需"已打开树林"作为前置条件。

## What Changes

- **Project Picker UI**：参考 `docs/ui/src/project-picker.jsx` 实现左侧品牌区 + 右侧"最近打开的树林"列表 + 新建/打开已有目录两个按钮
- **最近打开列表**：`~/.acornvo/recent-projects.json`（schema 含 id / name / path / color / pinned / last_opened_at / files_count 缓存）
  - 启动时读取，非空且首项路径仍存在则**自动打开**最近项（按 PRD S-8 极简引导）
  - 首项失效或列表空时展示 Picker
- **新建树林流程**：`dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })` 选父目录 → 输入树林名 → 生成根目录 + `.acornvo/` 初始化
- **打开已有目录**：同 dialog 选目录 → 若无 `.acornvo/` 则自动初始化（可直接打开 Obsidian vault）
- **`.acornvo/` 初始化**：创建目录 + `project.json`（含 `id` uuid、`name`、`color`、`created_at`、`schema_version`）+ `inbox/` + `assets/` 占位；**不**创建 `index.db`（交给 `sqlite-schema-migrations`）
- **实例锁 `.acornvo/.lock`**：内容 `{ pid, hostname, started_at }`；启动时读该文件，若进程存活则提示"该树林已被另一实例打开，强制接管？"；接管时覆盖 lock
- **同步目录检测**：树林路径含 `iCloud` / `Dropbox` / `OneDrive` / `Google Drive` 特征时，顶部 banner 警告"建议将 `.acornvo/` 加入同步排除"；在 `.acornvo/` 内写 `.nosync` 与 `.icloud` 占位
- **失效树林清理**：`recent-projects.json` 载入时 `fs.existsSync` 校验，失效项标红并提供"从列表移除"按钮
- **切换树林入口**：顶部 TitleBar 放 "切换树林" 菜单（下拉当前 + 最近 + 新建 + 打开）
- **路由联动**：应用启动流水线 `checkRecent → autoOpen | showPicker`；已打开树林后跳转 `/library`（占位）
- **不在本阶段**：SQLite schema（phase 3）、文件 I/O（phase 4）、文件列表 UI（phase 6）；树林级设置覆盖（phase 13）

## Capabilities

### New Capabilities

- `grove-management`: 树林（vault）创建、打开、切换、最近列表、实例锁、同步目录告警
- `app-bootstrap`: 应用启动时"自动打开最近 / 显示 Picker"的决策流水线

### Modified Capabilities

- `app-shell`: 主窗口路由从单一 `/` 扩展为 `/picker` 首屏或 `/library` 首屏（视启动决策）；TitleBar 增加"切换树林"菜单

## Impact

- **新增代码**：`electron/ipc/project.ts`、`electron/services/grove.ts`（创建/打开/初始化）、`electron/services/lockfile.ts`、`electron/services/recent.ts`、`src/pages/ProjectPicker.tsx`、`src/stores/grove.ts`、`src/components/GroveSwitcher.tsx`
- **契约扩展**：`shared/ipc-contract.ts` 新增 `project` 命名空间：`listRecent` / `createGrove(parentDir, name)` / `openGrove(path)` / `closeGrove` / `getCurrent` / `removeFromRecent`
- **文件系统副作用**：首次打开任意树林会在其下创建 `.acornvo/` 并在用户主目录写 `~/.acornvo/recent-projects.json`
- **不影响**：renderer 安全边界（沿用 phase 1）、IPC 错误形状
- **可观察产物**：Picker 可新建/打开树林；关闭应用后重启自动进入最近树林；同一树林二开触发接管弹窗
