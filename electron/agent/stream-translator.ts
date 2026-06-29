import type { AgentEvent, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types'

import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { normalizeLLMError } from '../ai/normalize-errors'

const TOOL_RESULT_BUDGET = 8000

export interface TranslatorPersistence {
  appendMessage: (
    m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
  ) => Promise<SessionMessage>
  recordToolCall: (
    tc: ToolCall,
    opts: { sideEffect: boolean; messageId?: number }
  ) => Promise<string>
  finishToolCall: (rowId: string, fields: { result: ToolResult }) => Promise<void>
  hasToolCall?: (id: string) => Promise<boolean>
  updateLastAssistantUsage?: (usage: any) => Promise<void>
}

export interface TranslatorDeps {
  emit: (e: AgentEvent) => void
  persist: TranslatorPersistence
  recordUsage: (usage: any, model: string) => void
  /** AIMessage.id values already persisted; used to skip duplicates after HITL resume. */
  seenAiMessageIds: Set<string>
  reasoningState?: { startTime: number; duration?: number; isStandardProvider?: boolean }
  accumulatedText?: string
  accumulatedReasoning?: string
  finalUsage?: any
}

function alreadySeen(seen: Set<string>, msg: AIMessage): boolean {
  const id = (msg as unknown as { id?: string }).id ?? ''
  if (!id) return false
  if (seen.has(id)) return true
  seen.add(id)
  return false
}

function aiMessageToolCalls(msg: AIMessage): ToolCall[] {
  const calls =
    (msg as unknown as { tool_calls?: Array<{ id?: string; name?: string; args?: unknown }> })
      .tool_calls ?? []
  return calls.map((tc) => ({
    id: String(tc.id ?? ''),
    name: String(tc.name ?? ''),
    args: tc.args ?? {}
  }))
}

/** Scenario 1 + 2: assistant message from "model" node. */
async function handleAssistantMessage(deps: TranslatorDeps, msg: AIMessage): Promise<void> {
  if (alreadySeen(deps.seenAiMessageIds, msg)) return

  const toolCalls = aiMessageToolCalls(msg)

  // 1. Attempt to parse from standard LangChain API structures (string, array content blocks, additional_kwargs)
  let contentStr = ''
  let reasoningStr = ''

  if (typeof msg.content === 'string') {
    contentStr = msg.content
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content as any[]) {
      if (block.type === 'text') contentStr += block.text || ''
      else if (block.type === 'reasoning' || block.type === 'thinking')
        reasoningStr += block.text || block.reasoning || ''
    }
  }

  if (!reasoningStr && msg.additional_kwargs?.reasoning_content) {
    reasoningStr = msg.additional_kwargs.reasoning_content as string
  }

  // 2. Fallback to accumulated stream data if the final AIMessage lost it (due to provider chunk concat bugs)
  if (!contentStr && deps.accumulatedText) contentStr = deps.accumulatedText
  if (!reasoningStr && deps.accumulatedReasoning) reasoningStr = deps.accumulatedReasoning

  // 3. Assemble the final output
  if (typeof reasoningStr === 'string' && reasoningStr && !contentStr.includes('<think')) {
    const durationAttr = deps.reasoningState?.duration
      ? ` duration="${deps.reasoningState.duration}"`
      : ''
    contentStr = `<think${durationAttr}>\n${reasoningStr}</think>\n\n${contentStr}`
  } else if (contentStr.includes('<think')) {
    const durationAttr = deps.reasoningState?.duration
      ? ` duration="${deps.reasoningState.duration}"`
      : ''
    if (durationAttr) {
      contentStr = contentStr.replace(/<think>/, `<think${durationAttr}>`)
    }
  }

  // Deduplicate replayed historical messages across runs by checking if the tool call already exists.
  if (toolCalls.length > 0 && deps.persist.hasToolCall) {
    const exists = await deps.persist.hasToolCall(toolCalls[0].id)
    if (exists) {
      console.log(
        `[translator] skipping duplicate historical message with tool call ${toolCalls[0].id}`
      )
      return
    }
  }

  const sessionMsg = await deps.persist.appendMessage({
    role: 'assistant',
    content: contentStr || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  })
  deps.emit({ type: 'message.appended', message: sessionMsg })

  for (const tc of toolCalls) {
    deps.emit({ type: 'tool.start', tool: tc.name, args: tc.args, callId: tc.id })
    await deps.persist.recordToolCall(tc, {
      sideEffect: false,
      messageId: sessionMsg.id
    })
  }
}

/** Scenario 3: tool result from "tools" node. */
async function handleToolMessage(deps: TranslatorDeps, msg: ToolMessage): Promise<void> {
  const m = msg as unknown as { tool_call_id?: string; name?: string; content?: unknown }
  const callId = String(m.tool_call_id ?? '')
  const toolName = String(m.name ?? '')
  let result: ToolResult
  const raw = m.content

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      result =
        parsed && typeof parsed === 'object' && 'ok' in parsed
          ? (parsed as ToolResult)
          : { ok: true, data: parsed }
    } catch {
      result = { ok: true, data: raw }
    }
  } else if (raw && typeof raw === 'object' && 'ok' in (raw as object)) {
    result = raw as ToolResult
  } else {
    result = { ok: true, data: raw }
  }

  const persisted = await deps.persist.appendMessage({
    role: 'tool',
    content: JSON.stringify(result).slice(0, TOOL_RESULT_BUDGET),
    toolCallId: callId
  })
  deps.emit({ type: 'message.appended', message: persisted })
  deps.emit({ type: 'tool.result', tool: toolName, result, callId })

  if (callId) {
    await deps.persist.finishToolCall(callId, { result })
  }
}

export async function processMessages(
  messages: AsyncIterable<any>,
  deps: TranslatorDeps,
  modelName: string
): Promise<void> {
  if (!messages) return

  for await (const message of messages) {
    if (message.reasoning) {
      for await (const delta of message.reasoning) {
        if (typeof delta === 'string' && delta) {
          if (!deps.reasoningState) {
            deps.reasoningState = { startTime: Date.now(), isStandardProvider: true }
          }
          deps.reasoningState.isStandardProvider = true
          deps.accumulatedReasoning = (deps.accumulatedReasoning || '') + delta
          deps.emit({ type: 'reasoning-delta', text: delta } as AgentEvent)
        }
      }
    }

    if (message.text) {
      for await (const delta of message.text) {
        const actualContent = typeof delta === 'string' ? delta : ''
        if (actualContent) {
          deps.accumulatedText = (deps.accumulatedText || '') + actualContent

          if (deps.accumulatedText.includes('<think')) {
            if (!deps.reasoningState) {
              deps.reasoningState = { startTime: Date.now() }
            }
          }

          if (deps.reasoningState && deps.reasoningState.duration === undefined) {
            if (deps.accumulatedText.includes('</think>')) {
              deps.reasoningState.duration = Math.max(
                1,
                Math.round((Date.now() - deps.reasoningState.startTime) / 1000)
              )
            } else if (deps.reasoningState.isStandardProvider) {
              deps.reasoningState.duration = Math.max(
                1,
                Math.round((Date.now() - deps.reasoningState.startTime) / 1000)
              )
            }
          }
          deps.emit({ type: 'text-delta', text: actualContent } as AgentEvent)
        }
      }
    }

    const msg = await message.output
    if (msg) {
      let finalUsage = msg.usage_metadata
      const rawUsage = msg.response_metadata?.usage

      if (rawUsage) {
        if (typeof rawUsage.prompt_tokens === 'number') {
          finalUsage = {
            input_tokens: rawUsage.prompt_tokens,
            output_tokens: rawUsage.completion_tokens,
            total_tokens: rawUsage.total_tokens,
            input_token_details: rawUsage.prompt_tokens_details
              ? {
                  cache_read: rawUsage.prompt_tokens_details.cached_tokens
                }
              : undefined,
            output_token_details: rawUsage.completion_tokens_details
              ? {
                  reasoning: rawUsage.completion_tokens_details.reasoning_tokens
                }
              : undefined
          } as any
        }
      }

      deps.finalUsage = finalUsage
      const msgId = msg.id || `anon-${Date.now()}`
      if (!deps.seenAiMessageIds.has(msgId)) {
        if (deps.recordUsage) deps.recordUsage(finalUsage, modelName)
      }

      await handleAssistantMessage(deps, msg)

      // Clear accumulated state for the next message in the same run
      deps.accumulatedText = ''
      deps.accumulatedReasoning = ''
      deps.reasoningState = undefined
    }
  }
}

export async function processToolCalls(
  toolCalls: AsyncIterable<any>,
  deps: TranslatorDeps
): Promise<void> {
  if (!toolCalls) return

  for await (const call of toolCalls) {
    deps.emit({
      type: 'tool.start',
      tool: call.name,
      args: call.input,
      callId: call.id
    })

    try {
      const output = await call.output
      const toolMsg = new ToolMessage({
        tool_call_id: call.id,
        name: call.name,
        content: output
      })
      await handleToolMessage(deps, toolMsg)
    } catch (e) {
      console.error('[processToolCalls] Error awaiting call.output:', e)
    }
  }
}

export function emitError(deps: TranslatorDeps, err: unknown): void {
  try {
    const norm = normalizeLLMError(err)
    deps.emit({
      type: 'error',
      error: norm.code,
      detail: { message: norm.message, httpStatus: norm.httpStatus }
    })
  } catch {
    // AbortError fell through normalizeLLMError's throw — runner should call emitCanceled instead.
    deps.emit({ type: 'canceled' })
  }
}

export function emitCanceled(deps: TranslatorDeps): void {
  deps.emit({ type: 'canceled' })
}

export function emitDone(deps: TranslatorDeps, finalUsage: any, _modelName: string): void {
  const promptTokens = finalUsage?.input_tokens ?? 0
  const completionTokens = finalUsage?.output_tokens ?? 0

  const usageShape = finalUsage
    ? {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cachedTokens: finalUsage.input_token_details?.cache_read,
        reasoningTokens: finalUsage.output_token_details?.reasoning
      }
    : undefined

  if (usageShape && deps.persist.updateLastAssistantUsage) {
    deps.persist.updateLastAssistantUsage(usageShape).catch((err) => {
      console.error('[emitDone] failed to update usage in db', err)
    })
  }

  deps.emit({
    type: 'done',
    usage: usageShape
  } as AgentEvent)
}

export interface ActionRequest {
  name?: string
  args?: unknown
}

export interface InterruptShape {
  id?: string
  value?: { actionRequests?: ActionRequest[] }
  /** Pre-v1 / fallback shapes seen in other LangGraph builds. */
  actionRequests?: ActionRequest[]
  action_requests?: ActionRequest[]
}

/**
 * Scenario 5: interrupt resume needed.
 *
 * Each ActionRequest maps to one of the tool_calls on the immediately-prior
 * assistant message. We use the matching tool_call.id as `callId` so the
 * renderer can fold the approval bubble together with the eventual tool
 * result. `correspondingCallIds[i]` is the tool_call.id for action i — the
 * caller (runner.ts) knows that mapping; we don't try to recover it here.
 */
export function emitInterrupt(
  deps: TranslatorDeps,
  interrupt: InterruptShape,
  correspondingCallIds: string[] = []
): void {
  const reqs =
    interrupt.value?.actionRequests ?? interrupt.actionRequests ?? interrupt.action_requests ?? []
  reqs.forEach((action, i) => {
    const args = (action.args ?? {}) as { reason?: unknown }
    const callId = correspondingCallIds[i] ?? String(interrupt.id ?? '')
    const tool =
      action.name ??
      (action as unknown as { action?: string; tool?: string }).action ??
      (action as unknown as { tool?: string }).tool ??
      ''
    deps.emit({
      type: 'tool.approval-needed',
      callId,
      tool,
      args,
      reason: typeof args.reason === 'string' ? args.reason : undefined
    })
  })
}
