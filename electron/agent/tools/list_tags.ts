import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { dbService } from '../../services/db';

const ListTagsSchema = z.object({
  prefix: z.string().optional().describe('Case-sensitive prefix to filter tag names.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Max tags to return (1–200, default 50).'),
});

export const listTagsTool = tool(
  async ({ prefix, limit }) => {
    const db = dbService.requireCurrent();
    const cappedLimit = Math.max(1, Math.min(200, limit ?? 50));
    const safePrefix = prefix ?? '';
    const rows = safePrefix
      ? db
          .prepare(
            "SELECT name, usage_count FROM tags WHERE name LIKE ? ESCAPE '\\' ORDER BY usage_count DESC LIMIT ?"
          )
          .all(safePrefix.replace(/[%_]/g, '\\$&') + '%', cappedLimit)
      : db
          .prepare('SELECT name, usage_count FROM tags ORDER BY usage_count DESC LIMIT ?')
          .all(cappedLimit);
    return { items: rows as Array<{ name: string; usage_count: number }> };
  },
  {
    name: 'list_tags',
    description:
      'List tags used in the grove, ordered by usage count descending. Optional prefix filter for autocomplete-style lookups.',
    schema: ListTagsSchema,
  }
);

export default listTagsTool;
