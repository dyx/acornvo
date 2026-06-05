import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'
import { fullText } from '../../services/search/queries'

const SearchFilesSchema = z.object({
  queries: z
    .array(z.string())
    .min(1)
    .describe(
      "Provide 1-5 different search queries (synonyms, different angles) to maximize search recall. FTS5 query — use words from the user's question; for phrases use double quotes."
    )
})

export const searchFilesTool = tool(
  async ({ queries }) => {
    const db = dbService.requireCurrent()
    const cappedQueries = queries.slice(0, 5)
    const r = fullText(db, cappedQueries, { limit: 20, offset: 0 })
    if (r.error) {
      return { ok: false, error: 'E_INVALID_QUERY', detail: r.error }
    }
    let totalChars = 0
    const MAX_CHARS = 40000
    const items: Record<string, unknown>[] = []

    for (const i of r.items) {
      const itemBody = i.body || ''
      const itemTitle = i.summary.title ?? i.summary.path
      const itemChars = i.summary.path.length + i.heading_path.length + itemTitle.length + itemBody.length
      if (totalChars + itemChars > MAX_CHARS) {
        items.push({
          type: 'system_warning',
          message: 'Context limit reached. Some results were truncated. Adjust your queries if you need more.'
        })
        break
      }
      totalChars += itemChars
      items.push({
        path: i.summary.path,
        heading_path: i.heading_path,
        title: itemTitle,
        body: itemBody
      })
    }

    return {
      ok: true as const,
      data: { items }
    }
  },
  {
    name: 'search_files',
    description:
      "Full-text multi-query search the user's grove. Use this ONLY when the user is explicitly or implicitly asking about contents in their collection. Do NOT use this for general conversational queries. Returns matching markdown chunks with their heading context. Provide multiple queries to maximize recall. CRITICAL: When using these search results to answer, you MUST cite your sources using Markdown footnotes or inline links, pointing to the provided path (e.g. `[1]` or `[Title](file:///path)`). This helps the user verify the source.",
    schema: SearchFilesSchema
  }
)

export default searchFilesTool
