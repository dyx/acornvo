import { RemoveMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { logger } from '../../obs/logger'

const OVERFLOW_RATIO = 0.9
const KEEP_ON_OVERFLOW = 8

export function createReactiveGuard(contextWindow: number) {
  return {
    name: 'ReactiveGuard',
    beforeModel: async (state: any) => {
      const messages = state.messages
      if (!messages || messages.length === 0) return {}

      let lastAiUsage = 0
      let foundUsage = false
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (AIMessage.isInstance(msg)) {
          if (msg.additional_kwargs && msg.additional_kwargs.reasoning_content) {
            delete msg.additional_kwargs.reasoning_content
          }
          if (msg.usage_metadata && !foundUsage) {
            lastAiUsage = msg.usage_metadata.input_tokens || 0
            foundUsage = true
          }
        }
      }

      if (lastAiUsage <= contextWindow * OVERFLOW_RATIO) {
        return {}
      }

      let safeKeepIndex = messages.length - KEEP_ON_OVERFLOW
      if (safeKeepIndex < 0) safeKeepIndex = 0

      while (safeKeepIndex < messages.length) {
        const msg = messages[safeKeepIndex]
        if (ToolMessage.isInstance(msg)) {
          safeKeepIndex++
        } else {
          break
        }
      }

      const removals: any[] = []
      let startIndex = 0
      if (
        messages.length > 0 &&
        (messages[0].getType() === 'system' || (messages[0] as any).type === 'system')
      ) {
        startIndex = 1
      }

      for (let i = startIndex; i < safeKeepIndex; i++) {
        removals.push(new RemoveMessage({ id: messages[i].id }))
      }

      if (removals.length > 0) {
        logger().info('agent', {
          msg: 'reactive overflow guard trimmed messages',
          meta: {
            lastAiUsage,
            contextWindow,
            removedCount: removals.length,
            safeKeepIndex
          }
        })
        return { messages: removals }
      }

      return {}
    }
  }
}
