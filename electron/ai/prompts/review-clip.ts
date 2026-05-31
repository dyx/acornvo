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
  _reasoning: z.string().describe('Step-by-step thinking before extracting fields. Analyze core topics, key entities, and overall quality.'),
  summary: z.string().min(1).describe('150 字以内的中文摘要'),
  suggestedTitle: z.string().min(1).describe('一个更精炼的标题；若原标题足够好可复用'),
  tags: z.array(z.string().describe('kebab-case lowercase')).min(3).max(8),
  keyQuotes: z.array(z.string().min(1)).min(1).max(3),
  rating: z.number().int().min(1).max(5).optional().describe('1到5的评分，基于文章的质量和信息密度'),
  category: z.string().optional().describe('文章的分类，从以下选择或自定义：技术资讯、深度长文、开源项目、效率工具、新闻、随笔、教程等')
})

export type AiReviewOutput = z.infer<typeof AiReviewSchema>

export const reviewClip = {
  schema: AiReviewSchema,

  render({ title, url, body }: RenderVars): { system: string; user: string } {
    const system = [
      '你是一位博学的中英双语阅读助手。',
      '你将收到一篇文章，输出对它的结构化评注。',
      '输出必须是严格的 JSON 格式，匹配指定 schema，由 LangChain 结构化输出机制处理 —— 不要包含任何额外文本，不要使用 markdown code fence。',
      'tags 必须使用 kebab-case 英文短词。summary 使用原文主语言（若中英混合则以中文为主）。',
      '',
      '--- 示例 ---',
      '输入：',
      '标题：OpenAI 发布了最新一代大语言模型 GPT-4o',
      '正文：在今天的春季发布会上，OpenAI 带来了全新的旗舰模型 GPT-4o。它不仅在文本处理上比前代更快，还原生支持实时音频和视觉输入，极大地降低了对话延迟。',
      '',
      '输出：',
      '{',
      '  "_reasoning": "文章主要介绍了 OpenAI 新发布的 GPT-4o 模型。核心实体是 OpenAI, GPT-4o, 大语言模型。主要特点是速度快、原生支持多模态（音频和视觉）。这是一篇高质量的技术资讯。",',
      '  "summary": "OpenAI 在春季发布会上推出了全新的旗舰模型 GPT-4o。该模型在提升文本处理速度的同时，原生支持实时音频和视觉输入，大幅降低了多模态对话的延迟。",',
      '  "suggestedTitle": "OpenAI 发布支持实时多模态的 GPT-4o 模型",',
      '  "tags": ["openai", "gpt-4o", "llm", "multimodal", "artificial-intelligence"],',
      '  "keyQuotes": ["原生支持实时音频和视觉输入，极大地降低了对话延迟。"],',
      '  "rating": 5,',
      '  "category": "技术资讯"',
      '}'
    ].join('\n')

    const user = [
      `# 标题\n${title}`,
      `# 原始 URL\n${url}`,
      `# 正文（可能已被截断）\n${truncateBody(body)}`,
      '',
      '请按如下步骤生成：',
      '1. 首先在 `_reasoning` 字段中进行简短的分析（文章核心内容、包含哪些实体、属于什么类别）。',
      '2. 根据分析生成 150 字以内的 `summary`。',
      '3. 生成 `suggestedTitle`（一个更精炼、信息密度更高的标题；若原标题已足够好，可复用）。',
      '4. 提取 3-8 个 `tags`，必须是 kebab-case 英文短标签（如 "deep-learning", "transformer"）。',
      '5. 摘录 1-3 句最重要的原文作为 `keyQuotes`（保持原文语言）。',
      '6. 给出 `rating`（1 到 5 之间的整数评分，评估文章的质量和信息密度）。',
      '7. 给出 `category`（一个简短的中文分类词汇）。'
    ].join('\n')

    return { system, user }
  }
}
