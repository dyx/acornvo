import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'

const ListFilesSchema = z.object({
  limit: z.number().describe('返回的文档最大数量。需根据用户的要求（如“20篇”、“30篇”）灵活提取，未指定时请固定传入 10。'),
  offset: z.number().describe('分页偏移量。用于翻页，第一页请固定传入 0。'),
  sort_by: z.enum(['created_at', 'updated_at', 'title', 'size_bytes'])
    .describe('排序依据。若用户想看"最新/最旧"选 created_at；"最近修改"选 updated_at；"最大/最小"选 size_bytes。'),
  sort_order: z.enum(['DESC', 'ASC'])
    .describe('排序方向。DESC：降序（适用于最新、最近修改、最大）；ASC：升序（适用于最旧、最小）。')
})

export const listFilesTool = tool(
  async ({ limit, offset, sort_by, sort_order }) => {
    const db = dbService.requireCurrent()
    
    // 安全校验，防止 SQL 注入（ORDER BY 无法使用占位符绑定参数）
    const validSortBy = ['created_at', 'updated_at', 'title', 'size_bytes'].includes(sort_by) ? sort_by : 'created_at'
    const validSortOrder = ['DESC', 'ASC'].includes(sort_order) ? sort_order : 'DESC'
    
    // 限制单次最大查询数量，防止大模型一次性请求过多导致 token 爆炸
    const safeLimit = Math.min(limit, 50)

    const files = db.prepare(`
      SELECT path, title, created_at, updated_at, category, size_bytes
      FROM files 
      ORDER BY ${validSortBy} ${validSortOrder}
      LIMIT ? OFFSET ?
    `).all(safeLimit, offset)

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
    description: 
      '核心文件枚举工具：用于获取用户知识库中的文件列表全貌或特定排序的清单。\n' +
      '【何时使用】：\n' +
      '1. 用户询问宏观清单（如"现在有哪些文档"、"列出我的所有文章"）。\n' +
      '2. 用户要求特定排序（如"最新添加的10篇文章"、"最旧的文章"、"占空间最大的文件"）。\n' +
      '【何时不使用】：如果用户在寻找具体的知识点或文章内容（如"月亮为什么是圆的"），请优先使用 search_files。\n' +
      '【参数指导】：请务必从用户的自然语言中提取数量（对应 limit）和排序意图（对应 sort_by 与 sort_order）。',
    schema: ListFilesSchema
  }
)


export default listFilesTool
