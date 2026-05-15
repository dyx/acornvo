// Temporary back-compat through Plan 3 of the LangChain migration:
// adapts the new @langchain/core `tool()` outputs to the legacy `Tool`
// interface so registry-based callers (loop.ts) keep working until Plan 3
// deletes the registry entirely.
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import type { Registry } from './registry';
import type { JSONSchema, Tool, ToolCtx } from '../../shared/agent-types';
import { agentTools } from './tools';

type LangChainTool = (typeof agentTools)[number];

function adapt(t: LangChainTool): Tool {
  const parameters = toJsonSchema(t.schema as Parameters<typeof toJsonSchema>[0]) as JSONSchema;
  const sideEffect = t.name === 'update_frontmatter';
  return {
    name: t.name,
    description: t.description,
    parameters,
    sideEffect,
    async execute(args: unknown, ctx: ToolCtx): Promise<unknown> {
      return t.invoke(args as never, {
        configurable: { vaultRoot: ctx.vaultRoot, sessionId: ctx.sessionId },
      });
    },
  };
}

export function bootstrapAgent(registry: Registry): void {
  for (const t of agentTools) {
    registry.register(adapt(t));
  }
  for (const t of registry.list()) {
    if (!t.description?.trim()) {
      throw new Error(`agent self-check: tool ${t.name} has empty description`);
    }
    if (!(t.parameters as { type?: unknown })?.type) {
      throw new Error(`agent self-check: tool ${t.name} parameters missing type`);
    }
  }
}
