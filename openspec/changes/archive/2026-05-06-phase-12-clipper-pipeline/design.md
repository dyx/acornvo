## Context

前置：

- phase 4：`file.write(path, {body, frontmatter}, expectedMtime?)` 原子写；路径沙箱 `safeResolve`
- phase 5：`file.upsert` 索引入口；chokidar 的 selfWrites 窗口使剪藏写入不触发外部修改事件
- phase 10：`ops_log` 表，剪藏落 `op='clip'`
- phase 11：WebContentsView 的 webContents 句柄可拿到当前 URL / title / DOM；AddressBar 有"剪藏"占位按钮
- phase 14 / 15：剪藏入 `clip_queue` → AI reviewer 消化

PRD S-7 把剪藏定为拾果核心动作，**不能跳浏览器**、**不能丢失正文**、**不能产出格式凌乱的 md**。

技术取舍：

- **DOM 正文抽取**可选路线：
  - (A) main 侧 `webContents.executeJavaScript(readabilityCode)` 在 tab 内跑 Readability，返回结果对象
  - (B) main 侧拿 `webContents.savePage` 或 `executeJavaScript('document.documentElement.outerHTML')` 再在 Node 里 `jsdom` + Readability
  - **采纳 A**：零额外依赖 jsdom；Readability 官方就支持浏览器环境；速度更快；与原页面上下文一致（含 CSS 后的 layout 无关，Readability 只看 DOM）
- **HTML → Markdown** 在哪里转：
  - (A) renderer：但 HTML 由 main 侧 webContents 来，拉过去成本大
  - (B) main：Node 侧 `turndown`，**采纳**
- **资源（图片）**：下载到本地 vs 远程引用
  - 下载：需处理配额、CORS、认证墙图；复杂度高
  - **远程引用**：保持 `![alt](https://...)`；phase 后续可加离线化策略

## Goals / Non-Goals

**Goals:**

- 用户在 phase 11 浏览器打开任意文章 → 点剪藏按钮或 `Cmd+Shift+S` → 预览 modal 显示抽取结果 → 保存到 `inbox/YYYYMM/<slug>.md`
- frontmatter 包含足够元信息，让 phase 15 AI reviewer / phase 17 松语能识别"这是一篇 Web 剪藏"
- 去重：对同一 URL 重复剪藏不产生重复文件
- pipeline 每步可观测、可出错回滚
- 转换出的 md 在 phase 7 编辑器能正确渲染（标题层级、代码块、图片、引用、表格、列表）

**Non-Goals:**

- 不做图片本地化下载（远程 URL 引用即可；phase 13 预埋设置项）
- 不做付费墙 / 登录墙绕过（登录态共享 session，phase 11 已处理）
- 不做批量 URL 剪藏 / RSS 订阅（本阶段单页为主）
- 不做 PDF / YouTube 等非 HTML 资源剪藏（phase 13+）
- 不做剪藏目录可配置（固定 `inbox/YYYYMM/`；phase 13 设置页解耦）
- 不做剪藏队列持久化（phase 14 做）
- 不做 AI 摘要 / 标签建议（phase 15 做）
- 不做"选中段落剪藏"（只剪整篇；phase 13+ 扩展）

## Decisions

### D1: Readability 执行位置 = main 侧 executeJavaScript

- `electron/clipper/extract.ts`:
  ```ts
  async function extract(webContents: WebContents): Promise<ExtractResult> {
    const code = await fs.readFile(readabilityBundlePath, 'utf8')
    // inject readability
    await webContents.executeJavaScript(code)
    // run
    const result = await webContents.executeJavaScript(`
      (function() {
        try {
          const doc = document.cloneNode(true);
          const article = new Readability(doc).parse();
          return {
            ok: true,
            title: article?.title,
            byline: article?.byline,
            content: article?.content, // html string
            textContent: article?.textContent,
            length: article?.length,
            excerpt: article?.excerpt,
            siteName: article?.siteName,
            lang: article?.lang,
            publishedTime: article?.publishedTime,
            url: location.href,
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })();
    `)
    return result
  }
  ```
- Readability bundle 随 App 打包（`node_modules/@mozilla/readability/Readability.js`，无依赖，单文件）
- 失败降级：若 Readability 抽取不到 `article`（空指针），拿 `document.body.innerHTML` 整页作为 fallback，并在 pipeline 标记 `degraded: true`

### D2: Turndown 配置

- `electron/clipper/transform.ts`:

  ````ts
  import TurndownService from 'turndown'
  import { gfm } from 'turndown-plugin-gfm'

  const td = new TurndownService({
    headingStyle: 'atx', // # ## ###
    codeBlockStyle: 'fenced', // ```
    emDelimiter: '*',
    strongDelimiter: '**',
    bulletListMarker: '-',
    linkStyle: 'inlined',
    hr: '---'
  })
  td.use(gfm) // 表格、删除线、任务列表

  // 清洗规则
  td.addRule('removeScript', { filter: ['script', 'style', 'noscript'], replacement: () => '' })
  td.addRule('removeComments', { filter: (n) => n.nodeType === 8, replacement: () => '' })
  td.addRule('preserveCodeBlock', {
    /* 防止 Turndown 把 <pre><code> 双转 */
  })
  // 图片：保留 alt 和 title；URL 保持原样
  // 链接：相对链接要转为绝对（用 article.url 作为 base）
  ````

- 相对路径绝对化：先用 `new URL(href, baseUrl).href` 规整，再交给 Turndown
- 清除属性：`<img>` 的 `srcset`/`data-*`/`class` 丢弃（让编辑器渲染干净）
- 输出 body 字符串，不含 frontmatter（frontmatter 由 pipeline enrich 阶段拼）

### D3: Frontmatter 与 slug

```yaml
---
title: '...'
url: 'https://...'
site: 'example.com'
author: '...'
published_at: '2026-04-19T00:00:00Z'
clipped_at: '2026-04-19T10:23:11+08:00'
source_type: web
tags: []
excerpt: '...'
lang: zh
---
```

- `title` 取 Readability 返回的 article.title；空时 fallback webContents.getTitle()
- `site` = `new URL(url).hostname`
- `author` = Readability 的 byline；可含"By XXX"前缀，清洗后写入（按 `/^\s*[Bb]y\s+/` 去掉）
- `published_at` 尝试 Readability.publishedTime；空时从 `<meta property="article:published_time">` 兜底；再空则省略（不写空字段）
- `tags` 初始为 `[]`；用户可在预览 modal 添加
- `excerpt` 截首 160 字

**slug 规则**：

- 中文标题：先 jieba 取前 3 个词 + sha1(url).slice(0,6)
- 英文标题：`slugify(title, { lower: true, strict: true }).slice(0, 50)` + `-` + sha1(url).slice(0,6)
- 全失败：`clip-<yyyymmdd>-<sha6>`
- 保证唯一性在 pipeline 的 dedupe 阶段，slug 只负责可读性

### D4: Pipeline 状态机

```
idle → extracting → previewing → saving → indexing → done
                        ↓
                      canceled
   任一步骤 error → error (可 retry 回到对应阶段)
```

- renderer store 持该状态；按钮 UI 按状态变灰 / spinner
- pipeline 每步打 `ops_log`（`op='clip.extract'` / `op='clip.transform'` / `op='clip'` 表示最终完成）

### D5: 去重（dedupe）

- migration 005 clips 表的 `url` UNIQUE
- pipeline 进入前先 `SELECT id, path FROM clips WHERE url = ?`：
  - 命中 → 不走 extract；弹 "已剪藏过，是否打开？" 对话框；用户点"打开"→ phase 7 编辑器导航到 `clip.path`
  - 未命中 → 进入 extract

### D6: 写入路径冲突

- 目标 `inbox/YYYYMM/<slug>.md` 已存在（极罕见碰撞，slug 已含 url 的 sha6）：
  - 自动 fallback 为 `<slug>-1.md` / `-2.md` 递增
  - 不走 phase 9 冲突对话框（剪藏非并发编辑场景）
- 不存在目录时 pipeline 侧 mkdir -p

### D7: Clips 表 schema

```sql
CREATE TABLE clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,           -- 相对 vault 的路径
  title TEXT,
  site TEXT,
  author TEXT,
  published_at TEXT,
  clipped_at TEXT NOT NULL,
  excerpt TEXT,
  content_length INTEGER,
  degraded INTEGER DEFAULT 0,   -- 0/1：是否使用 fallback 抽取
  created_at TEXT NOT NULL
);
CREATE INDEX idx_clips_clipped_at ON clips(clipped_at DESC);
CREATE INDEX idx_clips_site ON clips(site);
```

对应 IPC：

- `clips.list({ q?, site?, limit, offset, orderBy }) → { items, total }`
- `clips.getByUrl(url) → Clip | null`
- `clips.getById(id) → Clip | null`
- `clips.delete(id) → void`（只删 clip 记录；md 文件删除由 file.trash 另行触发）

### D8: Preview Modal

打开时机：extract 成功 → pipeline 进入 `previewing` 态 → renderer 弹 modal

内容：

- 顶部：title（可编辑）、URL（只读链接 + copy 按钮）
- 左栏：frontmatter 字段编辑（tags 逗号分隔输入、excerpt、published_at 只读）
- 右栏：正文 markdown preview（前 2000 字，复用 phase 7 的 Vditor preview 模式）
- 底部：目标文件路径（只读，slug + 月份目录）、"保存到 inbox" 按钮、"取消"、"重新抽取" 按钮（触发 degraded fallback 时可见）

### D9: Clip 按钮与快捷键

- AddressBar 右侧剪刀图标：
  - 默认灰色；hover 显示 tooltip "剪藏此页（Cmd+Shift+S）"
  - 当前 URL 已剪藏 → 图标变实色 + 右下角小对勾；点击弹 "已剪藏，是否打开原剪藏文件？"
- 快捷键：`Cmd/Ctrl+Shift+S`（`/browser` 路由聚焦时生效）
- about:blank / acorn://new-tab / 非 http(s) URL → 按钮 disabled

### D10: 错误态与重试

- extract 失败（超时 5s / executeJavaScript 抛错 / article=null 且 fallback 也空）→ modal 显示 "无法抽取正文" + "查看原始 HTML" + "强制保存整页"
- transform 失败（turndown throw）→ modal 显示 "HTML 转 Markdown 失败" + 打印错误；允许 "保存原始 HTML 到 `.clip.html`"（降级方案，phase 13 可清理）
- write 失败（磁盘满 / 权限）→ 标准 error toast；pipeline 回 `error` 态；允许 retry
- index 失败不阻塞用户；后台重试（指数退避 3 次）

### D11: i18n key

```
browser.clip.save
browser.clip.extracting
browser.clip.saved
browser.clip.error
browser.clip.exists.title
browser.clip.exists.open
browser.clip.preview.title
browser.clip.preview.tags
browser.clip.preview.save
browser.clip.preview.cancel
browser.clip.preview.reextract
browser.clip.error.extract
browser.clip.error.transform
browser.clip.error.write
```

### D12: 与 phase 14 / 15 解耦

- pipeline 在 write 成功后调 `clipQueue.enqueue({ clipId, url, path })`
- phase 14 前这是内存空 adapter（no-op），phase 14 替换为持久化队列
- phase 15 前 reviewer 也是空实现；pipeline 不等待其返回，只"触发入队"即完成

## Risks / Trade-offs

- [Readability 对中文某些站点（公众号等）抽取效果一般] → pipeline 保留 degraded 模式 + fallback 原始 HTML；phase 13+ 可接入自定义 site rules
- [turndown 表格/嵌套列表的保真度] → GFM plugin 已覆盖主流；极端 case（嵌套 table）可能降级为段落；编辑器侧 Vditor ir 能渲染绝大多数 md
- [relative URL 没 base] → enrich 阶段强制 `new URL(href, article.url)`，若无 url 跳过链接
- [图片远程 URL 失效] → 占位策略；未来加本地化
- [慢页面 extract 耗时] → 超时 5s；用户可重试；执行期间 UI 显示 spinner，tabs 仍可切
- [用户在 extract 期间关闭 tab / 切 tab] → pipeline 不取消；webContents 仍 alive 时可完成；若 tab 被销毁则 pipeline 置 canceled

## Migration Plan

- migration 005 创建 clips 表 + 索引
- phase 2 vault 初始化已建 `inbox/`；本阶段使用 `inbox/YYYYMM/`（pipeline 侧 mkdir）
- 回滚：删 migration 005；移除剪藏 IPC；AddressBar 剪藏按钮退回 phase 11 占位 toast

## Open Questions

- 剪藏保存目录是否支持用户自定义？→ **phase 13 再开**，本阶段固定
- 是否把 excerpt 写入 body 首段（方便编辑器搜索）？→ **不写**，frontmatter 已有；避免冗余
- `Cmd+Shift+S` 是否与 OS 截图冲突（macOS Shift+Cmd+3/4）？→ 不冲突（`Shift+S` 没被占用）
- 图片本地化应进 phase 13（设置"离线化图片"开关）还是 phase 15 预处理 → **phase 13 的 settings 预埋开关**，phase 15 按需处理
