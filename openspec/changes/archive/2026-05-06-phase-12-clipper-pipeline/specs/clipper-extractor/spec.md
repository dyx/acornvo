## ADDED Requirements

### Requirement: Readability 注入与调用

main 侧 SHALL 对给定的 `WebContents` 执行：

1. `webContents.executeJavaScript(readabilityBundleSource)` 将 `@mozilla/readability` 的 `Readability` 构造器注入 tab 作用域（打包的单文件脚本）
2. 在 tab 内执行 `new Readability(document.cloneNode(true)).parse()`，取返回对象 `{ title, byline, content, textContent, excerpt, siteName, lang, publishedTime, length }`
3. 连同 `location.href` 一并 serialize 回 main

执行超时 MUST 为 5000ms；超时 MUST 返回 `{ ok: false, error: 'EXTRACT_TIMEOUT' }`。

#### Scenario: 正常抽取

- **WHEN** 当前 tab 为 `https://example.com/article`，Readability 成功解析
- **THEN** extract 返回 `{ ok: true, title, content: '<article>html</article>', textContent, url, ... }`

#### Scenario: 超时

- **WHEN** 页面 DOM 过大或脚本阻塞超过 5s
- **THEN** extract 返回 `{ ok: false, error: 'EXTRACT_TIMEOUT' }`

#### Scenario: Readability 解析不到文章

- **WHEN** `Readability.parse()` 返回 `null`
- **THEN** extract 进入 fallback 流程：返回 `{ ok: true, degraded: true, title: doc.title, content: document.body.innerHTML, url }`

### Requirement: URL 与元信息增强（enrich）

extract 结果 MUST 经 enrich 阶段补齐 / 规整以下字段：

- `url`：去除 URL hash（`#xxx`）与追踪参数（`utm_*`, `fbclid`, `gclid`, `ref`）
- `site`：`new URL(url).hostname`，去掉 `www.` 前缀
- `author`：基于 Readability `byline`，清洗前缀 `/^\s*[Bb]y\s+/` 与空白
- `published_at`：优先 `article.publishedTime`；空则读 `<meta property="article:published_time">` 与 `<meta name="date">`；空则省略
- `lang`：优先 `article.lang`；空则读 `<html lang>`；再空则省略
- `excerpt`：截首 160 字符（Readability 返回的 excerpt 或 textContent）

#### Scenario: URL 规整

- **WHEN** 原 URL 为 `https://www.example.com/a?utm_source=x&id=1#section`
- **THEN** enrich 后 url = `https://www.example.com/a?id=1`；site = `example.com`

#### Scenario: 作者去前缀

- **WHEN** byline 为 "By John Doe"
- **THEN** author = "John Doe"

#### Scenario: published_at 兜底

- **WHEN** Readability 未提供 publishedTime，但页面 meta 含 `article:published_time=2026-03-01T10:00:00Z`
- **THEN** published_at = `2026-03-01T10:00:00Z`

### Requirement: degraded 模式标记

当 extract 走 fallback（Readability 为空）时，结果 MUST 附带 `degraded: true`；pipeline 写入 `clips` 表时 MUST 持久化该字段到 `degraded` 列。

#### Scenario: degraded 写入

- **WHEN** degraded=true 的剪藏最终保存成功
- **THEN** `clips.degraded = 1`；UI preview modal 显示 "部分抽取，效果可能较差" 提示
