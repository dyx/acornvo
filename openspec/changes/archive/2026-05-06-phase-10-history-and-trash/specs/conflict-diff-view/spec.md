## ADDED Requirements

### Requirement: ConflictDetailPanel 布局

`ConflictDetailPanel` SHALL 包含：

- header：path / ts distance / resolved_by badge / winner_path（若为 save_as）
- 视图切换：三个 toggle `local ↔ remote`（默认）、`local ↔ base`、`remote ↔ base`
- 主体：side-by-side 双列 diff 视图
- 底部操作：
  - "在系统文件管理器中打开 local.md / remote.md / base.md"（三按钮调 `shell.showItemInFolder`）
  - "删除此快照"（调 `conflict.delete(id)` + 确认）

#### Scenario: 默认视图

- **WHEN** 选中某条 conflict
- **THEN** 视图切换选中 `local ↔ remote`；diff 渲染这两份内容

#### Scenario: 切换视图

- **WHEN** 点 `local ↔ base` toggle
- **THEN** diff 重新渲染 local 与 base 的差异

#### Scenario: 删除快照

- **WHEN** 点"删除此快照"并确认
- **THEN** 调 `conflict.delete(id)`；列表刷新；详情区显示空态

### Requirement: Side-by-side diff 渲染

diff 视图 SHALL 为左右双列：

- 左列 A（基准侧）、右列 B（对比侧），按 toggle 决定 A/B 是哪一份
- 差异行着色：新增（绿底）、删除（红底）、未变（默认底）
- 每行前显示行号
- 等长对齐（A/B 的每一块上下对齐）

渲染数据 MUST 来自 `conflict.diff(id, sides)` 的结构化返回，renderer 不再自行 diff。

#### Scenario: 无差异

- **WHEN** local 与 remote 完全一致（罕见）
- **THEN** 显示"两份内容完全一致"占位

#### Scenario: 超长文件

- **WHEN** 某份文件 > 5000 行
- **THEN** diff 视图渲染正常但可接受稍慢；不做虚拟化（本阶段）

### Requirement: conflict.diff IPC

系统 SHALL 提供 `conflict.diff(id, sides: 'local-remote' | 'local-base' | 'remote-base')` IPC，返回：

```
{
  left: { label: string, lines: { num: number, text: string, kind: 'equal' | 'del' }[] },
  right: { label: string, lines: { num: number, text: string, kind: 'equal' | 'add' }[] },
  stats: { added: number, removed: number }
}
```

main 侧用 `diff`（jsdiff）包的 `diffLines` 生成。

#### Scenario: 结构化返回

- **WHEN** 调用 `conflict.diff('<cid>', 'local-remote')`
- **THEN** 返回结构如上；renderer 直接渲染，不再 import diff 包

#### Scenario: 不存在 id

- **WHEN** id 无效
- **THEN** 返回 `E_NOT_FOUND`
