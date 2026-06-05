import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'

const ListFilesSchema = z.object({
  limit: z.number().optional().default(10).describe('返回的文档数量限制，默认10'),
  offset: z.number().optional().default(0).describe('分页偏移量，默认0'),
  sort_by: z.enum(['created_at', 'updated_at', 'title', 'size_bytes']).optional().default('created_at').describe('排序字段，支持：created_at(创建时间), updated_at(更新时间), title(标题), size_bytes(文件大小)'),
  sort_order: z.enum(['DESC', 'ASC']).optional().default('DESC').describe('排序方向：DESC(降序，即最新/最大), ASC(升序，即最旧/最小)')
})

export const listFilesTool = tool(
  async ({ limit, offset, sort_by, sort_order }) => {
    const db = dbService.requireCurrent()
    
    // 安全校验，防止 SQL 注入（ORDER BY 无法使用占位符绑定参数）
    const validSortBy = ['created_at', 'updated_at', 'title', 'size_bytes'].includes(sort_by) ? sort_by : 'created_at'
    const validSortOrder = ['DESC', 'ASC'].includes(sort_order) ? sort_order : 'DESC'

    const files = db.prepare(`
      SELECT path, title, created_at, updated_at, category, size_bytes
      FROM files 
      ORDER BY ${validSortBy} ${validSortOrder}
      LIMIT ? OFFSET ?
    `).all(limit, offset)

    return {
      ok: true as const,
      data: files,
      meta: {
        sort_by: validSortBy,
        sort_order: validSortOrder,
        limit,
        offset
      }
    }
  },
  {
    name: 'list_files',
    description: '获取用户知识库中的文档列表（支持分页和多种排序）。当用户询问"现在有哪些文档"、"列出最新/最旧的文档"、"最大的文档是哪个"或要求查看文档清单时，必须使用此工具。',
    schema: ListFilesSchema
  }
)

export default listFilesTool
