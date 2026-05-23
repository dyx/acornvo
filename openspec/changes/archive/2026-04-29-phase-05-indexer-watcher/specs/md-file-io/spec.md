## MODIFIED Requirements

### Requirement: 基础文件操作

系统 SHALL 提供 `file.read(rel)` / `file.write(rel, content, opts?)` / `file.stat(rel)` / `file.exists(rel)` / `file.list(dirRel, { recursive, includeHidden })` / `file.rename(oldRel, newRel)` IPC 方法。所有 `rel` 参数 MUST 相对当前树林根且经 `safeResolve` 校验。

**`file.write` 与 `file.rename` 成功后 MUST 向 indexer 的 `selfWrites` 机制登记绝对路径与写入后的 mtime**，供 watcher 自我过滤使用。登记 TTL 为 3 秒。

#### Scenario: list 跳过 symlink

- **WHEN** 对含 symlink 的目录调用 `file.list(rel, { recursive: true })`
- **THEN** symlink 项不出现在返回结果里

#### Scenario: rename 路径越界

- **WHEN** 调用 `file.rename('a.md', '../outside.md')`
- **THEN** IPC 返回 `E_PERMISSION`，源文件未被改动

#### Scenario: 写入后 watcher 不误报

- **WHEN** 应用调用 `file.write('a.md', ...)`
- **THEN** chokidar 随后的 change 事件被自我过滤消费掉，不产生下游 `index:fileChanged`
