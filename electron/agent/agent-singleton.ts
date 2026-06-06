import { createAgent, humanInTheLoopMiddleware, summarizationMiddleware, toolCallLimitMiddleware } from 'langchain'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { agentTools } from './tools'
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory'
import { dbService } from '../services/db'

type AgentInstance = ReturnType<typeof createAgent>

interface SingletonHandle {
  buildForProfile: (profile: ResolvedProfile) => AgentInstance
}

let handle: SingletonHandle | null = null
let checkpointer: BaseCheckpointSaver | null = null
let currentDbForAgent: unknown = null

function getCheckpointer(): BaseCheckpointSaver {
  const db = dbService.requireCurrent()
  if (checkpointer && currentDbForAgent === db && (db as any).open) return checkpointer
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
  if (handle && currentDbForAgent === db && (db as any).open) return handle
  const cp = getCheckpointer()

  const hitl = humanInTheLoopMiddleware({
    interruptOn: {}
  })

  handle = {
    buildForProfile: (profile: ResolvedProfile) => {
      const model = buildChatModel(profile, { temperature: 0.3, maxTokens: 4096 }) as unknown as BaseChatModel
      
      let finalModel = model
      if (profile.provider === 'deepseek' && finalModel.bindTools) {
        const originalBindTools = finalModel.bindTools.bind(finalModel)
        finalModel.bindTools = (tools: any, kwargs: any) => {
          return originalBindTools(tools, { ...kwargs, strict: true })
        }
      }
      
      const summarizer = summarizationMiddleware({
        model: finalModel,
        trigger: { messages: 20 },
        keep: { messages: 6 }
      })
      
      const searchLimiter = toolCallLimitMiddleware({
        toolName: 'search_files',
        runLimit: 2,
        exitBehavior: 'continue'
      })
      
      return createAgent({
        model: finalModel,
        tools: agentTools as any,
        middleware: [hitl, summarizer, searchLimiter],
        checkpointer: cp
      }) as any
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
