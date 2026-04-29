## ADDED Requirements

### Requirement: frontmatter 解析
系统 SHALL 提供 `frontmatter.parseFile(raw)` 返回 `{ frontmatter, body, rawYaml }`。`frontmatter` MUST 用 Zod schema 校验已知字段的类型，未知字段 MUST 以 `passthrough` 形式原样保留。Schema 所有已知字段 MUST 为 optional。

#### Scenario: 含 frontmatter 的 md
- **WHEN** 输入一个含 YAML frontmatter 的 md 字符串
- **THEN** `frontmatter` 是合法对象、`body` 是 frontmatter 后的正文、`rawYaml` 是 frontmatter 原始文本

#### Scenario: 无 frontmatter 的 md
- **WHEN** 输入不含 `---` 包裹的 md
- **THEN** `frontmatter` 为空对象，`body` 为全部输入，`rawYaml` 为空字符串

#### Scenario: 类型不合法
- **WHEN** 输入 `rating: "abc"`
- **THEN** `frontmatter.parseFile` 抛 Zod 校验错，错误信息指出字段名与期望类型

#### Scenario: 未知字段保留
- **WHEN** 输入含 `custom_key: some_value` 的 frontmatter
- **THEN** 解析后的 `frontmatter.custom_key === 'some_value'`

### Requirement: frontmatter 序列化
系统 SHALL 提供 `frontmatter.stringify(frontmatter, body)` 返回可直接写盘的 md 字符串。输出 MUST 以 `---` 包裹 YAML frontmatter 后接空行再接 body。空 frontmatter 不输出包裹块。

#### Scenario: 有 frontmatter
- **WHEN** 传入非空 frontmatter 与 body
- **THEN** 输出以 `---\n` 开头，YAML 结束后 `\n---\n\n<body>`

#### Scenario: 空 frontmatter
- **WHEN** 传入空对象 `{}` 与 body
- **THEN** 输出仅为 body，不带 `---` 包裹

#### Scenario: 往返一致
- **WHEN** 对 `parseFile` 出的 `{ frontmatter, body }` 直接 `stringify`
- **THEN** 再次 `parseFile` 的结果与上一次的 frontmatter/body 语义等价（字段值相同；字面量格式可能因 YAML 规范化略有差异）

### Requirement: Frontmatter Schema 对齐 PRD
Frontmatter Schema SHALL 覆盖 PRD 数据模型节列出的字段：`title / url / site / author / published_at / clipped_at / source_type / summary / highlights / rating / category / tags / reviewed_at / reviewed_model / reviewed_version / reviewed_error`。Schema SHALL 支持通过扩展点新增可选字段而不破坏已有数据。

#### Scenario: 全字段文件
- **WHEN** 输入包含 PRD 列出全部字段的 md
- **THEN** 每个字段按对应类型被解析且无校验错误

#### Scenario: rating 范围
- **WHEN** 输入 `rating: 6`
- **THEN** 抛 Zod 错误，提示合法范围 1-5
