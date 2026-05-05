import type { Tool } from '../../../shared/agent-types';
import { dbService } from '../../services/db';
import { fullText } from '../../services/search/queries';

const tool: Tool<{ query: string; limit?: number }, { items: Array<{ path: string; title: string; snippet: string }> }> = {
  name: 'search_files',
  description: 'Full-text search the user\'s grove. Returns matching markdown files with a highlighted snippet. Use this BEFORE answering questions about the user\'s notes.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'FTS5 query — use words from the user\'s question; for phrases use double quotes.' },
      limit: { type: 'number', description: 'Max number of hits (1–20).' },
    },
    required: ['query'],
  },
  sideEffect: false,
  async execute(args) {
    const db = dbService.requireCurrent();
    const limit = Math.max(1, Math.min(20, args.limit ?? 8));
    const r = fullText(db, args.query, { limit, offset: 0 });
    return {
      items: r.items.map(i => ({ path: i.summary.path, title: i.summary.title ?? i.summary.path, snippet: i.snippet })),
    };
  },
};
export default tool;
