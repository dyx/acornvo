import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'
import { fullText } from '../../services/search/queries'

const SearchFilesSchema = z.object({
  queries: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(
      "Provide 1-5 different search queries (synonyms, different angles) to maximize search recall. FTS5 query — use words from the user's question; for phrases use double quotes."
    ),
  limit: z.number().int().min(1).max(100).optional().describe('Max number of hits (1–100).')
})

export const searchFilesTool = tool(
  async ({ queries, limit }) => {
    const db = dbService.requireCurrent()
    const cappedLimit = Math.max(1, Math.min(100, limit ?? 10))
    const r = fullText(db, queries, { limit: cappedLimit, offset: 0 })
    if (r.error) {
      return { ok: false, error: 'E_INVALID_QUERY', detail: r.error }
    }
    return {
      ok: true as const,
      data: {
        items: r.items.map((i) => ({
          path: i.summary.path,
          heading_path: i.heading_path,
          title: i.summary.title ?? i.summary.path,
          body: i.body
        }))
      }
    }
  },
  {
    name: 'search_files',
    description:
      "Full-text multi-query search the user's grove. Returns matching markdown chunks with their heading context. Provide multiple queries to maximize recall.",
    schema: SearchFilesSchema
  }
)

export default searchFilesTool
