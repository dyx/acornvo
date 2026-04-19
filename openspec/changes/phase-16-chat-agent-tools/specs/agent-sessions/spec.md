## ADDED Requirements

### Requirement: 表结构
migration 009 SHALL 建：
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_messages_session ON session_messages(session_id, id);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id INTEGER,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_json TEXT,
  approved INTEGER,
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);
```
`user_version` 设为 9。

#### Scenario: 迁移到 9
- **WHEN** `PRAGMA user_version = 8`
- **THEN** migration 009 执行；user_version=9；三张表存在

#### Scenario: 级联删除
- **WHEN** 删除一个 session
- **THEN** 对应 session_messages 与 tool_calls 全部消失（ON DELETE CASCADE 或应用内事务保证）

### Requirement: CRUD
`agent-sessions` 模块 SHALL 提供：
- `createSession({ title?, profileId? }) → { id }`；默认 title='新对话'；profileId 缺省用 settings.ai.defaultProfileId
- `listSessions({ limit, offset }) → { items, total }`，按 updated_at DESC
- `getSession(id)` / `deleteSession(id)`
- `appendMessage(sessionId, message)`；同时更新 session.updated_at
- `getMessages(sessionId)`：按 id ASC 返回全部
- `updateTitle(id, title)`
- `recordToolCall({ sessionId, messageId, toolName, args })`
- `finishToolCall(callId, { result?, error?, approved? })`：更新 finished_at、result_json/error、approved 字段

#### Scenario: 创建 session
- **WHEN** 调 `createSession()`
- **THEN** 新行插入；返回 id；默认 title='新对话'；profileId=defaultProfileId（可为 null）

#### Scenario: 首条消息自动设置 title
- **WHEN** session title='新对话' 时用户 append 第一条 user message（content='分析一下我的 attention 笔记'）
- **THEN** sessions.title 被自动更新为该 content 的前 40 字（可带省略号）

### Requirement: ai_usage 关联
每次 tool 内调用 LLM 或 agent loop 调用 LLM 时 MUST 在 `ai_usage` 插入行，`session_id` 字段填当前 sessionId。

#### Scenario: 一次对话 3 步 LLM
- **WHEN** 一次 sendUserMessage 导致 3 次 LLM 调用
- **THEN** ai_usage 新增 3 行，每行 session_id = 当前 sessionId

### Requirement: ai_usage 表扩展
本阶段 SHALL 对 phase 15 的 `ai_usage` 表追加列 `session_id TEXT`（migration 009 内执行 `ALTER TABLE ai_usage ADD COLUMN session_id TEXT`）。已有行该字段为 NULL；新写入时填当前 sessionId（若为 agent 上下文）。

#### Scenario: 迁移添加列
- **WHEN** migration 009 完成
- **THEN** `PRAGMA table_info(ai_usage)` 含 session_id 列
