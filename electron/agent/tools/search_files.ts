import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { hybridSearch } from '../../services/search/hybrid'

const MAX_LIMIT = 20

const SearchFilesSchema = z.object({
  query: z
    .string()
    .describe(
      '用自然语言描述要查找的内容（混合检索：关键词 + 语义向量）。无需拆词、无需加双引号——语义相近的内容会被自动召回。'
    )
})

export const searchFilesTool = tool(
  async ({ query }) => {
    try {
      const r = await hybridSearch(query, 1.0, 1.0, MAX_LIMIT)
      let totalChars = 0
      const MAX_CHARS = 40000
      const items: Record<string, unknown>[] = []

      for (const i of r.items) {
        const itemBody = i.body || ''
        const itemTitle = i.summary.title ?? i.summary.path
        const itemChars =
          i.summary.path.length + i.heading_path.length + itemTitle.length + itemBody.length
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
    } catch (err) {
      return { ok: false, error: 'E_SEARCH_FAILED', detail: String(err) }
    }
  },
  {
    name: 'search_files',
    description:
      '对用户知识库进行混合检索（关键词 + 语义向量）。仅当用户明确或隐含地询问其收藏内容时才使用此工具。请勿用于通用对话。返回匹配的 Markdown 块及其标题上下文。用一句自然语言描述要找的内容即可。极其重要：在使用搜索结果回答时，必须使用 Markdown 脚注或内联链接引用来源，指向提供的路径（例如 `[1]` 或 `[标题](acornvo-local:///path)`）。这有助于用户验证来源。',
    schema: SearchFilesSchema
  }
)

export default searchFilesTool
