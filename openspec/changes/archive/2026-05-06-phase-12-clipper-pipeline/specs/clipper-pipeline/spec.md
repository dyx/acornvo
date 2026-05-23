## ADDED Requirements

### Requirement: 端到端 Pipeline

`electron/clipper/pipeline.ts` SHALL 暴露 `clip(webContents, userOverrides?) → Promise<ClipResult>`。流水线步骤 MUST 依次为：

1. **precheck**：读取 `webContents.getURL()`；校验 http/https；调 `clips.getByUrl(url)`
2. **extract**：调 clipper-extractor
3. **enrich**：规整元信息（见 clipper-extractor 规格）
4. **transform**：调 clipper-transformer
5. **preview**（renderer 驱动；main 侧此步是"返回 extractResult + 转换后 body" 给 renderer）
6. **save**：用户确认后写入文件
7. **index**：调 phase 5 `file.upsert`
8. **record**：插入 `clips` 表 + `ops_log`（op='clip'）+ `clipQueue.enqueue`

任一步骤失败 MUST 返回 `{ ok: false, error: { code, message, stage } }`，renderer 根据 stage 恢复到对应状态。

#### Scenario: 完整流程成功

- **WHEN** 用户在 `example.com/a` 点剪藏 → preview 中点保存
- **THEN** 生成 `inbox/202604/<slug>.md`；clips 表新增行；ops_log 有 `clip` 记录

#### Scenario: 已剪藏

- **WHEN** 当前 URL 已存在于 clips 表
- **THEN** pipeline 立即返回 `{ ok: false, error: { code: 'E_ALREADY_CLIPPED', existingId, existingPath }, stage: 'precheck' }`，不走 extract

#### Scenario: non-http 协议

- **WHEN** 当前 URL 为 `about:blank` / `acorn://new-tab` / `file://...`
- **THEN** pipeline 返回 `{ ok: false, error: { code: 'E_UNSUPPORTED_SCHEME' }, stage: 'precheck' }`

### Requirement: 目标路径与 slug

pipeline SHALL 按以下规则生成相对 vault 的目标路径：

- 目录：`inbox/YYYYMM/`（`YYYYMM` 用 clipped_at 的本地时区）
- 文件名：
  - 若 title 含中文（[\u4e00-\u9fa5] 命中）→ jieba 取前 3 词连接（用 `-` 分隔）+ `-` + sha1(url).slice(0,6) + `.md`
  - 否则 `slugify(title, { lower:true, strict:true }).slice(0,50) + '-' + sha1(url).slice(0,6) + '.md'`
  - 全空时 `clip-YYYYMMDD-<sha6>.md`
- 若目标文件已存在 → fallback 加 `-1`/`-2` 递增后缀，直至不冲突

目录 MUST 在写入前 `mkdir -p`。

#### Scenario: 中文标题 slug

- **WHEN** title 为 "深度学习入门指南" 且 url sha6 为 `abc123`
- **THEN** 文件名类似 `深度-学习-入门-abc123.md`

#### Scenario: 英文标题 slug

- **WHEN** title 为 "Hello World, A Primer!" 且 sha6 为 `def456`
- **THEN** 文件名为 `hello-world-a-primer-def456.md`

#### Scenario: 路径冲突 fallback

- **WHEN** 目标 `inbox/202604/x-abc123.md` 已存在
- **THEN** 使用 `x-abc123-1.md`

### Requirement: 写入原子性

save 阶段 MUST 调用 phase 4 的 `file.write(path, { body, frontmatter })` 以保证原子写、selfWrites 标记与索引链路。

#### Scenario: 磁盘异常

- **WHEN** 写入返回 `E_DISK_FULL`
- **THEN** pipeline 回滚：不插入 clips 表；返回错误至 UI

### Requirement: 入队（phase 14 预留）

save 成功后 pipeline MUST 调 `clipQueue.enqueue({ clipId, url, path })`。phase 12 该函数为 no-op 占位；phase 14 替换为持久化队列，pipeline 代码 MUST 不因占位改动。

#### Scenario: 占位入队

- **WHEN** pipeline 在 phase 12 走完 save
- **THEN** 调用 `clipQueue.enqueue(...)` 不抛错；pipeline 正常返回 success
