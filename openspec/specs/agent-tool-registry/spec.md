## Purpose

Spec for agent-tool-registry capability.

## Requirements

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
