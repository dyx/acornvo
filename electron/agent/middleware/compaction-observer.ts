import { dbService } from '../../services/db'
import { estimateMessagesTokens } from './token-estimator'
import { isAIMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { logger } from '../../obs/logger'

interface CompactionState {
  count: number
  tokenEst: number
}

// In-memory map keyed by thread_id to safely pass state between beforeModel and afterModel
const stateMap = new Map<string, CompactionState>()

export function createCompactionObserver(contextWindow: number) {
  return {
    name: 'CompactionObserver',
    beforeModel: async (state: any, config?: any) => {
      const thread_id = config?.configurable?.thread_id
      if (thread_id) {
        stateMap.set(thread_id, {
          count: state.messages.length,
          tokenEst: estimateMessagesTokens(state.messages)
        })
      }
      return {}
    },
    afterModel: async (state: any, config?: any) => {
      const thread_id = config?.configurable?.thread_id
      if (!thread_id) return {}
      
      const pre = stateMap.get(thread_id)
      stateMap.delete(thread_id)
      
      if (!pre) return {}

      const postCount = state.messages.length
      const postTokenEst = estimateMessagesTokens(state.messages)
      
      if (postCount < pre.count) {
        // Compression happened
        let lastAiUsage = 0
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const msg = state.messages[i]
          if (isAIMessage(msg) && msg.usage_metadata) {
            lastAiUsage = msg.usage_metadata.input_tokens || 0
            break
          }
        }
        
        const trigger = lastAiUsage > contextWindow * 0.9 ? 'reactive_overflow' : 'token_pressure'
        const reason = `postCount(${postCount}) < preCount(${pre.count})`
        
        try {
          const db = dbService.requireCurrent()
          db.prepare(`
            INSERT INTO compaction_events 
            (id, session_id, pre_message_count, post_message_count, pre_token_est, post_token_est, trigger, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            randomUUID(),
            thread_id,
            pre.count,
            postCount,
            pre.tokenEst,
            postTokenEst,
            trigger,
            reason,
            new Date().toISOString()
          )

          logger().info('agent', {
            msg: 'compaction event recorded',
            meta: { session_id: thread_id, trigger, preTokenEst: pre.tokenEst, postTokenEst, preCount: pre.count, postCount }
          })
        } catch (err) {
          logger().error('agent', { msg: 'Failed to record compaction event', meta: err as Record<string, unknown> })
        }
      }
      return {}
    }
  }
}
