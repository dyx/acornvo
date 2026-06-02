import { z } from 'zod'
import { settingsStore } from '../../settings/store'

interface RenderVars {
  title: string
  url: string
  body: string
}

function denoiseBody(body: string): string {
  let text = body
  
  // 1. 清除 HTML 注释
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // 2. 替换图片：![alt](url) -> [图片: alt]
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, (match, alt) => {
    return alt.trim() ? `[图片: ${alt}]` : '[图片]'
  })

  // 3. 压缩普通链接：[text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 4. 清除裸链接（http://... 或 https://...）
  text = text.replace(/(?<![a-zA-Z0-9])https?:\/\/[^\s]+/g, '[链接]')

  // 5. 压缩连续换行
  text = text.replace(/\n{3,}/g, '\n\n')
  
  return text
}

function truncateBody(body: string): string {
  const bodyMax = settingsStore.get('ai').bodyMax || 20000
  const cleanedBody = denoiseBody(body)
  
  if (cleanedBody.length <= bodyMax) return cleanedBody
  
  const half = Math.floor(bodyMax / 2)
  const head = cleanedBody.slice(0, half)
  const tail = cleanedBody.slice(-half)
  
  return `${head}\n\n...(中间内容过长已截断)...\n\n${tail}`
}

export const AiReviewSchema = z.object({
  _reasoning: z.string().describe('分析文章的核心论点、写作深度以及是否有实际参考价值。'),
  summary: z.string().min(1).describe('用 1-2 句话直接总结文章结论，不使用任何客套话。'),
  suggestedTitle: z.string().min(1).describe('如果原标题是无意义的默认标题或标题党，请提供一个高信息密度的替换标题；否则复用原标题。'),
  tags: z.array(z.string()).min(2).max(5).describe('请提取 2-5 个核心标签。必须且只能使用纯英文，必须使用全小写字母加连字符的格式（kebab-case）。如果是中文特有概念，请翻译为对应的英文缩写。'),
  keyQuotes: z.array(z.string().min(1)).min(1).max(3).describe('必须 100% 一字不差地从原文摘录最反常识或最具总结性的原话。'),
  rating: z.number().int().min(1).max(10).optional().describe('1到10的整数评分：1-4为水文/软文，5-6为普通资讯，7-8为优秀教程/干货，9-10为深度洞察/专业研究。'),
  category: z.enum(['Tutorial', 'Insight', 'News', 'Resource', 'Noise']).optional().describe('必须选择最符合的一个大类')
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
      '  "_reasoning": "文章主要介绍了 OpenAI 新发布的 GPT-4o 模型。核心实体是 OpenAI, GPT-4o, 大语言模型。主要特点是速度快、原生支持多模态（音频和视觉）。具有很高的行业参考价值，属于技术资讯。",',
      '  "summary": "OpenAI 在春季发布会上推出了全新的旗舰模型 GPT-4o，原生支持实时音频和视觉输入，大幅降低了多模态对话的延迟。",',
      '  "suggestedTitle": "OpenAI 发布支持实时多模态的 GPT-4o 模型",',
      '  "tags": ["openai", "gpt-4o", "llm", "multimodal", "artificial-intelligence"],',
      '  "keyQuotes": ["原生支持实时音频和视觉输入，极大地降低了对话延迟。"],',
      '  "rating": 8,',
      '  "category": "News"',
      '}'
    ].join('\n')

    const user = [
      `# 标题\n${title}`,
      `# 原始 URL\n${url}`,
      `# 正文（可能已被截断）\n${truncateBody(body)}`,
      '',
      '请按如下步骤生成：',
      '1. 首先在 `_reasoning` 字段中分析文章核心论点和价值。',
      '2. 根据分析生成 1-2 句话的 `summary`。',
      '3. 生成高密度的 `suggestedTitle`。',
      '4. 提取 2-5 个 `tags`，必须是 kebab-case 的纯英文。',
      '5. 摘录 1-3 句一字不差的原文作为 `keyQuotes`。',
      '6. 给出 `rating`（1-10分，参照水文到神作的标准）。',
      '7. 给出 `category`（从 Enum 中严格选择一项）。'
    ].join('\n')

    return { system, user }
  }
}
