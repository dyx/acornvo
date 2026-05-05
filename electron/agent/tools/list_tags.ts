import type { Tool } from '../../../shared/agent-types';
import { dbService } from '../../services/db';

const tool: Tool<{ prefix?: string; limit?: number }, { items: Array<{ name: string; usage_count: number }> }> = {
  name: 'list_tags',
  description: 'List tags used in the grove, ordered by usage count descending. Optional prefix filter for autocomplete-style lookups.',
  parameters: {
    type: 'object',
    properties: {
      prefix: { type: 'string', description: 'Case-sensitive prefix to filter tag names.' },
      limit: { type: 'number', description: 'Max tags to return (1–200, default 50).' },
    },
  },
  sideEffect: false,
  async execute(args) {
    const db = dbService.requireCurrent();
    const limit = Math.max(1, Math.min(200, args.limit ?? 50));
    const prefix = args.prefix ?? '';
    const rows = prefix
      ? db.prepare("SELECT name, usage_count FROM tags WHERE name LIKE ? ESCAPE '\\' ORDER BY usage_count DESC LIMIT ?").all(prefix.replace(/[%_]/g, '\\$&') + '%', limit)
      : db.prepare("SELECT name, usage_count FROM tags ORDER BY usage_count DESC LIMIT ?").all(limit);
    return { items: rows as Array<{ name: string; usage_count: number }> };
  },
};
export default tool;
