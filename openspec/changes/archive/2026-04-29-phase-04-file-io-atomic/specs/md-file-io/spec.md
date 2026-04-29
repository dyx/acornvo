## ADDED Requirements

### Requirement: 原子写入
所有 md 与 JSON 写入 SHALL 走 `writeFileAtomic`：先写 `<abs>.<uuid>.tmp` 并 `fsync`，再 `fs.rename` 为目标文件。跨文件系统时 MUST 回退到 `copyFile + unlink`。进程崩溃或断电时 MUST 不在原路径留下半截文件。

#### Scenario: 正常写入
- **WHEN** 调用 `file.write('note.md', 'content')`
- **THEN** 目标文件存在且内容为 `content`
- **AND** 不在目录中残留 `.tmp` 文件

#### Scenario: 跨文件系统写入
- **WHEN** 树林根与 `os.tmpdir()` 在不同 fs（`EXDEV`），调用 `file.write`
- **THEN** 写入仍然成功；临时文件被清理

#### Scenario: 同路径并发写入
- **WHEN** 两个 `file.write` 以几毫秒间隔针对同一路径并发触发
- **THEN** 两次写入按发起顺序串行完成，磁盘最终内容是第二次写入的内容；无 `.tmp` 残留

### Requirement: 编码与 BOM 规范化
`file.read` SHALL 自动识别并剥离 UTF-8 BOM。若 Buffer 非 UTF-8，系统 MUST 尝试 GBK/GB18030 解码；失败返回 `E_ENCODING`。`file.write` MUST 写入无 BOM UTF-8。

#### Scenario: 读入 UTF-8 BOM
- **WHEN** 读入一个以 `EF BB BF` 开头的文件
- **THEN** 返回的 `content` 不含 BOM，`hadBom: true`

#### Scenario: 读入 GBK 文件
- **WHEN** 读入一个 GBK 编码的中文 md 文件
- **THEN** 返回正确的中文字符串，`originalEncoding: 'gbk'`

#### Scenario: 非法编码
- **WHEN** 读入一个既非 UTF-8 也非 GBK 的二进制文件
- **THEN** IPC 返回 `{ ok: false, error: { code: 'E_ENCODING' } }`

#### Scenario: 写回无 BOM UTF-8
- **WHEN** 调用 `file.write('x.md', 'hello')` 写入新文件
- **THEN** 文件前三字节不是 `EF BB BF`

### Requirement: 换行风格保留
`file.read` SHALL 返回 `eol: 'lf' | 'crlf' | 'mixed'` 指示原文件的换行风格，内部 `content` 字符串一律使用 `\n`。`file.write` MUST 按读入时的 `eol` 原风格回写；新文件默认 `lf`。

#### Scenario: CRLF 文件改写仍是 CRLF
- **WHEN** 读入一个 CRLF 的文件并调用 `file.write(rel, newContent, { eol: 'crlf' })`
- **THEN** 磁盘文件仍以 `\r\n` 结尾

#### Scenario: 新文件默认 LF
- **WHEN** 调用 `file.write('new.md', 'line1\nline2')`（未指定 eol）
- **THEN** 磁盘文件使用 `\n`

### Requirement: 写后校验
`file.write` SHALL 在原子写入后读取一次文件并校验 sha256 与预期一致；不一致时 MUST 等待 50 ms 重试一次；仍不一致 MUST 抛 `E_WRITE_VERIFY`。

#### Scenario: 校验通过
- **WHEN** 写入成功且 fs 立即返回一致内容
- **THEN** IPC 返回 `{ ok: true }`

#### Scenario: 延迟写后最终一致
- **WHEN** 首次读回 sha256 不符，50 ms 后重试一致
- **THEN** IPC 返回 `{ ok: true }`，日志记录一次"write-verify-retry"

#### Scenario: 持续不一致
- **WHEN** 重试后仍不一致
- **THEN** IPC 返回 `E_WRITE_VERIFY`，调用方感知后可自行重试

### Requirement: mtime 乐观锁
`file.write` SHALL 支持可选参数 `expectedMtime: number`。若提供且当前文件 mtime 与其不符，系统 MUST 拒绝写入并返回 `E_MTIME_MISMATCH`（携带当前 mtime）。

#### Scenario: mtime 匹配
- **WHEN** 调用方读取后 mtime=1000，写入时 `expectedMtime: 1000` 且磁盘仍为 1000
- **THEN** 写入成功

#### Scenario: mtime 不匹配
- **WHEN** 其他程序在中间修改文件使 mtime 变为 2000，调用方以 `expectedMtime: 1000` 写入
- **THEN** IPC 返回 `E_MTIME_MISMATCH`，当前内容未被覆盖

### Requirement: 基础文件操作
系统 SHALL 提供 `file.read(rel)` / `file.write(rel, content, opts?)` / `file.stat(rel)` / `file.exists(rel)` / `file.list(dirRel, { recursive, includeHidden })` / `file.rename(oldRel, newRel)` IPC 方法。所有 `rel` 参数 MUST 相对当前树林根且经 `safeResolve` 校验。

#### Scenario: list 跳过 symlink
- **WHEN** 对含 symlink 的目录调用 `file.list(rel, { recursive: true })`
- **THEN** symlink 项不出现在返回结果里

#### Scenario: rename 路径越界
- **WHEN** 调用 `file.rename('a.md', '../outside.md')`
- **THEN** IPC 返回 `E_PERMISSION`，源文件未被改动
