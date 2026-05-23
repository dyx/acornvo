# 松言果语 Acornvo

本地优先的 AI 个人知识管理桌面应用。

Acornvo 帮你把散落在网页、笔记和资料夹里的内容整理成可长期保存、可搜索、可对话的 Markdown 知识库。它围绕「拾果、理果、松语」三段工作流设计：先从网页采集内容，再用 AI 做结构化整理，最后基于本地文件进行对话和写作。

> 图片占位：后续可将截图放到 `docs/assets/readme/`，并替换下方图片。

![Acornvo 总览](docs/assets/readme/overview.png)

## 核心工作流

### 拾果：把网页收入本地

使用内置浏览器阅读网页，一键将文章抽取为 Markdown，保存到当前「树林」中。采集后的内容仍是普通 `.md` 文件，可被 Obsidian、VS Code 或任意文本编辑器打开。

![拾果界面](docs/assets/readme/clipper.png)

### 理果：让 AI 整理笔记

Acornvo 可以对 Markdown 内容进行 AI 审读，生成摘要、建议标题、标签、分类、评分和关键引用，并写入 Frontmatter。你可以接受、拒绝或重新运行 AI 结果。

![理果界面](docs/assets/readme/review.png)

### 松语：和你的知识库对话

在松语中引用本地文件，让 AI 基于你的资料回答问题、梳理观点、生成新文档。数据源来自你的本地 Markdown，而不是被锁进某个云端服务。

![松语界面](docs/assets/readme/chat.png)

## 为什么选择 Acornvo

- **本地优先**：Markdown 文件是真实数据源，SQLite 只作为索引、缓存和任务状态。
- **Obsidian 兼容**：可以直接打开已有 Markdown 目录，也可以把 Acornvo 管理的目录交给 Obsidian 使用。
- **采集到写作一体化**：内置浏览器、网页剪藏、AI 审读、全文搜索和知识库对话在同一个桌面应用里完成。
- **中文友好**：内置中文分词搜索，适合中文资料、双语阅读和本地知识库检索。
- **多模型接入**：通过统一的 AI 配置使用不同提供商与模型，适配云端模型或本地模型。
- **跨平台桌面应用**：目标支持 macOS、Windows 和 Linux。

## 功能亮点

- 多「树林」管理，每个树林都是一个独立知识库目录。
- 果仓视图浏览、筛选、预览和搜索 Markdown 文件。
- 内置多标签浏览器，支持收藏、网页采集和阅读内容抽取。
- Vditor Markdown 编辑器，支持自动保存和外部修改冲突处理。
- AI 审读结果可回写 Frontmatter，便于后续分类、检索和复用。
- 松语对话支持引用本地文件，并通过工具读取、检索和生成 Markdown。
- `Cmd/Ctrl+P` 快速跳转文件，`Cmd/Ctrl+Shift+F` 全文搜索。
- API Key 使用系统安全能力存储。
- 本地日志、诊断包、任务队列和自动更新能力。

## 安装

前往 [Releases](https://github.com/<org>/<repo>/releases) 下载对应平台安装包。

| 平台    | 安装包                                                      | 说明                                      |
| ------- | ----------------------------------------------------------- | ----------------------------------------- |
| macOS   | `Acornvo-<version>-arm64.dmg` / `Acornvo-<version>-x64.dmg` | Apple Silicon 选择 arm64，Intel 选择 x64  |
| Windows | `Acornvo-<version>-setup.exe`                               | 运行安装器即可                            |
| Linux   | `Acornvo-<version>.AppImage`                                | 执行 `chmod +x Acornvo-*.AppImage` 后运行 |

## 快速开始

1. 启动 Acornvo。
2. 新建一片「树林」，或打开已有 Markdown 目录。
3. 在「拾果」中打开网页，采集为 Markdown。
4. 在「果仓」中浏览、筛选和打开文件。
5. 配置 AI 提供商后，在编辑器中运行「理果」，或进入「松语」和本地文件对话。

## 数据如何存放

Acornvo 不把你的笔记锁进专有数据库。一个典型树林目录如下：

```text
我的树林/
├── inbox/                 # 果篮：默认采集目录
├── 技术/
│   └── 注意力机制综述.md
├── 产品/
└── .acornvo/              # Acornvo 私有数据
    ├── index.db           # 搜索索引、队列、用量等缓存数据
    ├── bookmarks.json     # 浏览器收藏
    ├── chats/             # 松语对话记录
    ├── history/           # Frontmatter 历史
    └── conflicts/         # 外部修改冲突快照
```

真实内容始终是树林中的 Markdown 文件。`.acornvo/` 用于保存应用运行所需的索引和元数据。

## 开发运行

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

平台打包：

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

## 技术栈

- Electron + electron-vite
- React + TypeScript
- Vditor Markdown 编辑器
- SQLite / better-sqlite3
- @node-rs/jieba 中文分词
- LangChain / LangGraph
- Ant Design X
- Zustand
- i18next
- electron-builder

## 当前状态

Acornvo 仍在快速迭代中。核心方向包括：

- 更稳定的网页采集与正文抽取。
- 更可控的 AI 审读与 Frontmatter 合并。
- 更完整的本地知识库对话和 Markdown 生成流程。
- 更好的跨平台安装、更新和诊断体验。

## 许可证

暂未声明许可证。
