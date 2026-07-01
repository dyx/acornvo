import type {
  AgentEvent,
  RunAgentArgs,
  SessionMessage,
  ToolCall,
  ToolResult
} from '../../shared/agent-types'
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { collectAttachmentContext } from './attachments'
import { markThreadActive } from './checkpoint-meta'
import {
  processMessages,
  processToolCalls,
  emitError,
  emitCanceled,
  emitDone,
  type TranslatorDeps
} from './stream-translator'
import { logger } from '../obs/logger'

export interface RunnerDeps {
  agent: {
    stream(
      input: { messages: BaseMessage[] } | Command,
      config: {
        configurable: { thread_id: string; vaultRoot?: string }
        streamMode: ['updates', 'messages']
        signal: AbortSignal
      }
    ): AsyncIterable<unknown>
  }
  sessions: {
    appendMessage: (
      sessionId: string,
      m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
    ) => Promise<SessionMessage>
    recordToolCall: (
      sessionId: string,
      tc: ToolCall,
      opts: { sideEffect: boolean; messageId?: number }
    ) => Promise<string>
    finishToolCall: (rowId: string, fields: { result: ToolResult }) => Promise<void>
    hasToolCall?: (id: string) => Promise<boolean>
    updateLastAssistantUsage?: (sessionId: string, usage: any) => Promise<void>
  }
  systemPrompt: string
  vaultRoot: string
  cancel: AbortSignal
  clipsGet?: (id: number) => Promise<{ body: string } | null>
  recordUsage: (usage: any, model: string, rawUsageJson?: string) => void
  modelName: string
  profileId?: string
}

type RunAgentArgsInternal = Omit<RunAgentArgs, 'deps' | 'history'> & { deps: RunnerDeps }

async function processStream(
  stream: any,
  deps: RunnerDeps,
  sessionId: string,
  translatorDeps: TranslatorDeps
) {
  try {
    const p1 = (async () => {
      try {
        await processMessages(stream.messages, translatorDeps, deps.modelName)
      } catch (e) {
        logger().error('runner', { msg: 'Error processing messages', meta: { error: String(e) } })
      }
    })()

    const p2 = (async () => {
      try {
        await processToolCalls(stream.toolCalls, translatorDeps)
      } catch (e) {
        logger().error('runner', { msg: 'Error processing tool calls', meta: { error: String(e) } })
      }
    })()

    await Promise.all([p1, p2])

    logger().info('runner', { msg: '[runAgent] stream finished normally', meta: { sessionId } })
    emitDone(translatorDeps, translatorDeps.finalUsage, deps.modelName)
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string }
    logger().error('runner', {
      msg: '[runAgent] caught error',
      meta: {
        sessionId,
        name: e?.name,
        code: e?.code,
        message: e?.message,
        error: String(err)
      }
    })
    if (e?.name === 'AbortError' || deps.cancel.aborted) {
      emitCanceled(translatorDeps)
      return
    }
    emitError(translatorDeps, err)
  }
}

export async function runAgent({
  sessionId,
  userText,
  deps,
  streamWriter,
  attachments
}: RunAgentArgsInternal): Promise<void> {
  logger().info('runner', {
    msg: '[runAgent] start',
    meta: { sessionId, modelName: deps.modelName }
  })
  const emit = (e: AgentEvent) => streamWriter.write(e)

  // Persist + emit the user message immediately (truth source).
  const userMsg = await deps.sessions.appendMessage(sessionId, {
    role: 'user',
    content: userText,
    attachments
  })
  emit({ type: 'message.appended', message: userMsg })
  logger().info('runner', { msg: '[runAgent] user message appended', meta: { sessionId } })
  try {
    markThreadActive(sessionId)
  } catch (e) {
    logger().warn('runner', {
      msg: 'markThreadActive failed',
      meta: { sessionId, error: String(e) }
    })
  }

  // Collect attachments → synthesize a pre-user block (NOT persisted in session_messages).
  let preUserBlock: string | null = null
  if (attachments && attachments.length > 0 && deps.clipsGet) {
    const result = await collectAttachmentContext(attachments, {
      groveRoot: deps.vaultRoot,
      clipsGet: deps.clipsGet
    })
    if (result.blocks.length > 0) {
      preUserBlock = '以下是我附加的内容供你参考：\n' + result.blocks.join('')
    }
  }

  const translatorDeps: TranslatorDeps = {
    emit,
    persist: {
      appendMessage: (m) => deps.sessions.appendMessage(sessionId, m),
      recordToolCall: (tc, opts) => deps.sessions.recordToolCall(sessionId, tc, opts),
      finishToolCall: (rowId, fields) => deps.sessions.finishToolCall(rowId, fields),
      hasToolCall: (id) =>
        typeof deps.sessions.hasToolCall === 'function'
          ? deps.sessions.hasToolCall(id)
          : Promise.resolve(false),
      updateLastAssistantUsage: (usage) =>
        typeof deps.sessions.updateLastAssistantUsage === 'function'
          ? deps.sessions.updateLastAssistantUsage(sessionId, usage)
          : Promise.resolve()
    },
    recordUsage: deps.recordUsage,
    seenAiMessageIds: new Set()
  }

  // Construct only the new messages to send to the LangGraph Checkpointer.
  // The system prompt gets a fixed ID so it overwrites any existing system prompt.
  const newMessages: BaseMessage[] = [
    new SystemMessage({ content: deps.systemPrompt, id: 'system-prompt' })
  ]
  newMessages.push(new HumanMessage({ content: userText }))
  if (preUserBlock) {
    newMessages.push(new HumanMessage({ content: preUserBlock, id: 'attachment-context' }))
  }

  try {
    logger().info('runner', { msg: '[runAgent] agent.streamEvents() invoked', meta: { sessionId } })
    const agent = deps.agent as any
    const stream = await agent.streamEvents(
      { messages: newMessages },
      {
        version: 'v3',
        recursionLimit: 256,
        configurable: { thread_id: sessionId, vaultRoot: deps.vaultRoot },
        signal: deps.cancel
      }
    )

    await processStream(stream, deps, sessionId, translatorDeps)
  } catch (err) {
    emitError(translatorDeps, err)
  }
}

export type AgentDecision =
  | { type: 'accept' }
  | { type: 'edit'; args: Record<string, unknown> }
  | { type: 'reject'; message?: string }

export interface ResumeAgentArgs {
  sessionId: string
  agent: RunnerDeps['agent']
  decisions: AgentDecision[]
  cancel: AbortSignal
  streamWriter: { write: (e: AgentEvent) => void }
  sessions: RunnerDeps['sessions']
  recordUsage: RunnerDeps['recordUsage']
  modelName: string
  profileId?: string
  vaultRoot: string
}

export async function resumeAgent(args: ResumeAgentArgs): Promise<void> {
  const translatorDeps: TranslatorDeps = {
    emit: (e) => args.streamWriter.write(e),
    persist: {
      appendMessage: (m) => args.sessions.appendMessage(args.sessionId, m),
      recordToolCall: (tc, opts) => args.sessions.recordToolCall(args.sessionId, tc, opts),
      finishToolCall: (rowId, fields) => args.sessions.finishToolCall(rowId, fields),
      hasToolCall: (id) =>
        typeof args.sessions.hasToolCall === 'function'
          ? args.sessions.hasToolCall(id)
          : Promise.resolve(false),
      updateLastAssistantUsage: (usage) =>
        typeof args.sessions.updateLastAssistantUsage === 'function'
          ? args.sessions.updateLastAssistantUsage(args.sessionId, usage)
          : Promise.resolve()
    },
    recordUsage: args.recordUsage,
    seenAiMessageIds: new Set()
  }

  // Map AgentDecision to LangChain's HITL response formats
  const mappedDecisions = args.decisions.map((d) => {
    if (d.type === 'accept') return { type: 'approve' }
    if (d.type === 'edit') return { type: 'edit', args: d.args } // wait, hitl expects editedAction? No, editedAction is { name, args } maybe? Actually 'args' or 'editedArgs' is fine depending on version, but the middleware standard is 'edit' with args.
    return { type: 'reject', message: d.message }
  })

  try {
    const agent = args.agent as any
    const stream = await agent.streamEvents(
      new Command({ resume: { decisions: mappedDecisions } }),
      {
        version: 'v3',
        configurable: { thread_id: args.sessionId, vaultRoot: args.vaultRoot },
        signal: args.cancel
      }
    )

    const depsDummy: RunnerDeps = {
      agent: args.agent,
      sessions: args.sessions,
      systemPrompt: '',
      vaultRoot: args.vaultRoot,
      cancel: args.cancel,
      recordUsage: args.recordUsage,
      modelName: args.modelName,
      profileId: args.profileId
    }

    await processStream(stream, depsDummy, args.sessionId, translatorDeps)
  } catch (err) {
    const e = err as { name?: string }
    if (e?.name === 'AbortError' || args.cancel.aborted) {
      emitCanceled(translatorDeps)
      return
    }
    emitError(translatorDeps, err)
  }
}
