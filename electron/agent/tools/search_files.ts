import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { dbService } from '../../services/db';
import { fullText } from '../../services/search/queries';

const SearchFilesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("FTS5 query — use words from the user's question; for phrases use double quotes."),
  limit: z.number().int().min(1).max(20).optional().describe('Max number of hits (1–20).'),
});

export const searchFilesTool = tool(
  async ({ query, limit }) => {
    const db = dbService.requireCurrent();
    const cappedLimit = Math.max(1, Math.min(20, limit ?? 8));
    const r = fullText(db, query, { limit: cappedLimit, offset: 0 });
    return {
      items: r.items.map((i) => ({
        path: i.summary.path,
        title: i.summary.title ?? i.summary.path,
        snippet: i.snippet,
      })),
    };
  },
  {
    name: 'search_files',
    description:
      "Full-text search the user's grove. Returns matching markdown files with a highlighted snippet. Use this BEFORE answering questions about the user's notes.",
    schema: SearchFilesSchema,
  }
);

export default searchFilesTool;
