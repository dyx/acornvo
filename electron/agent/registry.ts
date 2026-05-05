import type { Tool } from '../../shared/agent-types';

export interface Registry {
  register(t: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  openApiDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>;
  anthropicDefinitions(): Array<{ name: string; description: string; input_schema: object }>;
}

export function createRegistry(): Registry {
  const tools = new Map<string, Tool>();
  return {
    register(t) {
      if (!t.description?.trim()) throw new Error(`tool ${t.name}: description is required`);
      if (!t.parameters || typeof (t.parameters as any).type !== 'string') {
        throw new Error(`tool ${t.name}: parameters must be a JSON schema object`);
      }
      if (tools.has(t.name)) throw new Error(`tool ${t.name} already registered`);
      tools.set(t.name, t);
    },
    get(name) { return tools.get(name); },
    list() { return [...tools.values()]; },
    openApiDefinitions() {
      return [...tools.values()].map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    },
    anthropicDefinitions() {
      return [...tools.values()].map(t => ({
        name: t.name, description: t.description, input_schema: t.parameters,
      }));
    },
  };
}

export const registry = createRegistry();
