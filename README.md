<div align="center">
  <h1>🌰 Acornvo 松言果语</h1>
  <p><b>A Local-First, AI-Native Personal Knowledge Management Desktop App</b></p>
  <p>
    <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-blue.svg?logo=react" alt="React 19" /></a>
    <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-Desktop-47848f.svg?logo=electron" alt="Electron" /></a>
    <a href="https://langchain.com/"><img src="https://img.shields.io/badge/LangChain-AI-1C3C3C.svg" alt="LangChain" /></a>
  </p>
</div>

---

Acornvo (松言果语) 是一款专注于**本地优先**与 **AI 原生** 的个人知识管理（PKM）桌面应用。它致力于帮助你将散落在网页、笔记和文件夹中的碎片信息，整合为一个可长期保存、全文搜索、并能与之自由对话的 Markdown 知识库。

> [!NOTE]
> **真正的本地优先**：你的所有笔记都以纯 Markdown 文件的形式保存在本地，绝无厂商锁定。Acornvo 只做索引和赋能，你的数据完全兼容 Obsidian、VS Code 等主流编辑器。

## 🌟 核心理念：信息管理的三段工作流

Acornvo 的设计围绕着 **「拾果、理果、松语」** 三段核心工作流展开，覆盖了从信息收集、整理到消费的完整生命周期。

### 1. 拾果 (Clipper)：将互联网变成你的本地果园
告别繁琐的复制粘贴。Acornvo 内置了多标签页浏览器，支持一键将任何网页的正文内容深度提取并转换为纯净的 Markdown 文件，直接存入你的本地「树林」中。
- 内置浏览器，边阅读边剪藏。
- 自动提取正文，去除广告与干扰元素。

### 2. 理果 (Reviewer)：让 AI 成为你的私人档案管理员
面对堆积如山的未读文件？交给 AI 吧。Acornvo 可以自动对你的 Markdown 笔记进行深度审读。
- 自动生成：摘要、推荐标题、标签、分类、评分。
- 智能元数据：所有 AI 生成的洞察都会标准化地写入 Markdown 的 Frontmatter (YAML) 中。
- **人在回路**：你可以一键接受、拒绝或要求 AI 重新生成。

### 3. 松语 (Chat)：与你的知识库面对面交谈
阅读只是开始。在「松语」界面，你可以直接与你的本地知识库进行对话。
- **引用本地文件**：让 AI 基于你指定的本地 Markdown 文件回答问题、梳理逻辑或进行深度写作。
- **极致的对话体验**：基于 `assistant-ui` 和 `LangChain` 构建，提供极速的流式响应和优雅的交互 UI。

---

## ✨ 核心特性

- **🌲 多「树林」管理 (Workspaces)**：支持多工作区，每个「树林」都是一个独立的本地文件夹，轻松隔离不同领域的知识。
- **🤖 模型自由 (Model Agnostic)**：自带统一大模型配置。原生支持 OpenAI、Ollama（本地运行）、DeepSeek、OpenRouter 等，云端本地任你选择。
- **⚡ 闪电搜索 (Fast Search)**：内置基于 SQLite 和 `@node-rs/jieba` 中文分词的强大搜索引擎。
- **📝 现代编辑器 (Vditor)**：集成 Vditor Markdown 编辑器，所见即所得，自动保存，并能优雅处理外部修改冲突。
- **🔒 隐私与安全 (Privacy)**：不强制要求任何云同步。API Key 等敏感信息使用操作系统原生安全能力加密存储。

---

## 🛠️ 数据存储：透明且自由

Acornvo 拒绝黑盒数据库。你的知识库（树林）目录结构清晰可见：

```text
我的知识库/
├── inbox/                 # 果篮：默认的网页剪藏目录
├── tech/                  # 你的自定义分类
│   └── 2026-AI-Trends.md  # 你的知识，纯粹的 Markdown
└── .acornvo/              # Acornvo 私有数据缓存
    └──  index.db           # 缓存数据、SQLite 索引、松语对话记录的 Checkpoints
```

---

## 📦 安装与下载

Acornvo 支持主流桌面操作系统。请前往 [Releases](https://github.com/your-org/acornvo/releases) 页面下载最新版本：

| 平台 | 安装包格式 | 说明 |
| :--- | :--- | :--- |
| **macOS** | `.dmg` | 提供 Apple Silicon (arm64) 和 Intel (x64) 架构 |
| **Windows** | `.exe` | 一键安装包 |

---

## 💻 开发者指南

我们非常欢迎开发者参与到 Acornvo 的共建中来。应用基于现代前端与客户端技术栈构建：

**核心技术栈：**
- **框架**: Electron, React 19, TypeScript, Vite
- **UI & 样式**: Tailwind CSS v4, shadcn/ui, Radix UI
- **AI 生态**: assistant-ui, LangChain, LangGraph
- **本地能力**: better-sqlite3, chokidar, @node-rs/jieba

**本地运行：**

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```

**常用命令：**

```bash
npm run lint         # 代码检查
npm run typecheck    # 类型推断
npm run test         # 运行测试
```

**打包构建：**

```bash
npm run build:mac    # macOS 打包
npm run build:win    # Windows 打包
```

---

## 📅 路线图 (Roadmap)

Acornvo 正处于快速迭代期，接下来的重点方向包括：
- [ ] 更智能、更精准的网页正文解析引擎
- [ ] 完善的 AI 自动标签系统与自动分类
- [ ] 基于向量数据库的语义搜索 (RAG)
- [ ] 对话上下文持久化与多轮深度生成能力扩展

## 📄 许可证 (License)

未声明许可证 (暂定)。
