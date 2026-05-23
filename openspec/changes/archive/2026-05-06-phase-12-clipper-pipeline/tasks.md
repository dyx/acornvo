## 1. 依赖与 schema

- [x] 1.1 `package.json`：添加 `@mozilla/readability`、`turndown`、`turndown-plugin-gfm`、`slugify`
- [x] 1.2 `migrations/005_clips.sql`：建 clips 表 + 索引；`user_version = 5`
- [x] 1.3 `shared/clipper-types.ts`：`ExtractResult` / `ClipInput` / `ClipResult` / `ClipErrorCode`
- [x] 1.4 `shared/clip-types.ts`：`Clip` 行模型

## 2. main 侧 extractor

- [x] 2.1 `electron/clipper/readability-bundle.ts`：import Readability 源码字符串（打包时内联）
- [x] 2.2 `electron/clipper/extract.ts`：`extract(webContents)` 注入 + 调用 + 5s 超时
- [x] 2.3 fallback 路径：article=null → 返回 `{ degraded: true, content: body.innerHTML }`
- [x] 2.4 `electron/clipper/enrich.ts`：URL 清洗（去 hash / utm\_ / fbclid 等）、site 规整、author 去前缀、published_at 兜底、lang 回退、excerpt 截取

## 3. main 侧 transformer

- [x] 3.1 `electron/clipper/transform.ts`：turndown 实例 + GFM plugin + 基础选项
- [x] 3.2 HTML 预清洗：移除 script/style/noscript/comments；strip class/id/data-\*/style/srcset
- [x] 3.3 相对链接绝对化（`<a href>` / `<img src>` 基于 article.url）
- [x] 3.4 空壳节点压缩（空 p/span/div）

## 4. Pipeline 与去重

- [x] 4.1 `electron/clipper/dedupe.ts`：`clips.getByUrl` 封装
- [x] 4.2 `electron/clipper/slug.ts`：中英文 slug 规则 + url sha6
- [x] 4.3 `electron/clipper/pipeline.ts`：orchestrate extract → enrich → transform → preview → save → index → record
- [x] 4.4 pipeline 错误枚举：E_UNSUPPORTED_SCHEME / E_ALREADY_CLIPPED / E_EXTRACT_TIMEOUT / E_EXTRACT_EMPTY / E_TRANSFORM_FAILED / E_WRITE_FAILED / E_INDEX_FAILED
- [x] 4.5 `clipQueue.enqueue` no-op 占位（phase 14 替换）

## 5. IPC

- [x] 5.1 `shared/ipc-contract.ts` 追加 `clipper` 命名空间：`clip(tabId, overrides?)` / `saveClip(input)` / `cancelClip(clipRunId)` / `reextract(clipRunId)`
- [x] 5.2 追加 `clips` 命名空间：`create` / `list` / `getByUrl` / `getById` / `delete`
- [x] 5.3 `electron/ipc/clipper.ts`：调 pipeline；维护 `clipRunId → { stage, result }` Map
- [x] 5.4 `electron/ipc/clips.ts`：SQLite CRUD + prepared statements；create 冲突返回 `E_DUPLICATE + existingId`

## 6. renderer 状态机与 UI

- [x] 6.1 `src/stores/clipper.ts`：`state: idle | extracting | previewing | saving | indexing | done | error | canceled`
- [x] 6.2 `src/stores/browser.ts` 扩展：订阅 `did-navigate` + 查 `clips.getByUrl(url)` 更新 `tab.isClipped`
- [x] 6.3 `src/components/browser/ClipPreviewDialog.tsx`：title / tags / excerpt 编辑、body preview（2000 字）、目标路径显示、按钮
- [x] 6.4 `src/components/browser/AddressBar.tsx` 更新：剪刀按钮状态（disabled / 空心 / 实心+勾 / spinner）
- [x] 6.5 剪藏按钮的"已剪藏"确认框：点"打开"→ navigate `/editor/:path`
- [x] 6.6 错误态 toast / inline 按钮（查看原始 HTML / 强制保存整页 / 保存为 .clip.html / 重试）

## 7. 快捷键

- [x] 7.1 `Cmd/Ctrl+Shift+S`：`/browser` 聚焦时触发剪藏
- [x] 7.2 非支持 URL（about:blank/ acorn://new-tab / non-http）按下后 toast "当前页面不支持剪藏"

## 8. i18n

- [x] 8.1 添加 key：`browser.clip.save` / `extracting` / `saved` / `error` / `exists.title` / `exists.open` / `preview.*` / `error.extract` / `error.transform` / `error.write` / `unsupported`

## 9. 验收

- [x] 9.1 打开 `example.com` 某文章 → 点剪藏 → Modal 弹出 → title / body preview 正确
- [x] 9.2 Modal 填 tags "ai,news" → 保存 → `inbox/YYYYMM/<slug>.md` 出现；frontmatter 完整；clips 表新增
- [x] 9.3 对同一 URL 再点剪藏 → 弹"已剪藏，是否打开？"→ 确认后打开 `/editor/:path`
- [x] 9.4 剪藏后切回该 tab → 按钮变为实心+对勾
- [x] 9.5 剪藏后在另一 tab 打开新 URL → 按钮回空心
- [x] 9.6 中文文章 slug 含 jieba 分词结果；英文文章 slug 为 slugify 结果
- [x] 9.7 extract 超时（模拟 5.1s 页面）→ 错误 UI 显示"无法抽取正文" + "强制保存整页"；点击后走 degraded 流程成功写入
- [x] 9.8 Readability 返回 null 的页面（测试用低信噪比 HTML）→ degraded=true；clips.degraded = 1；UI 提示"部分抽取"
- [x] 9.9 相对链接 `<a href="/x">` → markdown 中为绝对 URL
- [x] 9.10 图片 `<img srcset=...>` → markdown 只保留 alt + src；无 srcset
- [x] 9.11 代码块 `<pre><code class="language-ts">` → markdown 为 ```ts 围栏
- [x] 9.12 GFM 表格 HTML → markdown 表格保真
- [x] 9.13 about:blank / acorn://new-tab → 按钮 disabled；`Cmd+Shift+S` no-op + toast
- [x] 9.14 `clips.list({ q: 'news' })` 命中 title/url/excerpt 含 news 的行
- [x] 9.15 `clips.list({ site: 'example.com' })` 命中 site = example.com 的行
- [x] 9.16 `clips.delete(id)` 只删 DB 行；md 文件仍在
- [x] 9.17 write 失败模拟（磁盘满）→ clips 表无插入；pipeline 进入 error；允许重试
- [x] 9.18 剪藏成功后 `ops_log` 新增 `op='clip'` 行；`clipQueue.enqueue` 被调（phase 12 no-op）
- [x] 9.19 `openspec validate phase-12-clipper-pipeline --strict` 通过
