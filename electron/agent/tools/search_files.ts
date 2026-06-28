import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'
import { fullText } from '../../services/search/queries'

const MAX_QUERIES = 5
const MAX_LIMIT = 20

const SearchFilesSchema = z.object({
  queries: z
    .array(z.string())
    .min(1)
    .describe(
      `提供 1-${MAX_QUERIES} 个不同的搜索词（如同义词、不同角度）以最大化召回率。FTS5 搜索——使用用户问题中的词语；对于短语使用双引号。`
    )
})

export const searchFilesTool = tool(
  async ({ queries }) => {
    const db = dbService.requireCurrent()
    const cappedQueries = queries.slice(0, MAX_QUERIES)
    const r = fullText(db, cappedQueries, { limit: MAX_LIMIT, offset: 0 })
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
          message: '上下文限制已到达，部分结果被截断。如果需要更多结果请调整搜索词。'
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
      "对用户知识库进行全文多词搜索。仅当用户明确或隐含地询问其收藏内容时才使用此工具。请勿用于通用对话。返回匹配的 Markdown 块及其标题上下文。提供多个搜索词以最大化召回率。极其重要：在使用搜索结果回答时，必须使用 Markdown 脚注或内联链接引用来源，指向提供的路径（例如 `[1]` 或 `[标题](acornvo-local:///path)`）。这有助于用户验证来源。",
    schema: SearchFilesSchema
  }
)

export default searchFilesTool
