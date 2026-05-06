# bookmarks-store Specification

## Purpose
Manages bookmark persistence via SQLite schema and IPC layer for CRUD operations on bookmarks with URL deduplication, tag-based filtering, and search.

## Requirements
### Requirement: bookmarks Schema
系统 SHALL 在 `migrations/004_bookmarks.sql` 创建：
```sql
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  favicon TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_url ON bookmarks(url);
```
`PRAGMA user_version` MUST 推进到 `4`。`tags_json` MUST 存合法 JSON 数组字符串（或 NULL）。

#### Scenario: Migration 执行
- **WHEN** 启动 phase 11 版本
- **THEN** 004 执行后 `user_version=4`；`bookmarks` 表可查询

### Requirement: bookmarks IPC
系统 SHALL 提供以下 IPC：
- `bookmarks.list({ q?, tag?, limit, offset }) → { items: Bookmark[], total }`：可按 q（title/url LIKE）或 tag 过滤
- `bookmarks.create({ url, title, favicon, tags }) → Bookmark`：url 必填；重复 url 返回 `E_DUPLICATE`，附现有 id
- `bookmarks.update(id, patch) → Bookmark`：允许改 title/tags/favicon；不允许改 url
- `bookmarks.delete(id) → { ok: true }`
- `bookmarks.getByUrl(url) → Bookmark | null`（UI 判是否已加入书签）

#### Scenario: 新增
- **WHEN** `bookmarks.create({ url: 'https://x.com', title: 'X', tags: ['news'] })`
- **THEN** 返回新行（含 id、created_at）；DB 行可查

#### Scenario: 重复 url
- **WHEN** 已存在 `https://x.com` 的行再次调 `create`
- **THEN** 返回 `{ ok: false, error: { code: 'E_DUPLICATE', existingId: <id> } }`

#### Scenario: 列表 + 过滤
- **WHEN** `bookmarks.list({ q: 'news', limit: 50 })`
- **THEN** 返回 title 或 url 含 "news" 的 50 行以内，按 created_at 降序

#### Scenario: 按 tag 过滤
- **WHEN** `bookmarks.list({ tag: 'news' })`
- **THEN** 返回 tags_json 含 "news" 的行（SQL 侧用 `tags_json LIKE '%"news"%'` 粗匹配，接受轻微假阳性；精确比对在 renderer parse 后过滤）

#### Scenario: 删除
- **WHEN** `bookmarks.delete(<id>)`
- **THEN** 对应行被 DELETE；后续 `getByUrl` 该 url 返回 null

### Requirement: 书签数据去重
`bookmarks.create` 对 `url` 的 UNIQUE 约束失败时 MUST 返回 `E_DUPLICATE` 且携带现有 id。UI 可用该 id 进入编辑模式（弹编辑 modal 而非新建）。

#### Scenario: UI 切到编辑
- **WHEN** 用户点"加入书签"按钮，但 url 已存在
- **THEN** IPC 返回 `E_DUPLICATE` + existingId；UI 调 `bookmarks.update(existingId, ...)` 或弹 modal 让用户改 tags
