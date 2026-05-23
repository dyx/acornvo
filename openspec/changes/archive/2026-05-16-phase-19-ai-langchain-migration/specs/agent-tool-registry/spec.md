## MODIFIED Requirements

### Requirement: Tool 契约

每个工具 MUST 使用 LangChain 的 `tool(fn, options)` API 定义：

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const myTool = tool(
  async (args, config) => { /* ... */ },
  {
    name: string,                 // 匹配 /^[a-z][a-z0-9_]*$/
    description: string,          // ≤ 300 字符
    schema: z.object({...}),      // Zod schema 替代 JSON Schema
  }
);
```

副作用工具的审批语义 SHALL 通过 `humanInTheLoopMiddleware` 的 `interruptOn` 配置声明（见 agent-approval 规格），而非工具自身字段。

`name` MUST 全局唯一；description + schema MUST 能被 LLM 直接理解。

#### Scenario: 工具定义

- **WHEN** 模块定义并导出一个 `tool(fn, { name: 'search_files', description, schema })`
- **THEN** 该 tool 可直接被 `createAgent({ tools: [searchFiles, ...] })` 接收

#### Scenario: 非法 name 在 createAgent 时被拒

- **WHEN** 注入到 `createAgent` 的 tool 数组含 name='Update-FM' 的 tool
- **THEN** LangChain 在初始化阶段抛错；应用启动失败

#### Scenario: 重名拒绝

- **WHEN** tools 数组含两个同 name 的 tool
- **THEN** LangChain 抛错；应用启动失败

## REMOVED Requirements

### Requirement: 注册中心 API

**Reason**: LangChain `createAgent({ tools })` 直接接受工具数组。registry 中间层（register / get / list / openApiDefinitions / anthropicDefinitions）的功能要么由 LangChain 提供，要么不再需要（schema 双向转换由 LangChain 内部完成）。
**Migration**: 工具直接以模块导出形式聚合到一个 `electron/agent/tools/index.ts` 数组，传给 `createAgent`。需要枚举工具的代码（如启动日志）直接读该数组。

### Requirement: 参数校验

**Reason**: Ajv 校验由 LangChain + Zod 替代。工具 execute 前 LangChain 自动 Zod 校验；失败时抛 ZodError，LangChain 默认包装为 ToolMessage 塞回，行为等价。
**Migration**: 工具 schema 改写为 Zod；保留 `safeResolve` 路径沙箱、`E_*` 错误码、副作用语义。校验失败仍以 tool message 形式反馈给 LLM。

### Requirement: 路径沙箱

**Reason**: 该约束本身保留（仍由 `safeResolve` 实现），但其位置从 registry 中间层移到每个工具的 execute 函数内部，因 registry 已删除。
**Migration**: 在每个接受 path 的工具实现内开头调 `safeResolve(vaultRoot, path)`；命中沙箱外仍返回 `{ ok: false, error: 'E_PATH_ESCAPE' }`。语义对外完全一致。
