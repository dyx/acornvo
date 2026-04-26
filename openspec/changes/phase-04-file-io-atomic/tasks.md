## 1. 依赖与目录

- [x] 1.1 `npm install iconv-lite gray-matter`
- [x] 1.2 `npm install -D @types/gray-matter`
- [x] 1.3 新增目录 `electron/services/`（若不存在）下的 `fs-atomic.ts` / `frontmatter.ts` / `path-safety.ts`
- [x] 1.4 新增 `shared/frontmatter-schema.ts`

## 2. safeResolve（electron/services/path-safety.ts）

- [x] 2.1 `safeResolve(groveRoot, p)`：`path.resolve` → 比较 `path.resolve(groveRoot) + sep` 前缀 → 失败抛 `IpcError('E_PERMISSION')`
- [x] 2.2 拒绝包含 `..` 段的相对路径（`p.split(/[\\/]/).includes('..')`）
- [x] 2.3 可选 `{ realpath: true }` 选项走 `fs.realpath` 解析 symlink 后再校验
- [x] 2.4 单元测试：windows `C:\` 与 posix `/` 均通过；极端用例（空字符串、单个 `.`、以 `/` 结尾的 groveRoot）

## 3. fs-atomic（electron/services/fs-atomic.ts）

- [x] 3.1 `writeFileAtomic(abs, data)`：`<abs>.<uuid>.tmp` + `fd.writeFile` + `fd.sync` + `fs.rename`
- [x] 3.2 `EXDEV` 回退：`copyFile + unlink`
- [x] 3.3 `EPERM/EBUSY`（Windows AV）重试：最多 2 次，间隔 50ms
- [x] 3.4 同路径串行锁：模块 scope 的 `Map<absPath, Promise>` 链式串行
- [x] 3.5 `readFileDetect(abs)`：返回 `{ content, eol, originalEncoding, hadBom, mtimeMs, sha256 }`
  - [x] 3.5.1 剥离 UTF-8 BOM
  - [x] 3.5.2 判断 `isUtf8(buf)`，否则 `iconv-lite` 尝试 `gbk` → 成功则转 UTF-8
  - [x] 3.5.3 扫描换行：纯 `\r\n` → `crlf`，纯 `\n` → `lf`，混合 → `mixed`（统计多数派）
  - [x] 3.5.4 计算 sha256 hex
  - [x] 3.5.5 全部失败 → 抛 `E_ENCODING`
- [x] 3.6 `normalizeForDisk(content, { eol })`：把 LF 转为指定 eol
- [x] 3.7 `writeWithVerify(abs, content, { eol, expectedMtime? })`：
  - [x] 3.7.1 读当前 mtime；若 `expectedMtime` 提供且不符 → 抛 `E_MTIME_MISMATCH`（返回 currentMtime）
  - [x] 3.7.2 `normalizeForDisk` → `writeFileAtomic`
  - [x] 3.7.3 读回校验 sha256；首次不符 → 50ms 重试一次；仍不符 → 抛 `E_WRITE_VERIFY`

## 4. frontmatter codec（electron/services/frontmatter.ts）

- [x] 4.1 `parseFile(raw)`：`matter(raw)` → 用 `FrontmatterSchema.parse(data)`（passthrough）→ 返回 `{ frontmatter, body: content, rawYaml: matter.matter }`
- [x] 4.2 `stringify(frontmatter, body)`：`matter.stringify(body, frontmatter)`；空 frontmatter 时仅返回 body
- [x] 4.3 `shared/frontmatter-schema.ts` 完整实现（见 design D5），导出 `Frontmatter` 类型
- [x] 4.4 单元测试：全字段往返、未知字段保留、rating 越界报错、空 frontmatter 不加包裹块

## 5. IPC（electron/ipc/file.ts + 契约）

- [x] 5.1 `shared/ipc-contract.ts` 新增 `file` 命名空间：`read(rel): { content, eol, mtime, sha256, hadBom, originalEncoding }` / `readParsed(rel): { frontmatter, body, rawYaml, ...meta }` / `write(rel, content, opts?)` / `writeParsed(rel, frontmatter, body, opts?)` / `stat(rel)` / `exists(rel)` / `list(dirRel, opts)` / `rename(oldRel, newRel)`
- [x] 5.2 新错误码常量：`E_ENCODING` / `E_WRITE_VERIFY` / `E_MTIME_MISMATCH`；追加到 phase 1 的 `IpcErrorCode` 枚举
- [x] 5.3 handler 实现：每个 handler 先 `currentGrovePath || throw E_NOT_FOUND`，再 `safeResolve`
- [x] 5.4 `list(dirRel, { recursive, includeHidden })`：自实现 walker，`fs.lstat` 跳 symlink；`includeHidden=false` 时跳过 `.` 开头
- [x] 5.5 `rename`：两端均 `safeResolve`；跨目录允许，跨树林（理论不可能，已被 safeResolve 拦）额外安全检查
- [x] 5.6 `writeParsed(rel, fm, body, opts)`：`stringify(fm, body)` → `writeWithVerify`

## 6. phase 2 回归改造

- [x] 6.1 phase 2 的 `recent.save` 改用 `writeFileAtomic`（先读再写 JSON，内存副本原子写磁盘）
- [x] 6.2 phase 2 的 `project.json` 写入改用 `writeFileAtomic`
- [x] 6.3 phase 2 的 `.lock` 写入改用 `writeFileAtomic`（避免 lock 半文件状态）

## 7. 验收

- [x] 7.1 新建 md：`window.api.file.write('a.md', '# hi')` → 磁盘存在；`file.read('a.md')` 返回 `# hi`、`eol: 'lf'`、`hadBom: false`
- [x] 7.2 含 BOM 的文件：手动放一个 BOM UTF-8 文件 → `file.read` 返回 `hadBom: true` 且 `content` 无 BOM
- [x] 7.3 GBK 文件：手动放一个 GBK 编码的中文 md → `file.read` 返回中文正文、`originalEncoding: 'gbk'`；`file.write` 回写后变 UTF-8
- [x] 7.4 CRLF 文件：手动放一个 CRLF 文件 → `file.read` 返回 `eol: 'crlf'`；`file.write(rel, body, { eol: 'crlf' })` 仍 CRLF
- [x] 7.5 断电模拟：`kill -9` 进程在 write 过程中 → 启动后目录无 `.tmp` 残留（或有残留但目标文件完整——由原子性保证）
- [x] 7.6 路径越界：`file.write('../outside.md', 'x')` → `E_PERMISSION`
- [x] 7.7 mtime 乐观锁：人为先改 mtime，再带旧 `expectedMtime` 写入 → `E_MTIME_MISMATCH`
- [x] 7.8 frontmatter 全字段 md 往返：写入后读出完全等价
- [ ] 7.9 单元测试覆盖率：`fs-atomic.ts` 与 `path-safety.ts` >= 85%
- [ ] 7.10 `openspec validate phase-04-file-io-atomic --strict` 通过
