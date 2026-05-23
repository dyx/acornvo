## Context

本阶段基于 `foundation-ipc-base` 产出。后续所有模块都假定"当前已打开一棵树林"。树林是独立根目录（Obsidian vault 兼容），元数据写 `<grove>/.acornvo/project.json`，用户级最近列表写 `~/.acornvo/recent-projects.json`。

PRD 关键约束：

- S-8 极简引导：无独立 onboarding，直接进 Picker；首页 banner 提示未配置模型（banner 本身的实现留到 `secure-storage-settings`）
- 多树林互相隔离：切换树林会清空全局 store 的业务 slice（但 theme/locale 等全局偏好保留）
- 可从任意 Obsidian vault 打开：即使目录里没有 `.acornvo/` 也能打开，初始化动作对用户无感
- 同一树林不允许被两个 Acornvo 同时打开（避免 SQLite WAL 撕裂）

## Goals / Non-Goals

**Goals:**

- 提供可视 Picker（对齐 `docs/ui/src/project-picker.jsx` 的视觉）
- 最近项自动打开、失效项可移除、实例锁、同步目录警告全部就位
- 清晰的"当前树林" store：路径、元数据、lock 状态；切换时触发全局业务 slice 清空
- 所有 I/O 封装在 main 侧 service，renderer 仅通过 IPC 调用

**Non-Goals:**

- 不做 Electron 拖拽树林文件夹进 app 打开（后续增强）
- 不做树林置顶（pin）的持久化（Picker UI 有 pin 图标，但本阶段只读）
- 不做树林颜色/图标的用户编辑（`project.json` 存默认色，编辑 UI 留到后续）
- 不做树林级设置覆盖 `reviewerModelId` / `chatModelId`（phase 13）
- 不做 SQLite `index.db` 创建（phase 3）

## Decisions

### D1: 启动决策流水线

```
main.whenReady()
  ↓
recentSvc.load()  ← ~/.acornvo/recent-projects.json
  ↓
filter(valid: fs.existsSync)
  ↓
firstValid?
  yes → tryOpen(firstValid)
         ↓ (lock ok)
         routeTo('/library')
         ↓ (lock taken by alive pid)
         showTakeoverDialog → [接管] | [取消→Picker]
  no  → routeTo('/picker')
```

**理由**：对齐 PRD S-8 极简引导。自动打开失败（目录不在 / 被锁）时降级到 Picker，不阻塞启动。

### D2: `.acornvo/` 初始化是幂等的

`grove.initialize(path)`：

- 若 `.acornvo/` 不存在 → 创建，写 `project.json`、`inbox/`、`assets/`、`.nosync`、`.icloud`
- 若 `.acornvo/` 已存在但缺某文件 → 按需补齐（例如旧版本没有 `.nosync`）
- `project.json` schema 校验（Zod）失败 → 备份为 `project.json.bak-<ts>` 后重写默认值

**理由**：Obsidian vault 直接打开时需要自动初始化；老版本 Acornvo 打开时需要补齐。

### D3: `project.json` schema

```jsonc
{
  "id": "<uuid v4>", // 跨设备仍稳定
  "schema_version": 1,
  "name": "我的树林", // 显示名（默认取目录名）
  "color": "acorn", // acorn | leaf | berry | sky
  "created_at": "<iso>",
  "last_opened_at": "<iso>"
}
```

`recent-projects.json` schema：

```jsonc
{
  "schema_version": 1,
  "items": [
    {
      "id": "<uuid>", // 来自 project.json（用于跨路径识别）
      "path": "<absolute>",
      "name": "<cached>",
      "color": "<cached>",
      "pinned": false,
      "last_opened_at": "<iso>",
      "files_count": 0 // 由 indexer 阶段回写缓存；此阶段默认 0
    }
  ]
}
```

**理由**：id 跟 path 解耦，用户若把树林移动到新路径，仍能识别为同一棵；path 是打开参数。

### D4: 实例锁

`grove.openGrove(path)` 流程：

1. `safeResolve` 校验路径有效
2. 读 `<path>/.acornvo/.lock`
3. 若存在：
   - 解析 `{ pid, hostname, started_at }`；hostname 匹配且 `process.kill(pid, 0)` 不抛 ESRCH → 被占用，返回 `{ locked: true, holder }`
   - 其他情况（跨机/进程已死/解析失败）→ 视为陈旧 lock，覆盖
4. 写新 lock（`writeFileAtomic`，`0600`）
5. 进程退出时 `app.on('will-quit')` 删除 lock（try-catch 吞异常）

**接管弹窗**：用户点"强制接管"后重走 3-4 步，覆盖 lock；原实例下次 IPC 调用（若仍活着）写文件时可能报错，用户体验问题由 PRD 接受。

### D5: 同步目录检测

`grove.detectSyncDir(absPath)`：

- 正则匹配（大小写不敏感）：`/(iCloud(?:\s|~|Drive)|Dropbox|OneDrive|Google Drive|Nextcloud|pCloud)/`
- 命中时返回 `syncProvider: string`
- Picker 打开树林后立即在 renderer banner 区（phase 13 实装；本阶段先 console.warn + 日志 + `project.json.sync_warning` 持久化字段记录过）

**理由**：检测可以独立先落，banner UI 由后续 change 接线，不阻塞本阶段。

### D6: 切换树林的 store 清空

定义 `grove.onChange(handler)` 订阅器：

- phase 1 的 `app-shell` 扩展 TitleBar 切树林菜单
- 切换时 renderer 订阅者（以后由后续 change 接入）清空 library / editor / chat 等 slice
- 本阶段只需实现订阅器本身 + `grove` 自己的 slice 切换

**理由**：避免切树林后残留上一树林的文件列表/会话污染 UI。

### D7: Picker UI 技术

- 用 shadcn/ui + Tailwind 4 复刻 `docs/ui/src/project-picker.jsx` 的视觉（品牌渐变、卡片悬停动画、AcornLogo）
- `AcornLogo` 作为独立组件抽出（后续 TitleBar / 空态均复用）
- 树林颜色固定 4 种（acorn / leaf / berry / sky），默认 `acorn`
- 失效项：卡片左侧彩块变灰 + 右侧多一个小 "×" 按钮（从列表移除）

## Risks / Trade-offs

- **用户把树林放在 iCloud Drive 里故意要云同步** → banner 只警告不阻止；在 `.acornvo/` 里写 `.nosync` 与 `.icloud` 占位能规避 macOS/Dropbox 的默认同步；Windows OneDrive 的 `.nosync` 效果有限，需文档告知
- **多机最近列表不一致** → 有意不跨机同步（`~/.acornvo/` 不进 iCloud），与 `secrets.enc` 的机器绑定一致
- **两个树林 id 冲撞（用户手动复制 project.json）** → 极低概率；Picker 列表按 path 为准展示，id 仅辅助识别移动场景
- **Windows 下 `process.kill(pid, 0)` 行为差异** → 不存在进程抛错；用 try/catch 包裹，捕获特定错误即判定为陈旧 lock
- **Obsidian vault 存在 `.obsidian/` 目录** → 不读不写；仅创建 `.acornvo/` 与之并存

## Migration Plan

无存量。

回滚：删除本 change 的代码；`~/.acornvo/recent-projects.json` 仍可由用户手动清理。

## Open Questions

- 是否允许多选 Picker（一次打开多个树林为独立窗口）？**暂定否**，单窗单树林。若后续需求旺盛再提 change
- `.nosync` 与 `.icloud` 占位是否在用户第一次见时弹提示？**否**，静默放置 + banner 一次即可
