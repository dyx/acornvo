# agent-checkpointer Specification

## Purpose
TBD - created by archiving change phase-19-ai-langchain-migration. Update Purpose after archive.
## Requirements
### Requirement: SqliteSaver 集成
系统 SHALL 使用 `@langchain/langgraph-checkpoint-sqlite` 作为 LangGraph 的持久化 checkpointer，并在应用启动时实例化为单例传给 `createAgent({ checkpointer })`。该 checkpointer MUST 与 LangGraph 默认 schema 兼容。

#### Scenario: app 启动时构造 checkpointer
- **WHEN** Electron main 进程在 `app-lifecycle` 启动阶段初始化 agent runner
- **THEN** SqliteSaver 单例被构造并注入到 `createAgent` 的 `checkpointer` 选项

#### Scenario: 普通对话不依赖 checkpointer 携带历史
- **WHEN** 普通对话轮调 `agent.stream({ messages: [...完整历史] }, { configurable: { thread_id: sessionId } })`
- **THEN** 历史显式由 messages 数组传入；checkpointer 仅记录运行时 state，不被读用作历史源

#### Scenario: HITL resume 时从 checkpointer 加载状态
- **WHEN** 用户审批后调 `agent.invoke(new Command({ resume }), { configurable: { thread_id: sessionId } })`
- **THEN** LangGraph 从 checkpointer 加载暂停时的 state 续跑，调用方 MUST NOT 传入 messages

### Requirement: 表结构
迁移 `electron/db/migrations/002_langgraph_checkpoints.sql` SHALL 显式登记 3 张表（即使 SqliteSaver 能自动建）：
- `checkpoints(thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)`
- `checkpoint_writes(thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)`
- `checkpoint_blobs(thread_id, checkpoint_ns, channel, version, type, blob)`

显式登记使备份与 diagnostic bundle 工具能发现该表。

#### Scenario: migration 应用
- **WHEN** `PRAGMA user_version` 低于 checkpointer migration 设定的版本
- **THEN** 该 migration 执行；3 张表存在；user_version 提升

#### Scenario: 与 SqliteSaver 自建表共存
- **WHEN** SqliteSaver 启动时检测到 3 张表已存在
- **THEN** 不重复建表；运行时正常读写

### Requirement: thread_id 约定
所有 `agent.stream` 与 `agent.invoke` 调用 MUST 使用 `configurable.thread_id = sessionId`。系统 MUST NOT 维护 thread_id 与 session_id 的额外映射表。

#### Scenario: thread_id 等于 session_id
- **WHEN** runner 触发某 sessionId 的 LangGraph 调用
- **THEN** `configurable.thread_id` 直接传 sessionId，不做 hash / 前缀变换

### Requirement: 级联删除
`chat.deleteSession(sessionId)` SHALL 在同一事务中删除 checkpointer 3 张表中 `thread_id = sessionId` 的所有行。

#### Scenario: 删除 session 同时清理 checkpointer
- **WHEN** 用户删除 sessionId='abc'
- **THEN** sessions / session_messages / tool_calls 中 session_id='abc' 的行被删除，且 checkpoints / checkpoint_writes / checkpoint_blobs 中 thread_id='abc' 的行也被删除；操作在同一事务内

#### Scenario: 删除不存在的 thread 不报错
- **WHEN** sessionId='abc' 在 checkpointer 中无任何记录（从未触发 HITL）
- **THEN** 级联 DELETE 影响 0 行，整体事务成功

### Requirement: 启动时恢复挂起审批
app 启动时 SHALL 扫描 checkpointer 中所有未 resolve 的 interrupt，并对每个 interrupt 重新 emit `tool.approval-needed` 事件到对应 session 的 stream，使用户重启后能继续审批。

#### Scenario: 重启时已有挂起审批
- **WHEN** app 关闭前有 sessionId='abc' 的 update_frontmatter 工具处于 interrupt 状态；app 重启
- **THEN** 启动钩子读取 `checkpointer.get({ configurable: { thread_id: 'abc' } })`；若 `state.next` 含 `__interrupt__`，对每个 `state.__interrupt__[*]` emit `tool.approval-needed { callId, tool, args }`；callId 使用 interrupt id

#### Scenario: 无挂起 interrupt 时启动正常
- **WHEN** app 重启且无任何 session 处于 interrupt 状态
- **THEN** 启动钩子扫描 0 个 thread；无额外事件 emit；启动流程不阻塞

### Requirement: cancel 后 thread 保留 24h
`agent.cancel({ sessionId })` SHALL 不立即清理 checkpointer 中该 thread 的状态；状态 MUST 保留 24h 供潜在重连或调试使用，超过 24h 后由后台清理任务删除。

#### Scenario: cancel 后短时间内重启仍可恢复
- **WHEN** 用户在 HITL 等待中 cancel；10 分钟后 app 重启
- **THEN** checkpointer 中该 thread 状态仍存在；可视使用方需求决定是否重 emit approval-needed 或忽略

#### Scenario: 24h 后过期清理
- **WHEN** 某 thread 最后更新时间早于 24h 前且无活跃 session 引用
- **THEN** 后台清理任务删除该 thread 的 checkpoints / checkpoint_writes / checkpoint_blobs 行

