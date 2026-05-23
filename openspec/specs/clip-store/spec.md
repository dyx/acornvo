## ADDED Requirements

### Requirement: clips 表 schema

migration 005 SHALL 创建 `clips` 表：

```sql
CREATE TABLE clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  site TEXT,
  author TEXT,
  published_at TEXT,
  clipped_at TEXT NOT NULL,
  excerpt TEXT,
  content_length INTEGER,
  degraded INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_clips_clipped_at ON clips(clipped_at DESC);
CREATE INDEX idx_clips_site ON clips(site);
```

migration SHALL 把 `user_version` 设为 5。

#### Scenario: 迁移到 5

- **WHEN** 应用启动时 `PRAGMA user_version = 4`
- **THEN** 执行 migration 005；执行后 `user_version = 5`；`clips` 表存在

#### Scenario: URL 唯一

- **WHEN** 尝试插入两次 url 相同的 row
- **THEN** 第二次 INSERT 失败（SQLITE_CONSTRAINT_UNIQUE）

### Requirement: CRUD IPC

`shared/ipc-contract.ts` SHALL 声明命名空间 `clips`：

- `create(input) → { id } | { error: E_DUPLICATE, existingId }`
- `list({ q?, site?, limit, offset, orderBy?: 'clipped_at'|'title' }) → { items, total }`
- `getByUrl(url) → Clip | null`
- `getById(id) → Clip | null`
- `delete(id) → void`

`list` 的 `q` MUST 在 title / url / excerpt 三列上做 LIKE 匹配（不区分大小写）。

#### Scenario: create 去重

- **WHEN** 调 `clips.create({ url, ... })` 且 url 已存在
- **THEN** 返回 `{ error: 'E_DUPLICATE', existingId }`，不抛 JS 异常

#### Scenario: list 按时间降序

- **WHEN** 调 `clips.list({ limit: 20, offset: 0 })`
- **THEN** items 按 clipped_at DESC 排序，最多 20 条

#### Scenario: list 按 site 过滤

- **WHEN** 调 `clips.list({ site: 'example.com' })`
- **THEN** 仅返回 site 等于 `example.com` 的记录

#### Scenario: getByUrl

- **WHEN** 目标 url 已存在
- **THEN** 返回该 Clip 对象，含 path 字段

### Requirement: 删除策略

`clips.delete(id)` MUST 只删除 clips 表行；不 MUST 删除对应 md 文件（文件删除由 phase 10 `file.trash` 独立触发）。调用方若需"同时删除文件 + 记录"要分别调两个 IPC。

#### Scenario: 仅删记录

- **WHEN** 调 `clips.delete(42)`
- **THEN** clips 表该行消失；`inbox/202604/xxx.md` 仍存在
