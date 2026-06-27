import type { BaseMessage } from '@langchain/core/messages'

// 版本: 'acornvo.estimateTokens.v1'
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4E00-\u9FFF]/g) || []).length
  const nonCjk = text.length - cjk
  return Math.ceil((cjk * 2 + nonCjk) / 3)
}

function extractText(content: any): string {
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'text') text += part.text
    }
  }
  // Remove <think>...</think> blocks from token estimation
  return text.replace(/<think[\s\S]*?<\/think>/g, '')
}

export function estimateMessagesTokens(messages: BaseMessage[]): number {
  let total = 0
  for (const m of messages) {
    const text = extractText(m.content)
    if (text) total += estimateTokens(text)
  }
  return total
}
