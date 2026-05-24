import { z } from 'zod'

const BODY_MAX = 16000

interface RenderVars {
  title: string
  url: string
  body: string
}

function truncateBody(body: string): string {
  if (body.length <= BODY_MAX) return body
  return body.slice(0, BODY_MAX) + '\n\n...(内容过长已截断)'
}

export const AiReviewSchema = z.object({
  summary: z.string().min(1).describe('150 字以内的中文摘要'),
  suggestedTitle: z.string().min(1).describe('一个更精炼的标题；若原标题足够好可复用'),
  tags: z.array(z.string().describe('kebab-case lowercase')).min(3).max(8),
  keyQuotes: z.array(z.string().min(1)).min(1).max(3),
  rating: z.number().int().min(1).max(5).optional().describe('1到5的评分，基于文章的质量和信息密度'),
  category: z.string().optional().describe('文章的分类，例如：技术、随笔、新闻等')
})

export type AiReviewOutput = z.infer<typeof AiReviewSchema>

export const reviewClip = {
  schema: AiReviewSchema,

  render({ title, url, body }: RenderVars): { system: string; user: string } {
    const system = [
      '你是一位博学的中英双语阅读助手。',
      '你将收到一篇文章，输出对它的结构化评注。',
      '输出必须是严格的 JSON 格式，匹配指定 schema，由 LangChain 结构化输出机制处理 —— 不要包含任何额外文本，不要使用 markdown code fence。',
      'tags 必须使用 kebab-case 英文短词。summary 使用原文主语言（若中英混合则以中文为主）。'
    ].join('\n')

    const user = [
      `# 标题\n${title}`,
      `# 原始 URL\n${url}`,
      `# 正文（可能已被截断）\n${truncateBody(body)}`,
      '',
      '请生成：',
      '1. `summary`：150 字以内的摘要。',
      '2. `suggestedTitle`：一个更精炼、信息密度更高的标题（若原标题已足够好，可复用）。',
      '3. `tags`：3-8 个 kebab-case 英文短标签（如 "deep-learning", "transformer"）。',
      '4. `keyQuotes`：最重要的 1-3 句原文引用（保持原文语言）。',
      '5. `rating`：1 到 5 之间的整数评分，评估文章的质量和信息密度。',
      '6. `category`：一个简短的中文分类词汇（如“技术”、“随笔”、“新闻”等）。'
    ].join('\n')

    return { system, user }
  }
}
