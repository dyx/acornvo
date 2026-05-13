# 松言果语 Acornvo

## Context

打造一款**本地优先的个人知识管理桌面应用**，隐喻松鼠"拾果 → 理果 → 松语"的采集整理过程：

1. **拾果**：内置浏览器浏览网页，一键把文章提取成 markdown 本地归档（Obsidian 兼容）
2. **理果**：用 AI 对本地 markdown 做结构化加工（摘要 / 评分 / 分类 / 标签），追加到 YAML Frontmatter
3. **松语**：对话式 AI，可 @树林内多个 md 文件，基于它们生成新的 markdown 文档

与 Obsidian、Cubox 等工具的差异在于 **"采集 + AI 加工 + 基于本地知识库的对话生成"一体化**。markdown 文件仍是真实数据源（可被 Obsidian 打开），SQLite 仅作索引/缓存，不做唯一事实源。

---

## 产品术语表

统一用于 UI 文案、菜单、设置项与用户文档；代码标识符 / 文件名 / 数据库表名保留英文或通用词，降低代码认知负担。

| 产品术语 | 英文 | 代码/文件/表（保留不变） | 含义 |
|---|---|---|---|
| **树林** | Grove | `project` / `project.json` / `ProjectPicker.tsx` / `recent-projects.json` | 独立根目录（vault），每个树林自成一体：自己的索引、标记、对话历史 |
| **果仓** | Cache | `Library.tsx` | 树林内 md 文件的主视图（全部归档文件的浏览 / 筛选 / 搜索入口） |
| **果篮** | Basket | `inbox/` | 树林根下的默认采集目录，存放新采集、未归类的 md 文件 |
| **拾果** | Collect | `Browser.tsx` / `clipper.ts` | 网页 → Markdown 的采集动作 / 模块 |
| **理果** | Process | `ai-reviewer.ts` / Editor 侧的理果面板 | AI 结构化加工（摘要 / 评分 / 分类 / 标签）的动作 / 模块 |
| **松语** | Talk | `Chat.tsx` / `ai-agent.ts` | 与 md 文件对话并生成新文档的模块 |
| **标记** | Mark | `bookmarks.json` / `bookmarks` 表 / `BookmarkList.tsx` | 拾果浏览器内的网址收藏 |

**约定：**
- 代码层（文件名、类名、字段、表名、IPC 频道、i18n key）一律保留英文或通用词，不做松鼠化
- UI 文案（菜单、按钮、提示、设置项、帮助文档）一律用上表的松鼠化中文术语
- i18n 英文版对应英文术语列（Grove / Cache / Basket / Mark…），不做二次翻译
- 本文档后续涉及用户视角时使用"树林 / 果仓 / 果篮 / 标记"，涉及代码结构时仍可用 `project` / `inbox` / `bookmarks` 等原名

---

## 已实现
- 已使用 electron-vite 实现 Electron + React 脚手架

## 关键决策摘要

### 产品形态

| # | 决策点 | 选择 |
|---|---|---|
| P-1 | 存储模型 | 多树林（multi-vault），每个树林一独立根目录 |
| P-2 | 数据源 | 本地 markdown 文件为真实源，SQLite 为索引 |
| P-3 | LLM 抽象 | `@mariozechner/pi-mono`（pi-ai + pi-agent-core + pi-web-ui） |
| P-4 | Markdown 编辑器 | Vditor（默认 IR 模式；可切 SV 双向滚动 / WYSIWYG） |
| P-5 | Wikilink | 暂不支持（坚持标准 md 链接，Obsidian 侧自行解析） |
| P-6 | 松语上下文 | @ 文件全文注入 + agent tool 自主读取（混合） |
| P-7 | Frontmatter 规格 | 1-5 星评分 + 单层分类 + 标签词汇表复用 + 150 字摘要 |
| P-8 | 自动理果 | 采集完立即后台执行 |
| P-9 | 浏览器形态 | 多标签页 |
| P-10 | 目标平台 | macOS / Windows / Linux |
| P-11 | i18n | 简体中文 / English |

### 安全 · 完整性 · 可运维

| # | 决策点 | 选择 |
|---|---|---|
| S-1 | API Key 存储 | **Electron `safeStorage`**（Keychain/DPAPI/libsecret，回退明文加密） |
| S-2 | 中文全文检索 | **`@node-rs/jieba` 预分词 + FTS5 `simple` tokenizer**（应用层切词） |
| S-3 | 外部修改冲突处理 | **Obsidian 风格**：autosave debounce 2s + chokidar 监听 + clean 热重载 / dirty 弹 toast + conflicts/ 兜底 + 状态栏指示 |
| S-4 | 文件删除 | `shell.trashItem()` 扔**系统回收站**（不自建 trash/） |
| S-5 | 理果版本历史 | 覆盖 frontmatter 前备份至 `.acornvo/history/<relpath>/v<n>.yml`，保留最近 5 版或 30 天 |
| S-6 | 搜索 UI | `Cmd/Ctrl+P` 文件跳转 + `Cmd/Ctrl+Shift+F` 全文搜索，两入口分开 |
| S-7 | AI 成本观测 | 仅记录 token 用量 + 估算成本（按日/月/模型聚合），**不设预算限制** |
| S-8 | 首次启动引导 | **极简**，直接进树林选择器（Project Picker）；顶部 banner 提示"尚未配置模型" |
| S-9 | 自动更新 | `electron-updater` 后台下载 + 用户确认安装，仅 `stable` 通道 |
| S-10 | 崩溃上报 | 不做远程上报，仅 `electron-log` 本地文件 |
| S-11 | 性能 / 大库 | TanStack Virtual 虚拟列表 + p-queue + **SQLite 持久化队列** + 启动全量索引带进度 + chokidar 增量 |

---

## 技术栈

| 层次 | 选型 |
|---|---|
| 桌面框架 | **Electron 32+**（主进程 + 渲染进程） |
| 前端框架 | **React 19 + TypeScript 5** |
| 构建/打包 | **electron-vite + electron-builder**（macOS dmg、Windows nsis、Linux AppImage） |
| UI 组件 | **shadcn/ui + Tailwind CSS 4** |
| 虚拟列表 | **@tanstack/react-virtual** |
| 内置浏览器 | **WebContentsView**（Electron 30+ 推荐，替代已弃用的 BrowserView） |
| 网页 → markdown | **@mozilla/readability + turndown + turndown-plugin-gfm** |
| Markdown 编辑器 | **Vditor**（vanilla，React 里封一层壳） |
| 本地数据库 | **better-sqlite3**（同步 API，主进程使用） |
| 中文分词 | **@node-rs/jieba**（Rust napi，三平台预编译 binary） |
| 状态管理 | **Zustand**（轻量，符合项目复杂度） |
| 路由 | **React Router（memory router）** |
| LLM 接入 | **@mariozechner/pi-ai**（统一多 provider 接口） |
| Agent 框架 | **@mariozechner/pi-agent-core**（松语的 tool calling 驱动） |
| 聊天 UI | **@mariozechner/pi-web-ui**（或按需自建于 shadcn 上） |
| API Key 存储 | **Electron `safeStorage`**（内置） |
| 回收站 | **Electron `shell.trashItem()`**（内置） |
| 文件监听 | **chokidar** |
| Frontmatter | **gray-matter** |
| AI 响应校验 | **zod** |
| 队列 | **p-queue**（内存层）+ 自建 SQLite 持久化表 |
| i18n | **i18next + react-i18next** |
| 日志 | **electron-log** |
| 自动更新 | **electron-updater**（v1 启用，stable 通道） |

---

## 项目架构

```
acornvo/
├── electron/                    # 主进程
│   ├── main.ts                  # 应用入口、窗口管理、updater 初始化
│   ├── ipc/                     # IPC handlers
│   │   ├── project.ts           # 树林增删改查、打开/切换
│   │   ├── file.ts              # md 文件读写、冲突协调
│   │   ├── clip.ts              # 拾果：网页抽取 + md 转换
│   │   ├── browser.ts           # WebContentsView 生命周期
│   │   ├── ai.ts                # 理果、松语调用 pi-ai/pi-agent-core
│   │   ├── search.ts            # 文件跳转 + 全文搜索
│   │   ├── usage.ts             # token 用量查询
│   │   └── settings.ts          # 全局/树林设置读写
│   ├── services/
│   │   ├── clipper.ts           # Readability + Turndown 封装
│   │   ├── frontmatter.ts       # gray-matter 封装
│   │   ├── indexer.ts           # md 文件 → SQLite 索引同步（含启动全量进度）
│   │   ├── tokenizer.ts         # @node-rs/jieba 分词 + FTS5 写入/查询适配
│   │   ├── watcher.ts           # chokidar 监听 + 冲突/热重载分派
│   │   ├── conflict.ts          # 外部修改冲突检测 + conflicts/ 写入
│   │   ├── history.ts           # frontmatter 版本历史写入/清理
│   │   ├── ai-reviewer.ts       # 理果：结构化抽取 prompt
│   │   ├── ai-agent.ts          # 松语：pi-agent-core + tools
│   │   ├── queue.ts             # p-queue + SQLite 持久化 + 重启恢复
│   │   ├── usage.ts             # 调用记录 + 费用估算
│   │   ├── keychain.ts          # safeStorage 封装：API Key 加密读写
│   │   ├── trash.ts             # shell.trashItem 封装
│   │   ├── updater.ts           # electron-updater 封装
│   │   └── db.ts                # better-sqlite3 实例 + migrations
│   └── tools/                   # pi-agent-core 工具定义
│       ├── read-file.ts
│       ├── list-files.ts
│       ├── grep-files.ts
│       └── write-markdown.ts
├── src/                         # 渲染进程（React）
│   ├── pages/
│   │   ├── ProjectPicker.tsx    # 树林选择器：列表/新建/打开
│   │   ├── Browser.tsx          # 拾果：浏览器 + 拾果按钮
│   │   ├── Library.tsx          # 果仓视图：树林内 md 文件列表（虚拟化主视图）
│   │   ├── Editor.tsx           # Vditor 编辑器 + 理果面板
│   │   ├── Chat.tsx             # 松语对话
│   │   └── Settings.tsx         # 通用/模型/拾果/理果/用量/关于
│   ├── components/
│   │   ├── BrowserTabs.tsx      # 多标签页管理
│   │   ├── VditorWrapper.tsx    # Vditor React 封装
│   │   ├── FrontmatterPanel.tsx # 侧边 Frontmatter 表单 + 回滚历史版本入口
│   │   ├── VirtualFileList.tsx  # TanStack Virtual 渲染大量文件
│   │   ├── BookmarkList.tsx
│   │   ├── FileMention.tsx      # @ 选择文件
│   │   ├── QuickSwitcher.tsx    # Cmd+P 文件跳转面板
│   │   ├── FullTextSearch.tsx   # Cmd+Shift+F 全文搜索面板
│   │   ├── ConflictDialog.tsx   # 外部修改冲突 toast + 对比视图
│   │   ├── StatusBar.tsx        # 底部：理果进度、冲突指示、用量摘要
│   │   ├── UsagePanel.tsx       # 设置里的用量聚合视图
│   │   └── UpdateNotifier.tsx   # 新版本下载完 toast "立即安装/稍后"
│   ├── stores/                  # Zustand stores
│   ├── i18n/
│   │   ├── zh-CN.json
│   │   └── en-US.json
│   └── ipc/                     # 渲染端 IPC 客户端封装
├── preload/
│   └── preload.ts               # contextBridge 暴露安全 API
└── package.json
```

---

## 数据模型

### 树林目录结构（每个树林一独立根目录）

```
我的树林/                     ← 用户选择的树林根目录（vault）
├── inbox/                     ← 果篮：默认采集落盘目录（UI 显示「果篮」，物理名保留 inbox/）
├── 技术/                      ← 用户自由组织的子目录
│   └── 注意力机制综述.md
├── 产品/
├── assets/                    ← 图片等附件（采集时自动下载）
└── .acornvo/                  ← 应用私有目录（git-ignorable）
    ├── index.db               ← SQLite 索引 + 队列 + 用量
    ├── bookmarks.json         ← 标记（树林级，文件名保留 bookmarks）
    ├── chats/                 ← 松语对话历史
    │   └── 2026-04-17-xxxxx.json
    ├── history/               ← frontmatter 版本历史
    │   └── 技术/注意力机制综述.md/
    │       ├── v1.yml
    │       └── v2.yml
    ├── conflicts/             ← 外部修改冲突的磁盘版本快照
    │   └── 注意力机制综述.md.20260417-1035.md
    └── project.json           ← 树林元数据（名称、颜色、默认模型等，文件名保留 project.json）
```

### 全局用户目录

```
~/.acornvo/                   ← 用户级
├── settings.json             ← 主题、语言、模型预设（不含 API Key）
├── secrets.enc               ← safeStorage 加密后的 API Key 密文
├── recent-projects.json      ← 最近打开的树林列表（文件名保留）
└── logs/                     ← electron-log 日志
```

### YAML Frontmatter Schema

```yaml
---
# ─── 拾果阶段（采集时写入） ───────────────
title: 深度学习中的注意力机制
url: https://example.com/attention                 # 原始 URL
site: example.com
author: 张三                                       # 尽力提取
published_at: 2026-03-15                           # 发布时间，ISO 日期
clipped_at: 2026-04-17T10:30:00+08:00              # 采集时间
source_type: article                               # article | rss | manual

# ─── 理果阶段（AI 加工后追加） ───────────────
summary: |
  约 150 字的摘要正文，说明文章核心观点...
highlights:                                        # 3-5 条要点
  - 自注意力机制的核心直觉
  - Transformer 的 position encoding 设计取舍
  - 与 RNN/CNN 的计算复杂度对比
rating: 4                                          # 1-5 星整数
category: 技术/深度学习                             # 单层分类，/ 分隔层级
tags: [attention, transformer, 综述]              # 复用树林词汇表
reviewed_at: 2026-04-17T10:35:00+08:00
reviewed_model: deepseek-chat                      # 使用的模型标识
reviewed_version: 1                                # 理果版本号（重跑时递增）
---

<文章正文 markdown>
```

### SQLite Schema（每个树林一份 `.acornvo/index.db`）

```sql
-- 文件索引（从 md 同步生成，可随时重建）
CREATE TABLE files (
  path TEXT PRIMARY KEY,              -- 相对树林根的路径
  title TEXT,
  url TEXT,
  category TEXT,
  rating INTEGER,
  summary TEXT,
  clipped_at TEXT,
  reviewed_at TEXT,
  mtime INTEGER NOT NULL,             -- 文件 mtime（检测外部修改）
  content_hash TEXT,                  -- 正文 hash（避免重复理果 + 冲突判定）
  frontmatter_json TEXT               -- 完整 frontmatter 原文
);

CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_rating ON files(rating);

-- 标签索引（多对多）
CREATE TABLE tags (
  name TEXT PRIMARY KEY,
  usage_count INTEGER DEFAULT 0       -- 用于词汇表复用时的排序
);
CREATE TABLE file_tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);

-- 全文搜索（tokenizer=simple，中文靠 @node-rs/jieba 应用层预分词存入）
CREATE VIRTUAL TABLE files_fts USING fts5(
  path UNINDEXED, title, summary, content,
  tokenize='simple'
);
-- 写入时：tokenizer.segment(text).join(' ') 后写入 content
-- 查询时：tokenizer.segment(userQuery).join(' OR ') 转为 FTS5 query

-- 标记（表名保留 bookmarks）
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT,
  favicon TEXT,
  created_at TEXT NOT NULL,
  sort_order INTEGER
);

-- 松语对话（元数据索引；消息正文仍落 .acornvo/chats/<id>.json）
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 持久化队列（重启后恢复未完成的理果任务）
CREATE TABLE queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'review' | 'reindex' | ...
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,               -- 'pending' | 'running' | 'failed'
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_queue_status ON queue(status);

-- AI 用量记录（明细）
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                   -- ISO 时间
  purpose TEXT NOT NULL,              -- 'review' | 'chat' | 'title-derive'
  model_id TEXT NOT NULL,             -- 用户预设 ID
  model_name TEXT NOT NULL,           -- 实际模型名
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,            -- 按设置里配置的单价计算
  file_path TEXT,                     -- 关联文件（理果用）
  chat_id TEXT                        -- 关联对话（松语用）
);
CREATE INDEX idx_usage_ts ON usage(ts);
CREATE INDEX idx_usage_model ON usage(model_id);
```

索引由 `services/indexer.ts` 启动时全量扫 + `chokidar` 增量同步维持。**丢了可从 md 完全重建。**
启动全量索引带进度条与取消按钮；`queue / usage / bookmarks / chats` 表不从 md 重建（独立持久化数据）。

---

## 模块设计

### 1. 拾果（Browser / Clipper）

**UI 布局：**
- 顶部 tab 栏（多标签页）+ 地址栏 + 前进/后退/刷新 + 拾果按钮 + 标记按钮
- 主区：`WebContentsView` 承载当前 tab
- 右侧抽屉（可折叠）：标记列表（网址收藏）

**拾果流程：**
1. 用户浏览到目标文章页，点击"拾果"按钮
2. 主进程向当前 `WebContentsView` 注入脚本执行 `@mozilla/readability` 抽取正文 → 返回 HTML + 元信息（title/byline/publishedTime/siteName）
3. 主进程用 `turndown` + `turndown-plugin-gfm` 把 HTML 转 markdown
4. 图片处理：默认**离线化**——下载到 `<project>/assets/<slug>/` 并重写引用为相对路径（可在设置里切换"保留远程 URL"）
5. 组装 YAML Frontmatter（拾果阶段字段）+ 正文，写入 `<树林根>/inbox/<slug>.md`（即「果篮」）
   - slug 生成策略：`<clipped_at:YYYYMMDD>-<标题 kebab 化前 40 字符>.md`，冲突加后缀 `-2`
6. 若设置里"采集完立即理果"开启，enqueue 到持久化队列
7. 应用顶部出现 toast："已拾果 + 理果中...（可跳转查看）"

**标记：**
- 树林级（存 SQLite `bookmarks` 表）
- 扁平列表 + 拖拽排序（先扁平，文件夹作为后续增强）
- 快捷键 `Cmd/Ctrl+D` 收藏当前 tab

**关键文件：**
- `electron/ipc/browser.ts`：tab 创建/切换/销毁、WebContentsView bounds 管理
- `electron/services/clipper.ts`：readability + turndown 流水线
- `src/pages/Browser.tsx` + `src/components/BrowserTabs.tsx`

**安全注意：**
- WebContentsView 的 `webPreferences` 关闭 `nodeIntegration`、启用 `contextIsolation`、不 `preload` 任何主应用脚本
- 主应用渲染进程（React UI）和 WebContentsView 完全隔离

### 2. 理果（AI Reviewer）

**触发：**
- 自动：拾果完成后 enqueue 到 SQLite `queue` 表，`queue.ts` 服务出队并执行
- 手动：文件列表/编辑器顶部的"理果"按钮，支持单篇或多选批量
- 重跑：若 `content_hash` 与 frontmatter 里记录的不同，提示用户"内容已变化，是否重新理果"

**流程：**
1. 读 md 文件 → 解析 frontmatter + body（`gray-matter`）
2. **备份旧 frontmatter**：`history.ts` 把当前 frontmatter 写入 `.acornvo/history/<relpath>/v<n>.yml`（n 递增）
3. 构造 prompt（结构化输出，要求 JSON）：
   - 输入：标题 + 正文（超长时按配置截断：默认取前 12K tokens）
   - 注入当前树林的**标签词汇表**（按 `usage_count` 排前 30 + 最近 30）
   - 注入树林既有分类列表（用于 AI 倾向复用）
   - 约束：rating 1-5、tags 3-5 个、分类单层路径（可 `/` 分隔）
4. 通过 `pi-ai` 调用用户在设置中指定的"理果模型"
5. **记录用量**：`usage.ts` 写入 `usage` 表（input/output tokens、估算成本、file_path、purpose='review'）
6. 用 Zod 校验响应 JSON；失败则重试一次，再失败则标记 `reviewed_error`
7. 合并到 frontmatter 并回写 md 文件
8. 更新 SQLite 索引（`files` + `file_tags` + `tags.usage_count`）

**历史回滚：**
- Frontmatter 侧栏顶部有"历史版本"按钮，列出 `.acornvo/history/<relpath>/*.yml`
- 点击某版 → 预览差异 → 确认恢复 → 覆写当前 frontmatter

**并发 & 队列：**
- 主进程单例 queue（`queue.ts`），基于 p-queue 但与 SQLite `queue` 表双写
- 重启时扫描 `status='pending'|'running'` 的任务恢复执行
- 可配置并发（默认 2），失败重试 1 次（`retry_count`）
- UI 状态栏常驻"理果中 3/10"进度指示 + 暂停/继续按钮

**关键文件：**
- `electron/services/ai-reviewer.ts`：prompt 模板 + pi-ai 调用 + Zod 校验
- `electron/services/queue.ts`：p-queue + SQLite 持久化
- `electron/services/history.ts`：版本历史写入 + 清理（30 天或 >5 版保留）
- `electron/services/usage.ts`：token 记录 + 费用估算
- `src/components/FrontmatterPanel.tsx`：显示 + 历史回滚入口 + 允许用户手动改写

### 3. 松语（Chat Agent）

**UI 布局：**
- 左侧：对话历史列表（可新建会话）
- 中间：消息流（`pi-web-ui` 的聊天组件，或自建于 shadcn 上）
- 底部输入框：
  - `@` 触发文件选择器（检索树林内 md 文件，按标题/路径模糊匹配）
  - 已选文件展示为 chip，可删除
  - 发送快捷键 `Cmd/Ctrl+Enter`
- 顶部：当前模型选择、系统提示编辑入口

**Agent 架构（pi-agent-core）：**

工具定义：

| Tool | 描述 | 实现 |
|---|---|---|
| `read_file(path)` | 读取树林内 md 文件全文 | `fs.readFile` |
| `list_files(subdir?, filters?)` | 列出文件，可按 category/tag/rating 过滤 | SQLite 查询 |
| `grep_files(query, limit=10)` | 按关键字/短语全文检索 | FTS5 + jieba 分词 |
| `write_markdown(path, content)` | 生成新 md 文件（自动加 frontmatter） | 写入 `<project>/chats/` 或用户指定；**目标已存在时拒绝覆盖** |

**上下文装配（@ 文件全文注入 + agent 自主读取）：**
1. 用户 @ 的文件 → 组装为 system 段："用户已主动引用以下文件，优先参考：{file_a 全文}{file_b 全文}..."
2. 同时把 `list_files` / `grep_files` / `read_file` 等工具挂给 agent
3. 超长（超配置 token 上限）时：@ 的文件按优先级裁剪（最上面的最完整），提示"其余将通过工具按需读取"

**生成新文档：**
- 用户说"帮我基于这几篇写一篇综述保存到 技术/综述/"
- Agent 调 `write_markdown("技术/综述/xxx.md", "...")`，应用右下角弹"已生成新文件 xxx.md，查看"

**会话持久化：**
- `.acornvo/chats/<id>.json`，结构：`{id, title, model, createdAt, updatedAt, messages: [...], toolCalls: [...]}`
- 同时往 SQLite `chats` 表写元数据（便于列表查询/排序）
- Title 自动由首轮用户消息前 20 字派生，可编辑

**用量记录：**
- 每轮模型调用结束写 `usage` 表：`purpose='chat'`、`chat_id` 关联会话

**关键文件：**
- `electron/services/ai-agent.ts`：pi-agent-core 初始化 + 工具注册 + 流式响应
- `electron/tools/*`：各 tool 实现
- `src/pages/Chat.tsx` + `src/components/FileMention.tsx`

### 4. 设置（Settings）

**全局设置** (`~/.acornvo/settings.json`)，**不含 API Key**：

```jsonc
{
  "theme": "system",                     // light | dark | system
  "locale": "zh-CN",                     // zh-CN | en-US
  "models": {
    "presets": [
      {
        "id": "deepseek",
        "label": "DeepSeek",
        "provider": "deepseek",          // pi-ai provider id
        "apiKeyRef": "deepseek",         // 在 secrets.enc 中的 key 名
        "baseURL": "https://api.deepseek.com",
        "model": "deepseek-chat",
        "inputPricePerMTokens": 0.14,    // 用量估算（USD/M tokens）
        "outputPricePerMTokens": 0.28
      },
      {
        "id": "claude-opus",
        "label": "Claude Opus (via OpenRouter)",
        "provider": "anthropic",
        "apiKeyRef": "openrouter",
        "baseURL": "https://openrouter.ai/api/v1",
        "model": "anthropic/claude-opus-4",
        "inputPricePerMTokens": 15,
        "outputPricePerMTokens": 75
      }
    ],
    "reviewerModelId": "deepseek",       // 理果用
    "chatModelId": "claude-opus"         // 松语默认
  },
  "clipper": {
    "downloadImages": true,
    "autoReview": true
  },
  "reviewer": {
    "summaryLanguage": "follow-source",  // follow-source | zh-CN | en-US
    "summaryLength": 150,
    "maxInputTokens": 12000
  },
  "editor": {
    "autosaveDebounceMs": 2000,          // Obsidian 风格 autosave
    "defaultMode": "ir"                  // ir | sv | wysiwyg
  },
  "updater": {
    "autoDownload": true,
    "channel": "stable"
  }
}
```

**API Key 真实存储：** `~/.acornvo/secrets.enc` —— `safeStorage.encryptString()` 加密的 JSON `{"deepseek": "sk-xxx", "openrouter": "sk-or-xxx"}`。

**树林级设置** (`<树林根>/.acornvo/project.json`)：树林名、颜色、可覆盖全局的 `reviewerModelId` / `chatModelId`。

**UI：** 分页 Tab：
- **通用**（主题、语言、编辑器、更新）
- **模型**（预设增删改 + API Key 表单 + 连通性测试）
- **拾果**（下载图片、自动理果）
- **理果**（摘要长度、语言、截断阈值、队列并发数）
- **用量**（日/月/模型聚合图表 + 原始调用日志导出）
- **关于**（版本号、检查更新、打开日志目录）

### 5. 树林管理（Project Picker）

**入口：**
- 应用启动时：若 `recent-projects.json` 非空则打开最近使用的树林，否则展示树林选择器（Project Picker）
- 顶部 titleBar 始终有"切换树林"按钮（下拉当前树林 + 最近列表 + 新建 + 打开）

**树林选择器：**
- 新建：选父目录 → 输入树林名 → 生成根目录 + `.acornvo/`
- 打开：选已有目录（可从其它 Obsidian vault 打开，没有 `.acornvo/` 则自动初始化）

**极简引导策略（无独立 onboarding）：**
- 首次启动直接进树林选择器
- 若检测到**未配置任何模型预设**，主视图顶部常驻一条 banner："尚未配置 AI 模型，理果/松语不可用 → [去设置]"
- 理果按钮、松语输入框在未配置时置灰 + tooltip 引导

---

## 安全与存储：API Key 保护（S-1）

### 写入流程

```
用户在设置里输入 API Key
   ↓ (renderer → main IPC: settings.setApiKey)
keychain.ts: safeStorage.encryptString(apiKey) → Buffer
   ↓
读取 ~/.acornvo/secrets.enc 解密为 JSON
   ↓
合并新 key → 整体重新 encryptString → 原子写回 secrets.enc
```

### 读取流程

- 主进程启动时一次性解密 `secrets.enc` 到内存 `Map<apiKeyRef, key>`
- pi-ai 调用前按 `preset.apiKeyRef` 从 Map 取出
- **绝不把明文 key 通过 IPC 发回 renderer**

### 降级与同步考量

- `safeStorage.isEncryptionAvailable()` 为 `false` 时（某些 Linux 无 kwallet/gnome-keyring），`safeStorage` 自动回退到 machine-id 派生密钥的明文加密
- 提示用户"当前环境不提供 OS 级 keychain，keys 使用本地对称加密保护"
- `secrets.enc` 机器绑定——换电脑要重新填 key（设计如此，不跨机同步）

---

## 外部修改冲突处理：Obsidian 风格（S-3）

### 设计目标

允许用户**同时**在 Obsidian（或任何外部编辑器）和 Acornvo 中编辑同一 vault，不发生无声数据丢失。

### 机制

**1. 激进 autosave**
- Vditor 改动后 `editor.autosaveDebounceMs`（默认 2000ms）自动写盘
- 把"内存版本 vs 磁盘版本"不一致的窗口压缩到秒级
- 设置里可关闭（用户需手动 `Ctrl+S`）

**2. chokidar 监听 + 自我过滤**
- `watcher.ts` 监听树林根目录
- 维护一个短期 mtime 集合记录"自己刚写的"，收到事件先查这个集合——命中则忽略
- 未命中才真正判定为外部修改

**3. Clean / Dirty 分叉**

| 当前 Acornvo 状态 | 处理 |
|---|---|
| 该文件**未打开** | 静默更新 SQLite 索引（`indexer.ts`） |
| 该文件已打开但 Vditor **无未保存改动** | 静默热重载 Vditor 内容，用户看到"内容自动更新" |
| 该文件已打开且 Vditor **有未保存改动** | 右上角持久 toast：`note.md 在外部被修改。[查看差异] [保留我的] [用磁盘版本]` |

**4. 冲突解决路径**
- **保留我的** → `conflict.ts` 把磁盘版本复制到 `.acornvo/conflicts/<path>.<timestamp>.md`，然后写内存版本
- **用磁盘版本** → 放弃内存改动，重载 Vditor，无备份（用户主动选择）
- **查看差异** → 弹出 diff 模态，可选择逐段采用（简化版：左右对照 + "用整个磁盘版本"/"用我的整个版本"按钮）

**5. 状态栏指示**
- 只要 `.acornvo/conflicts/` 目录非空，状态栏显示⚠️ + "N 个冲突"按钮
- 点击打开冲突列表，可查看、恢复、删除
- 30 天自动清理（可在设置里关闭/调整）

### 关键文件

- `electron/services/watcher.ts` — chokidar + 自我过滤
- `electron/services/conflict.ts` — 冲突写入 + 列表查询 + 清理
- `src/components/ConflictDialog.tsx` — toast + diff 视图

---

## 回收站与历史版本（S-4 / S-5）

### 文件级删除 → 系统回收站

- 统一走 `trash.ts` 封装的 `shell.trashItem(absPath)`
- 平台行为：
  - macOS：~/.Trash（可从 Finder 还原）
  - Windows：Recycle Bin
  - Linux：`~/.local/share/Trash/files/`（XDG 规范）
- Acornvo 不做自建 trash/ 目录
- 删除事件 → SQLite 同步清掉对应 `files`、`file_tags` 行

### Frontmatter 理果版本历史

- **仅针对理果覆盖**（用户手动编辑的 frontmatter 不备份，走编辑器 undo / 外部备份）
- `history.ts` 在每次理果**覆盖前**：
  1. 读当前 frontmatter → 序列化为 YAML
  2. 写入 `.acornvo/history/<相对路径>/v<n>.yml`，n 递增
  3. 附元信息：`# acornvo-history: version=<n> timestamp=<iso> prev-model=<id>`
- **保留策略**：每个文件保留最新 5 版 + 不超过 30 天；清理任务每晚跑一次
- UI：Frontmatter 侧栏的"历史版本"按钮打开列表（时间戳 + 模型标识 + diff 预览），点击某版可"恢复到此版本"

---

## 搜索 UI（S-6）

### Cmd/Ctrl+P：文件跳转（QuickSwitcher）

- 模糊匹配 `files.title` + `files.path` + `files.category`
- 轻量 modal，最多 20 条结果
- 支持前缀：
  - `>` 命令模式（跳转到"新建树林"、"打开设置"等少量命令）
  - `#` 按标签搜索
- ↑↓ 导航、Enter 打开、Esc 关闭
- 依赖 SQLite `files` 表 + 内存 fuzzy 排序（~1000 条目量级够用）

### Cmd/Ctrl+Shift+F：全文搜索面板

- 侧栏常驻面板（类 VSCode）
- 输入框 + 过滤器（category/tag/rating/日期范围）
- 结果列表：文件标题 + 匹配片段高亮 + 路径
- 点击跳转到 Editor 并定位
- 后端：`search.ts` 用 jieba 分词用户查询 → 转 FTS5 query（`term1 OR term2 OR ...` 或 `AND`，可切换）→ 从 `files_fts` 返回命中 + snippet

---

## 用量追踪（S-7）

### 记录

每次 `pi-ai` 调用后同步写 `usage` 表：

```ts
{
  ts: new Date().toISOString(),
  purpose: 'review' | 'chat' | 'title-derive',
  model_id: 'deepseek',           // 预设 ID
  model_name: 'deepseek-chat',
  input_tokens: 1234,
  output_tokens: 456,
  estimated_cost_usd: 0.00031,    // 按预设的 per-M-tokens 价格计算
  file_path: '技术/xxx.md',
  chat_id: null
}
```

### 查询

- 设置 → 用量 Tab：
  - 折线图：近 30 天每日 token / 成本
  - 饼图：按 `model_id` / `purpose` 聚合
  - 表格：近 100 条原始记录（可导出 CSV）
- 状态栏右下角显示"今日 ¥X.XX"缩略

---

## 性能设计（S-12）

### 文件列表虚拟化

- `VirtualFileList.tsx` 基于 `@tanstack/react-virtual`
- 固定行高 estimate，支持上万条文件稳定滚动
- 数据源：SQLite 分页 + 渲染层按可视窗口拉取

### 队列持久化

- `queue.ts` 双写：
  - 内存 `p-queue` 实例负责调度与并发控制
  - SQLite `queue` 表负责持久化
- Enqueue：`INSERT queue(status='pending')` + `pQueue.add(task)`
- 任务开始：`UPDATE queue SET status='running'`
- 完成/失败：`UPDATE queue SET status='done'|'failed', last_error=?`
- **应用启动**：扫描 `status IN ('pending','running')` 的行，重新入内存队列（'running' → 'pending' 重置）

### 启动全量索引

- 进入树林后，`indexer.ts` 扫描所有 md 文件
- 逐文件：计算 `content_hash`，对比 SQLite 记录
  - Hash 变了 → 解析 frontmatter + 重写 `files` + FTS5
  - 未变 → 跳过
- 全程在 Worker Thread 或主进程后台 tick
- UI：全屏半透明进度条 `索引中 123/5678...` + "在后台继续"按钮（允许用户同时浏览）
- 已索引完毕后才**允许理果/松语**（避免打开到一半的库就让 AI 处理）

### chokidar 增量

- 索引完成后切换为监听模式
- `add`/`change`/`unlink` 各自触发局部更新
- 配合"冲突处理"模块（S-3）做 clean/dirty 分叉

---

## 自动更新（S-10）

- 主进程 `updater.ts` 封装 `electron-updater`
- `channel: 'stable'`，单通道
- 启动时检查一次 + 每 6 小时检查一次
- 发现新版本 → 后台静默下载
- 下载完成 → renderer 收到事件，`UpdateNotifier.tsx` 右下角 toast：`v1.2 已就绪。[立即安装（应用重启）] [稍后]`
- 用户点"稍后" → 下次启动再提示
- 发布通道：GitHub Releases（`latest-mac.yml` / `latest.yml` / `latest-linux.yml`）

---

## 日志与诊断（S-11）

- `electron-log` 写 `~/.acornvo/logs/main-YYYY-MM-DD.log`
- 轮转：每日一个文件，保留 14 天，但文件最大10MB
- 日志级别：生产 `info`，开发 `debug`
- 关键路径：启动、IPC 错误、AI 调用、冲突事件、更新下载
- 设置 → 关于 → "打开日志目录"按钮，方便用户反馈 issue 时附带

---

## 端到端数据流（示例）

```
用户在浏览器拾果 example.com/article
   ↓ (renderer → main IPC: clip.perform)
clipper.ts: Readability(injected JS) → HTML → Turndown → markdown
   ↓
frontmatter.ts: 拼装 clipped frontmatter
   ↓
写入 <树林根>/inbox/20260417-article.md  （即「果篮」）
   ↓ (chokidar 捕获，自我过滤命中 → 跳过)
indexer.ts: 主动更新 SQLite files 表（jieba 分词后写 FTS5）
   ↓ (autoReview=true)
queue.ts: INSERT queue(kind='review') + pQueue.add
   ↓
ai-reviewer.ts:
   - history.ts 备份旧 frontmatter → .acornvo/history/.../v1.yml
   - 构造 prompt → pi-ai 调用
   - usage.ts 写用量记录
   - Zod 校验 → merge frontmatter → 回写 md
   ↓ (chokidar 再次捕获，自我过滤命中 → 跳过)
indexer.ts: 主动更新 files / tags / file_tags / FTS5
   ↓
queue.ts: UPDATE queue SET status='done'
   ↓
UI: StatusBar 进度递减 + toast "已完成理果"
```

---

## 实现阶段建议（供后续 plan 拆分）

> 用户要求先出完整方案，后续再拆分。这里仅作提示性分期，不作最终实施计划。

1. **骨架**：Electron + React + IPC 基础 + 树林选择 + 文件列表（VirtualFileList）+ Vditor 编辑 + autosave（不含 AI）
2. **索引与搜索**：SQLite + jieba + FTS5 + chokidar 增量 + 启动全量进度 + Cmd+P + Cmd+Shift+F
3. **冲突处理与历史**：watcher 自我过滤 + clean/dirty 分叉 + ConflictDialog + history.ts
4. **拾果**：WebContentsView 多标签 + Readability/Turndown + 标记（网址收藏）+ 图片下载
5. **安全存储 + 设置**：safeStorage API Key + 模型预设 UI + 连通性测试
6. **理果**：pi-ai 接入 + prompt + Zod 校验 + 持久化队列 + Frontmatter 侧栏 + 历史回滚 + 用量记录
7. **松语**：pi-agent-core + tool 定义 + 聊天 UI + @ 选择 + 会话持久化 + 用量记录
8. **用量与 i18n**：UsagePanel 图表 + 中英切换 + 主题
9. **自动更新与打包签名**：electron-updater + electron-builder 三平台产物 + macOS notarization + Windows code sign

---

## 关键文件 / 依赖引用

**需要引入的第三方：**
- `@mariozechner/pi-ai`、`@mariozechner/pi-agent-core`、`@mariozechner/pi-web-ui`（来自 https://github.com/badlogic/pi-mono 各子包）
- `vditor`
- `@mozilla/readability`、`turndown`、`turndown-plugin-gfm`
- `better-sqlite3`
- `@node-rs/jieba`
- `@tanstack/react-virtual`
- `gray-matter`
- `chokidar`
- `zod`
- `p-queue`
- `i18next`、`react-i18next`
- `zustand`
- `electron-log`
- `electron-updater`

**Electron 内置能力直接使用：**
- `safeStorage`（API Key 加密）
- `shell.trashItem`（系统回收站）
- `WebContentsView`（内置浏览器）

**关键新建目录：**
- `/Users/aaa/develop/workspace-ai/acornvo/`（整个代码仓在此落地）

**未引入的（明确不做）：**
- 向量库 / embedding（松语走 agent tool 路线，不做 RAG）
- Wikilink 解析（保持标准 md）
- 双向链接面板 / 反向链接
- 插件系统（MVP 不做）
- 云同步（本地优先，后续可做 Obsidian 式的 git/iCloud 同步）
- AI 成本预算上限 / 单次调用前确认弹窗
- 智能文件夹 / 保存的搜索（backlog）
- 首次启动向导 / 教程（仅设置里 banner 提示）
- 远程崩溃上报（Sentry 等）

---

## 验证计划（端到端可跑通的路径）

完成后用以下顺序验证整体功能：

### 验证 1：树林创建、极简引导与浏览
1. 启动应用 → 树林选择器 → 新建树林"测试库" → 选定目录
2. 主视图显示空文件列表 + **顶部 banner "尚未配置 AI 模型"**
3. 左侧 nav 可切换到"浏览器"、"松语"、"设置"
4. 松语输入框、理果按钮处于置灰状态

### 验证 2：API Key 安全存储
1. 设置 → 模型 → 新增预设 → 填 API Key → 保存
2. 关闭应用，检查 `~/.acornvo/settings.json` **不含明文 key**；`~/.acornvo/secrets.enc` 存在且为二进制密文
3. 重新打开应用，"连通性测试"按钮能通过——说明 Key 成功解密
4. 顶部 banner 自动消失，理果/松语可用

### 验证 3：拾果 → 自动理果闭环
1. 浏览器 tab 打开一篇知乎/medium/掘金文章
2. 点击"拾果"按钮
3. 验证：
   - `<树林根>/inbox/`（果篮）下出现新 md 文件
   - frontmatter 含 `title / url / clipped_at`，正文是清洁后的 markdown
   - 图片落在 `<project>/assets/<slug>/` 并在 md 里是相对路径
4. 数秒后 toast "理果完成"
5. 打开该文件，验证 frontmatter 追加了 `summary / highlights / rating / tags / category`
6. 状态栏进度指示消失
7. `.acornvo/history/inbox/<slug>.md/v1.yml` 存在，内容是理果前的原始 frontmatter

### 验证 4：编辑器与 autosave
1. 点开任意文件，Vditor 加载并正确渲染
2. 工具栏切换 IR / SV / WYSIWYG 三模式均正常
3. 输入任意内容，停止输入 2 秒后看到文件 mtime 更新（磁盘已写入）
4. 右侧 Frontmatter 面板显示可编辑，保存后写回 md

### 验证 5：外部修改冲突（Obsidian 风格）
**5a. 未打开的文件被外部改** → 应用不感知（索引静默更新），再次点开看到新内容
**5b. 已打开且 clean** → 外部改后 Vditor 内容自动刷新（热重载）
**5c. 已打开且 dirty** → 外部改后右上角 toast "保留我的 / 用磁盘版本 / 查看差异"
   - 点"保留我的"：`.acornvo/conflicts/` 下出现磁盘版本快照；状态栏显示⚠️ "1 个冲突"
   - 点状态栏⚠️ 能看到冲突列表

### 验证 6：搜索
1. `Cmd/Ctrl+P` → 输入文件名片段 → 列表命中 → Enter 打开
2. `Cmd/Ctrl+Shift+F` → 输入中文关键字（例如"注意力"）→ 命中相关文章（验证 jieba 分词生效）
3. 过滤器：选 `rating >= 4` → 结果仅剩高分文章
4. 点结果项跳转 Editor

### 验证 7：理果历史回滚
1. 对一篇文章手动点"重新理果"两次
2. Frontmatter 侧栏 → "历史版本" → 看到 v1、v2
3. 选 v1 → 预览 diff → 恢复 → frontmatter 回到 v1 的值

### 验证 8：松语对话 + 文件生成
1. 切到"松语"页面，新建会话
2. 输入框 `@` 触发文件选择器，选 2 个 md 文件
3. 问："帮我基于这两篇总结一篇对比笔记，保存到 技术/对比/xxx.md"
4. 验证：
   - Agent 流式输出，过程中可观察到调 `read_file` 工具
   - 最终调 `write_markdown`，`<project>/技术/对比/xxx.md` 出现
   - 侧栏列表自动刷新看到新文件
5. 新会话测试不 @ 文件，让 agent 自己 `grep_files`，确认能找到内容

### 验证 9：用量追踪
1. 执行若干次理果与松语后
2. 设置 → 用量 → 看到折线图/饼图/表格均正确
3. 导出 CSV 可下载
4. 状态栏右下显示"今日 $X.XX"

### 验证 10：回收站
1. 右键文件 → 删除
2. 文件消失；操作系统回收站里能看到（macOS Finder 打开 Trash 验证）
3. SQLite `files` 行已删
4. 从系统回收站还原 → chokidar 检测到 → SQLite 自动重建索引

### 验证 11：队列持久化
1. 批量理果 10 篇文章（并发 2）
2. 队列跑到一半时强制退出应用（Cmd+Q 或 kill）
3. 重新启动
4. 应用自动恢复未完成的任务继续执行
5. 全部完成后 queue 表清理干净

### 验证 12：大库性能
1. 往树林扔 5000 个 md 文件
2. 启动时看到"索引中 123/5000..."进度 + "后台继续"按钮
3. 文件列表滚动流畅（TanStack Virtual 生效）
4. `Cmd+P` 响应迅速（<200ms）

### 验证 13：多树林 & 切换
1. 再新建一个树林，验证两个树林的索引/标记/对话互相隔离
2. 关闭应用再打开，默认进入最近使用的树林

### 验证 14：自动更新
1. 模拟发布新版本（本地 feed 指向测试包）
2. 启动后 30 秒内看到后台下载进度
3. 下载完 → 右下角 toast "新版本就绪"
4. 点"立即安装"→ 应用重启并升级

### 验证 15：多平台构建
1. `npm run build:mac`、`build:win`、`build:linux` 产出安装包
2. 在各目标平台启动，验证 better-sqlite3 / @node-rs/jieba / WebContentsView / Vditor / safeStorage 均正常工作

### 验证 16：i18n
1. 设置里切换中 ↔ 英，所有界面文案即时切换

---

## 边界处理规范

实现时必须显式覆盖。标记含义：🔴 **必须**实现并有测试；🟡 **应该**实现（MVP 内）；🟢 **留 TODO**（实现时加注释标注风险）。

### 跨模块通用约定（🔴 全部必须）

1. **原子写入**：所有 md / `settings.json` / `secrets.enc` / JSON 持久化都走 `writeFileAtomic`（tmp → `fs.rename`），防断电/崩溃留半截文件
2. **大小写敏感性**：内部一律保留原始大小写存路径；macOS APFS 默认大小写不敏感，Linux ext4 敏感——跨平台同步同一树林时在树林选择器警告
3. **同步目录排除**：首启 / 打开树林时若检测到父路径含 `iCloud` / `Dropbox` / `OneDrive` 特征，顶部 banner 提醒"建议将 `.acornvo/` 加入同步排除"，`.acornvo/` 里创建 `.nosync` 和 `.icloud` 占位
4. **编码统一**：读取时 detect UTF-8 BOM / GBK 并转 UTF-8；写回统一无 BOM UTF-8
5. **换行符保留**：读取时统一内部用 LF；写回时保留原文件的换行风格（避免整文件被"虚假修改"）
6. **路径校验**：所有带 `path` 参数的 IPC / tool 调用统一过 `safeResolve(groveRoot, p)`（`groveRoot` 即当前树林根），校验 `path.startsWith(groveRoot)` 且不含 `..`；失败一律拒绝

---

### 拾果 / 浏览器

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | 页面未加载完即点"拾果" | 监听 `did-finish-load` 前禁用按钮，tooltip 提示 |
| 🔴 | 同一 URL 重复采集 | `files.url` 建唯一索引；命中时弹"已采集过，查看 / 新增副本 / 覆盖" |
| 🔴 | 非 http(s) URL（`file://`、`chrome://`） | 前置校验拒绝 + 说明 |
| 🔴 | Readability 抽取结果过短（<200 字） | 弹"抽取结果过短，是否切换选区模式"（选区模式作为 fallback，后续阶段可再增强） |
| 🔴 | 图片 CORS 失败 / 403 | 降级保留原始 URL + 日志，不让整个拾果失败 |
| 🔴 | data URL 图片 | 不下载，原样保留 |
| 🔴 | SVG 含 `<script>` / `on*` 事件 | Turndown 前剥离，禁止进入 md |
| 🟡 | SPA 懒加载（知乎答案需滚动加载） | 拾果前自动滚到底 + 延迟 500ms 再 inject Readability |
| 🟡 | WebContentsView 崩溃/OOM | 监听 `render-process-gone`，自动重建 tab + toast |
| 🟡 | 站点嗅探 Electron UA 拒绝 | 设置里提供"伪装 Chrome UA"开关 |
| 🟡 | 下载链接（PDF/zip） | 拦截 `will-download`，询问"保存到 `assets/` 还是取消" |
| 🟢 | 无限滚动页面 | 目前按"可见 DOM"抽取，后续可做"先滚 N 屏再抽" |

---

### 理果 AI Reviewer

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | LLM 返回非标 JSON（tags 是字符串、rating 是 "4/5"） | Zod 前跑 "宽松 parser"：tags 字符串按 `,/、;` 切分、rating 提取数字；仍失败再重试一次，仍失败标 `reviewed_error` |
| 🔴 | LLM 限流 429 / 超时 | 指数退避（1s/3s/9s）重试 3 次；仍失败任务回 `status='pending'` 等下轮；整批 429 时自动暂停队列 |
| 🔴 | 理果过程中文件被删除/改名 | 任务开始时记录 `path` + `content_hash`；写回前再读一次，hash 不一致则丢弃结果 |
| 🔴 | 同一文件自动 + 手动理果并发 | `queue` 表对 `(path, status IN pending/running)` 加唯一约束 |
| 🔴 | 用户删除了队列中任务引用的模型预设 | 扫 `queue`，相关任务标 `failed: model deleted` 并通知 |
| 🔴 | 空文档 / 只有图片（正文 <50 字） | 跳过理果，标 `reviewed_error: too-short` |
| 🔴 | API Key 失效（401 / 403） | 整队列暂停 + 状态栏⚠️ 提示预设名；用户修复后点"恢复队列" |
| 🟡 | LLM 拒绝生成（安全策略） | 标 `reviewed_error: refused`，不备份历史版本 |
| 🟡 | 超长文章（>100K 字） | MVP：截断前 12K tokens；后续：map-reduce 分段 → 总摘要 |
| 🟡 | AI 返回多余/缺失字段 | Zod `strip` 多余 + 缺失字段用默认；只要核心字段齐就接受 |
| 🟢 | `content_hash` 碰撞 | 极低概率，忽略；若命中以 path + mtime 兜底 |

---

### 松语 Chat Agent

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | `write_markdown` 试图写树林外 | tool 实现统一过 `safeResolve`，越界拒绝 |
| 🔴 | `write_markdown` 覆盖已有文件 | 默认拒绝；agent 需显式传 `overwrite:true` 才允许（防误伤） |
| 🔴 | `write_markdown` 路径含非法字符（Win 的 `< > : " \| ? *`） | 自动规范化：非法字符替 `_`；超长截断到 100 字符 |
| 🔴 | Agent 死循环调用 tool | `pi-agent-core` 设置 `maxIterations=20`，超限终止并返回当前内容 |
| 🔴 | 流式响应中用户关闭窗口 / 切换树林 | AbortController 取消；消息只落盘到最后已确认 chunk |
| 🔴 | @ 的文件在对话中途被删除 | 注入前 stat 一次，不存在的 mention 标灰+警告"此文件已删除" |
| 🟡 | @ 了超大文件（>50K tokens） | 注入改为"frontmatter + 首 5K 字 + 提示 agent 可用 `read_file` 读全文" |
| 🟡 | 会话历史 5MB+ | 超过 N 轮（如 50）提示"建议新开会话"；或滚动压缩（早期轮次摘要化） |
| 🟡 | 切换树林时输入框仍有旧树林的 @ mention | 切换时清空 chips + 正在编辑的 draft |
| 🟢 | Agent 读取二进制文件 | `read_file` 检测非 UTF-8 → 返回 "non-text file" 让 agent 自己处理 |

---

### 外部修改 / 文件系统

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | 文件被外部重命名/移动 | chokidar 的 `unlink`+`add` 对，按 `content_hash` 匹配判定为 rename：更新 `files.path` 而非 delete+insert；联动更新 `history/` / `conflicts/` 子目录 |
| 🔴 | 目录被外部重命名（递归事件风暴） | watcher 进"批处理模式"：事件流稳定 500ms 后统一 flush 到 SQLite |
| 🔴 | `git pull` 一次改 100 个文件 | 同上批处理 + SQLite 单事务提交 |
| 🔴 | 写入时磁盘满 / 权限拒 | `writeFileAtomic` 失败不污染原文件，toast 明确报错 |
| 🔴 | `.acornvo/index.db` 损坏 | 启动 `PRAGMA integrity_check` 失败 → 提示"索引损坏，正在重建" → 从 md 全量重扫 |
| 🔴 | `.acornvo/` 被同步工具拷进 iCloud/Dropbox 导致 WAL 撕裂 | 启动时检测同步目录特征，强提醒；放 `.nosync` / `.icloud` 占位 |
| 🟡 | Windows 路径 > 260 字符 | 启用 `\\?\` 长路径前缀 API；或新建文件时检测深度超限拒绝 |
| 🟡 | Windows 保留字符在路径（clip slug 生成） | slug 阶段过滤 `< > : " \| ? *` 和 `CON/PRN/AUX/NUL` |
| 🟡 | 外部驱动/iCloud 延迟导致写后读不一致 | 写入后 read-back 校验 hash；不一致重试一次 |
| 🟡 | 符号链接指向树林外 | 扫描时忽略 symlink（`fs.stat` 判定）避免循环 / 逃逸 |
| 🟢 | 合并冲突标记（`<<<<<<<`）落到 md | 解析 frontmatter 失败时展示原文 + 提示"检测到合并冲突标记" |

---

### 树林管理

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | 同一树林被两个 Acornvo 实例打开 | `.acornvo/.lock` 含 pid+ts+hostname；第二实例启动时检测，提示"已有实例打开，是否强制接管" |
| 🔴 | 树林根目录被 Finder 删除 | `recent-projects.json` 载入时校验 `fs.existsSync`；失效项打叉并询问"从列表移除？" |
| 🔴 | 树林目录在外部驱动，运行中拔出 | IPC 写入失败 → 进入只读模式 + banner"树林目录不可访问"；恢复后自动解除 |
| 🔴 | `secrets.enc` 换机后解密失败 | 清空内存 keys，顶部 banner"当前机器无法解密旧 API Key，请重新填写" |
| 🟡 | 嵌套 vault（树林 A 的子目录是树林 B） | 打开时沿父链检测其它 `.acornvo/`；有则警告"嵌套树林会造成双重索引" |
| 🟡 | 未初始化的 Obsidian vault 被打开 | 自动创建 `.acornvo/`，提示"已为此 vault 初始化索引" |

---

### 安全

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | Vditor 渲染恶意 md（`<script>`、`<iframe>`、`javascript:` 链接） | Vditor 默认过滤 + 渲染前过 DOMPurify 二次清洗 |
| 🔴 | 所有 AI tool / IPC 的 `path` 参数 | 统一 `safeResolve`，禁绝对路径、父级、越界 |
| 🔴 | Readability 注入脚本被页面劫持 | 主进程拿到结果后严格 schema 校验（title/content 类型），异常字段丢弃 |
| 🔴 | WebContentsView 与主 UI renderer 隔离 | 不挂任何 preload；不开 nodeIntegration；contextIsolation=true |
| 🔴 | `secrets.enc` 文件权限 | macOS/Linux 创建时 `0600`，防同机其它用户读取 |
| 🟡 | 采集的 SVG 含 JS | Turndown 前剥离 `<script>` 和 `on*` 属性 |

---

### Schema 演进 / 迁移

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | SQLite schema 升级 | `db.ts` 用 `PRAGMA user_version` + 顺序 migration 脚本；新版首启时自动跑，失败则回滚并弹错 |
| 🔴 | `settings.json` 字段新增 | 读取时用 Zod + default merge；未知字段保留以便回退 |
| 🔴 | Frontmatter 字段新增 | 旧文件缺失字段——读取时默认值填充；下次理果时补齐 |
| 🟡 | `history/` 格式升级 | 文件首行 `# acornvo-history: version=1`，未来按版本分支处理 |
| 🟡 | bookmarks.json 格式升级 | 同上加 version 字段 |

---

### 应用生命周期 / 平台差异

| 级别 | 场景 | 策略 |
|---|---|---|
| 🔴 | macOS 关窗不退出约定 | Cmd+W 隐藏窗口，Cmd+Q 真正退出 |
| 🔴 | 退出时队列未空 | `before-quit` 拦截，弹"还有 N 个任务在跑，等待完成 / 下次继续 / 立即退出"；选"等待"最多 30s 超时强退 |
| 🔴 | 系统睡眠后唤醒 WebContentsView 僵尸 | 监听 `powerMonitor.resume`，刷新所有 tab |
| 🔴 | macOS 未签名/未公证的 dmg | CI 强制 notarization（Apple Developer 账号必需） |
| 🔴 | Windows SmartScreen 警告 | CI 做代码签名；未来可升级 EV 证书 |
| 🟡 | 多显示器 / 高 DPI 切换 | 监听 `display-metrics-changed`，刷新 Vditor 和 WebContentsView bounds |
| 🟡 | Linux AppImage 自动更新限制 | electron-updater 对 AppImage 支持有限——降级为"检查 + 提示手动下载"并记录日志 |
| 🟢 | macOS App Nap 导致后台队列被挂起 | 长任务期间 `powerSaveBlocker.start('prevent-app-suspension')` |

---

## 风险与缓解

| 风险 | 缓解策略 |
|---|---|
| Readability 对部分站点抽取质量差 | 支持"用户手动框选正文再拾果"作为 fallback（后续阶段） |
| LLM 返回非合法 JSON | Zod 校验 + 一次重试 + 标记 `reviewed_error` 不阻断用户 |
| better-sqlite3 / @node-rs/jieba 原生模块跨平台构建 | 两者均有 prebuilt binary；`electron-rebuild` + CI 三平台验证 |
| WebContentsView API 还在演进 | 固定 Electron 版本；封装一层 service 隔离调用点 |
| 图片下载失败/超时 | 设置超时 + 失败保留原始 URL + 记录日志 |
| AI 费用不受控（未做预算上限） | 设置里"用量"页可观察；可随时关闭自动理果或降低队列并发 |
| `safeStorage` 在部分 Linux 降级为明文加密 | 启动时检测并在 UI 明确提示；文件权限设为 `0600` |
| 外部频繁改动触发 chokidar 风暴 | watcher 自我过滤 + debounce + 批量提交 SQLite 事务 |
| `history/` / `conflicts/` 目录膨胀 | 定时清理任务（30 天/版本数上限）+ 设置里可调 |
| jieba 词典带 ~15MB + binary 增大安装包 | 可接受（Electron 应用基线 150MB+，增量可控） |
| `shell.trashItem` 在无桌面环境的 Linux 失败 | 捕获异常 → 降级为提示"环境不支持回收站，确认永久删除？" |
| 同步工具（iCloud/Dropbox）破坏 SQLite WAL | 启动时检测同步目录特征强提醒；`.nosync` 占位；文档告知 |
| 跨平台大小写敏感性不一致 | 树林选择器检测并警告；内部保留原始大小写；查询时一律 case-sensitive |
