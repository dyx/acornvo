## Why

Acornvo 的真实数据源是本地 markdown 文件。从索引器到编辑器到拾果到理果，每个 change 都要读写 md + frontmatter。若各自直接用 `fs.promises.writeFile`，会遇到**断电/崩溃留半截文件**、**UTF-8 BOM / GBK 混入**、**CRLF/LF 被隐式改写触发假冲突**、**路径越界（写到树林外）** 等一系列重复问题。本阶段把 md 读写、frontmatter 解析、路径护栏一次封装好，后续所有 change 直接复用，同时统一行为以便边界条件可在一处测试。

## What Changes

- **原子写入**：`writeFileAtomic(absPath, data)` —— `<abs>.<uuid>.tmp` + `fs.rename`；跨文件系统回退到 `fs.copyFile + unlink`
- **编码规范化**：读取时检测 UTF-8 BOM（剥离）与 GBK/GB18030（`iconv-lite` 解码）；非法字节触发 `E_ENCODING`；写入统一无 BOM UTF-8
- **换行保留**：读取时记录原文件的换行风格（LF / CRLF / mixed）；内部统一用 LF 处理；回写时按原风格输出；新文件默认 LF
- **frontmatter codec**：基于 `gray-matter` 封装 `parseFile(md)` / `stringify(frontmatter, body)`；frontmatter 用 Zod schema 校验，未知字段保留（passthrough）；YAML 量风格保留尝试（依赖 gray-matter 默认）
- **Frontmatter schema（初版）**：对齐 PRD `title/url/site/author/published_at/clipped_at/source_type`（拾果阶段） + `summary/highlights/rating/category/tags/reviewed_at/reviewed_model/reviewed_version`（理果阶段），所有字段 `.optional()` 且未知键保留
- **safeResolve 路径守卫**：`safeResolve(groveRoot, p)` 解析并校验 `resolved.startsWith(groveRoot)` 且不含 `..`；禁绝对路径逃逸 / 符号链接指向外部
- **统一文件 IPC 表面**：`file.read(rel)` / `file.write(rel, content, expectedMtime?)` / `file.stat(rel)` / `file.exists(rel)` / `file.list(dirRel, { recursive })` / `file.rename(oldRel, newRel)`；全部走当前树林（`currentGrovePath`）+ `safeResolve`
- **写后读回校验**：写入后立即读一次计算内容 hash，不一致则重试一次；仍不一致抛 `E_WRITE_VERIFY`（应对 iCloud/OneDrive 延迟）
- **mtime 乐观锁**：`file.write` 的 `expectedMtime` 与磁盘不符时返回 `E_MTIME_MISMATCH`（供冲突处理使用，phase 9 接入；本阶段只提供机制）
- **符号链接策略**：`file.list` 跳过 symlink（fs.lstat 判定）避免循环 / 越界
- **大小写敏感性约定**：内部一律保留原始大小写存路径；磁盘大小写不敏感时（macOS APFS 默认）不主动规范化路径
- **不在本阶段**：文件删除（走 `shell.trashItem`，phase 10）；监听（chokidar，phase 5）；冲突 UI（phase 9）

## Capabilities

### New Capabilities
- `md-file-io`: 树林内 md 文件的原子读写、stat、list、rename；编码/BOM/LF 规范化；写后校验
- `frontmatter-codec`: gray-matter + Zod 的 frontmatter 解析、序列化、字段校验、未知字段保留
- `path-safety`: `safeResolve(groveRoot, p)` 路径校验工具，所有面向磁盘的 IPC / tool 调用必经

## Impact

- **新增代码**：`electron/services/fs-atomic.ts`、`electron/services/frontmatter.ts`、`electron/services/path-safety.ts`、`electron/ipc/file.ts`、`shared/frontmatter-schema.ts`
- **契约扩展**：`shared/ipc-contract.ts` 增加 `file` 命名空间
- **依赖新增**：`iconv-lite`（GBK 解码）、`gray-matter`、`zod`（phase 2 已引入）；可选 `write-file-atomic`（或自实现）
- **错误码扩展**：`E_ENCODING` / `E_WRITE_VERIFY` / `E_MTIME_MISMATCH`
- **可观察产物**：`window.api.file.write('test.md', '# hi')` → 在当前树林根下出现 `test.md`（UTF-8 无 BOM、LF）；断电模拟下无 `.tmp` 残留；Windows 编辑器打开 CRLF 文件改后保存仍是 CRLF
