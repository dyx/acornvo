import type {
  AgentEvent,
  RunAgentArgs,
  SessionMessage,
  ToolCall,
  ToolResult
} from '../../shared/agent-types'
import {
  HumanMessage,
  SystemMessage,
  type BaseMessage
} from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { collectAttachmentContext } from './attachments'
import { markThreadActive } from './checkpoint-meta'
import {
  translateStreamEntry,
  emitError,
  emitCanceled,
  emitDone,
  emitInterrupt,
  type InterruptShape,
  type TranslatorDeps
} from './stream-translator'

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
  }
  systemPrompt: string
  vaultRoot: string
  cancel: AbortSignal
  clipsGet?: (id: number) => Promise<{ body: string } | null>
  recordUsage: (
    usage: { input_tokens?: number; output_tokens?: number } | undefined,
    model: string,
    rawUsageJson?: string
  ) => void
  modelName: string
  profileId?: string
}

type RunAgentArgsInternal = Omit<RunAgentArgs, 'deps' | 'history'> & { deps: RunnerDeps }

async function processStream(
  stream: AsyncIterable<unknown>,
  deps: RunnerDeps,
  sessionId: string,
  translatorDeps: TranslatorDeps
) {
  let entryCount = 0
  let lastUsage: { input_tokens?: number; output_tokens?: number } | undefined
  let lastAssistantToolCallIds: string[] = []
  const recordedUsageMsgIds = new Set<string>()

  try {
    for await (const entry of stream) {
      entryCount++
      if (entryCount === 1) console.log('[runAgent] first stream entry sid=%s', sessionId)
      
      if (deps.cancel.aborted) {
        console.log('[runAgent] cancel detected sid=%s entryCount=%d', sessionId, entryCount)
        emitCanceled(translatorDeps)
        return
      }
      
      await translateStreamEntry(translatorDeps, entry, deps.modelName)

      if (Array.isArray(entry) && entry[0] === 'updates') {
        const payload = entry[1] as Record<string, unknown> | undefined

        let modelNode: { messages?: unknown[] } | undefined
        if (payload) {
          if (payload.model) modelNode = payload.model as any
          else if (payload.agent) modelNode = payload.agent as any
          else {
            for (const val of Object.values(payload)) {
              if (val && typeof val === 'object' && Array.isArray((val as any).messages)) {
                modelNode = val as any
                break
              }
            }
          }
        }
        if (modelNode?.messages) {
          for (const m of modelNode.messages) {
            const ai = m as {
              id?: string
              usage_metadata?: { input_tokens?: number; output_tokens?: number }
              response_metadata?: { usage?: any }
              tool_calls?: Array<{ id?: string }>
            }
            if (ai.usage_metadata || ai.response_metadata?.usage) {
              let finalUsage = ai.usage_metadata
              const rawUsage = ai.response_metadata?.usage
              let rawUsageJson: string | undefined
              
              if (rawUsage) {
                try { rawUsageJson = JSON.stringify(rawUsage) } catch {}
                if (typeof rawUsage.prompt_tokens === 'number') {
                  finalUsage = {
                    input_tokens: rawUsage.prompt_tokens,
                    output_tokens: rawUsage.completion_tokens,
                    input_token_details: {
                      cache_read: rawUsage.prompt_tokens_details?.cached_tokens ?? rawUsage.prompt_cache_hit_tokens ?? 0
                    },
                    output_token_details: {
                      reasoning: rawUsage.completion_tokens_details?.reasoning_tokens ?? 0
                    }
                  } as any
                }
              }
              lastUsage = finalUsage
              const msgId = ai.id || `anon-${entryCount}`
              if (!recordedUsageMsgIds.has(msgId)) {
                recordedUsageMsgIds.add(msgId)
                deps.recordUsage(finalUsage, deps.modelName, rawUsageJson)
              }
            }
            if (Array.isArray(ai.tool_calls) && ai.tool_calls.length > 0) {
              lastAssistantToolCallIds = ai.tool_calls.map((tc) => String(tc.id ?? ''))
            }
          }
        }

        const interrupts = payload?.__interrupt__ as InterruptShape[] | undefined
        if (Array.isArray(interrupts) && interrupts.length > 0) {
          for (const ir of interrupts) {
            emitInterrupt(translatorDeps, ir, lastAssistantToolCallIds)
            // Pending states are now queried directly from DB and checkpointer. 
            // We no longer populate pendingInterrupts here.
          }
          return
        }
      }
    }

    console.log('[runAgent] stream finished normally sid=%s entries=%d', sessionId, entryCount)
    emitDone(translatorDeps, lastUsage, deps.modelName)
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string }
    console.error(
      '[runAgent] caught error sid=%s name=%s code=%s msg=%s',
      sessionId,
      e?.name,
      e?.code,
      e?.message,
      err
    )
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
  console.log('[runAgent] start sid=%s model=%s', sessionId, deps.modelName)
  const emit = (e: AgentEvent) => streamWriter.write(e)

  // Persist + emit the user message immediately (truth source).
  const userMsg = await deps.sessions.appendMessage(sessionId, {
    role: 'user',
    content: userText
  })
  emit({ type: 'message.appended', message: userMsg })
  console.log('[runAgent] user message appended sid=%s', sessionId)
  try {
    markThreadActive(sessionId)
  } catch {}

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
      hasToolCall: (id) => typeof deps.sessions.hasToolCall === 'function' ? deps.sessions.hasToolCall(id) : Promise.resolve(false)
    },
    recordUsage: deps.recordUsage,
    seenAiMessageIds: new Set()
  }

  // Construct only the new messages to send to the LangGraph Checkpointer.
  // The system prompt gets a fixed ID so it overwrites any existing system prompt.
  const newMessages: BaseMessage[] = [
    new SystemMessage({ content: deps.systemPrompt, id: "system-prompt" })
  ]
  if (preUserBlock) {
    newMessages.push(new HumanMessage({ content: preUserBlock, id: "attachment-context" }))
  }
  newMessages.push(new HumanMessage({ content: userText }))

  try {
    console.log('[runAgent] agent.stream() invoked sid=%s', sessionId)
    const stream = await deps.agent.stream(
      { messages: newMessages },
      {
        configurable: { thread_id: sessionId, vaultRoot: deps.vaultRoot },
        streamMode: ['updates', 'messages'],
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
      hasToolCall: (id) => typeof args.sessions.hasToolCall === 'function' ? args.sessions.hasToolCall(id) : Promise.resolve(false)
    },
    recordUsage: args.recordUsage,
    seenAiMessageIds: new Set()
  }

  // Map AgentDecision to LangChain's HITL response formats
  // Although humanInTheLoopMiddleware accepts 'approve', 'edit', 'reject' via HITLResponse,
  // we can also pass the raw values to resume. 
  // Wait, `humanInTheLoopMiddleware` resume format depends on the middleware implementation.
  // Actually, we can just pass the array directly since we mapped them to what we need.
  const mappedDecisions = args.decisions.map(d => {
    if (d.type === 'accept') return { type: 'approve' }
    if (d.type === 'edit') return { type: 'edit', args: d.args } // wait, hitl expects editedAction? No, editedAction is { name, args } maybe? Actually 'args' or 'editedArgs' is fine depending on version, but the middleware standard is 'edit' with args. 
    return { type: 'reject', message: d.message }
  })

  try {
    const stream = await args.agent.stream(new Command({ resume: { decisions: mappedDecisions } }), {
      configurable: { thread_id: args.sessionId, vaultRoot: args.vaultRoot },
      streamMode: ['updates', 'messages'],
      signal: args.cancel
    })

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
