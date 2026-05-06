## ADDED Requirements

### Requirement: HTML → Markdown 转换
`electron/clipper/transform.ts` SHALL 使用 `turndown` + `turndown-plugin-gfm` 把抽取到的 HTML body 转为 Markdown body（不含 frontmatter）。配置 MUST 为：
- `headingStyle: 'atx'`
- `codeBlockStyle: 'fenced'`
- `emDelimiter: '*'`
- `strongDelimiter: '**'`
- `bulletListMarker: '-'`
- `linkStyle: 'inlined'`
- `hr: '---'`

MUST 注册 GFM plugin（表格、删除线、任务列表）。

#### Scenario: 标准 HTML 转换
- **WHEN** 输入 `<h1>A</h1><p>hello <strong>world</strong></p><ul><li>x</li></ul>`
- **THEN** 输出 `# A\n\nhello **world**\n\n- x\n`

#### Scenario: 表格转换
- **WHEN** 输入 GFM 格式 `<table>` 含 thead / tbody
- **THEN** 输出 Markdown 表格，含 `| --- |` 分隔行

#### Scenario: 代码块保真
- **WHEN** 输入 `<pre><code class="language-ts">const a = 1;</code></pre>`
- **THEN** 输出 ` ```ts\nconst a = 1;\n``` `

### Requirement: HTML 清洗规则
transform 入口 SHALL 在 turndown 之前对 HTML 做清洗：
- 移除 `<script>` / `<style>` / `<noscript>` / 注释节点
- 移除元素的 `class` / `id` / `data-*` / `style` / `srcset` 属性（保留 `href` / `src` / `alt` / `title` / 代码 `class="language-*"`）
- 相对链接（`href`/`src`）通过 `new URL(value, articleUrl).href` 转绝对
- 去除空的 `<p>` / `<span>` / `<div>` 壳

#### Scenario: 相对链接绝对化
- **WHEN** articleUrl=`https://example.com/a/b`，原 HTML 含 `<a href="/c">`
- **THEN** 输出中的链接为 `[...](https://example.com/c)`

#### Scenario: 清洗脚本与样式
- **WHEN** HTML 含 `<script>alert(1)</script><style>p{}</style><p>hello</p>`
- **THEN** 输出 markdown 只有 `hello`，不含脚本或样式

#### Scenario: 移除跟踪 class
- **WHEN** `<p class="x" data-track="1">hi</p>`
- **THEN** 输出 `hi`（属性不出现在最终 md）

### Requirement: 图片处理
图片 MUST 保留远程 URL（`![alt](url)`）；MUST NOT 下载到本地；若 `<img>` 无 alt 则 alt 为空字符串。

#### Scenario: 保留远程图片
- **WHEN** 输入 `<img src="https://cdn.example.com/a.png" alt="图1">`
- **THEN** 输出 `![图1](https://cdn.example.com/a.png)`
