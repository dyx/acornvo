import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { interrupt } from '@langchain/langgraph'
import { isAIMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { agentTools } from './tools'
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory'
import { dbService } from '../services/db'

class ApprovalToolNode extends ToolNode {
  async invoke(input: any, config: any) {
    const messages = input.messages
    const lastMessage = messages[messages.length - 1]

    if (isAIMessage(lastMessage) && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
      const toolCalls = lastMessage.tool_calls
      const needsApproval = toolCalls.some(tc => tc.name === 'update_frontmatter')

      if (needsApproval) {
        const actionRequests = toolCalls.map(tc => ({
          name: tc.name,
          args: tc.args
        }))

        type Decision = { type: 'approve' } | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } } | { type: 'reject'; message?: string }
        const resumeVal = interrupt({ actionRequests }) as { decisions?: Decision[] }
        const decisions = resumeVal?.decisions

        if (Array.isArray(decisions)) {
          const newToolCalls: any[] = []
          const extraToolMessages: ToolMessage[] = []

          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i]
            const dec = decisions[i]

            if (dec?.type === 'reject') {
              extraToolMessages.push(new ToolMessage({
                tool_call_id: tc.id || '',
                name: tc.name,
                content: dec.message || 'User rejected this action.'
              }))
            } else if (dec?.type === 'edit' && dec.editedAction) {
              newToolCalls.push({ ...tc, args: dec.editedAction.args })
            } else {
              newToolCalls.push(tc)
            }
          }

          lastMessage.tool_calls = newToolCalls
          let result: any
          try {
            if (newToolCalls.length > 0) {
              result = await super.invoke(input, config)
            } else {
              result = { messages: [] }
            }
          } finally {
            lastMessage.tool_calls = toolCalls
          }

          if (extraToolMessages.length > 0) {
            result.messages = [...extraToolMessages, ...(result.messages || [])]
          }

          return result
        }
      }
    }

    return super.invoke(input, config)
  }
}

const approvalToolNode = new ApprovalToolNode(agentTools as unknown as any)

type AgentInstance = ReturnType<typeof createReactAgent>

interface SingletonHandle {
  buildForProfile: (profile: ResolvedProfile) => AgentInstance
}

let handle: SingletonHandle | null = null
let checkpointer: BaseCheckpointSaver | null = null
let currentDbForAgent: unknown = null

function getCheckpointer(): BaseCheckpointSaver {
  const db = dbService.requireCurrent()
  if (checkpointer && currentDbForAgent === db) return checkpointer
  currentDbForAgent = db
  checkpointer = new SqliteSaver(db as unknown as ConstructorParameters<typeof SqliteSaver>[0])
  return checkpointer
}

/**
 * Returns a builder that produces a LangGraph agent for a given profile.
 * The model is profile-specific (re-bind per call); the tools array and the
 * checkpointer are stable across profiles.
 *
 * The checkpointer is `SqliteSaver` over the same `better-sqlite3` instance
 * the app uses for everything else, so HITL state survives restarts.
 */
export function getAgentBuilder(): SingletonHandle {
  const db = dbService.requireCurrent()
  if (handle && currentDbForAgent === db) return handle
  const cp = getCheckpointer()

  handle = {
    buildForProfile: (profile: ResolvedProfile) => {
      const model = buildChatModel(profile) as unknown as BaseChatModel
      return createReactAgent({
        llm: model,
        tools: approvalToolNode,
        checkpointSaver: cp
      })
    }
  }
  return handle
}

export function getCheckpointerInstance(): BaseCheckpointSaver {
  return getCheckpointer()
}

/** Test helper — reset the singleton (also clears the checkpointer). */
export function __resetAgentSingleton(): void {
  handle = null
  checkpointer = null
  currentDbForAgent = null
}
