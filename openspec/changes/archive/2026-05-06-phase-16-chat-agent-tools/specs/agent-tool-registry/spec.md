## ADDED Requirements

### Requirement: Tool 契约

每个工具 MUST 实现：

```ts
{
  name: string;              // 匹配 /^[a-z][a-z0-9_]*$/
  description: string;       // ≤ 300 字符
  parameters: JSONSchema;    // OpenAI 函数调用格式
  sideEffect: boolean;
  execute(args, ctx): Promise<Result>;
}
```

`name` MUST 全局唯一。description + parameters MUST 能被 LLM 直接理解（即用作 LLM 函数描述）。

#### Scenario: 非法 name 被拒

- **WHEN** 尝试 register 一个 name='Update-FM' 的 tool
- **THEN** registry 抛 `E_INVALID_TOOL_NAME`

#### Scenario: 重名拒绝

- **WHEN** 二次 register 已存在 name 的 tool
- **THEN** 抛 `E_DUPLICATE_TOOL_NAME`

### Requirement: 注册中心 API

`electron/agent/registry.ts` SHALL 提供：

- `register(tool)` / `get(name) → Tool | null` / `list() → Tool[]`
- `openApiDefinitions() → OpenAiToolDef[]`：转换为 OpenAI tools 数组
- `anthropicDefinitions() → AnthropicTool[]`：转换为 Anthropic tools 数组

#### Scenario: 列出工具

- **WHEN** 注册 5 个内置工具后调 `list()`
- **THEN** 返回 5 个 tool 对象；顺序稳定

#### Scenario: OpenAI 格式转换

- **WHEN** 调 `openApiDefinitions()`
- **THEN** 返回数组，每项格式 `{ type: 'function', function: { name, description, parameters } }`

### Requirement: 参数校验

registry 内部 MUST 用 Ajv 把工具参数 schema 编译为 validator；`execute` 前 SHALL 先 validate args；未通过时 MUST 返回 `{ ok: false, error: 'E_INVALID_ARGS', details }` 而非抛异常（让 agent loop 能把错误反馈给 LLM）。

#### Scenario: 参数不满足 required

- **WHEN** LLM 调用 search_files 却不传 query
- **THEN** execute 返回 `{ ok: false, error: 'E_INVALID_ARGS', details: [...] }`；loop 把此结果塞回 LLM 作为 tool message

#### Scenario: 参数类型错误

- **WHEN** read_file 传 `path: 42`（非 string）
- **THEN** 返回 `{ ok:false, error:'E_INVALID_ARGS' }`

### Requirement: 路径沙箱

所有接受 path 参数的 tool MUST 调 phase 4 的 `safeResolve(vaultRoot, path)`；命中沙箱外 → 返回 `{ ok: false, error: 'E_PATH_ESCAPE' }`。

#### Scenario: 越狱路径

- **WHEN** LLM 传 `path: '../../../etc/passwd'` 给 read_file
- **THEN** tool 返回 `E_PATH_ESCAPE`；不访问文件系统
