import type { AgentEvent, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types'
import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  isAIMessage,
  isAIMessageChunk,
  isToolMessage
} from '@langchain/core/messages'
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
}

export interface TranslatorDeps {
  emit: (e: AgentEvent) => void
  persist: TranslatorPersistence
  recordUsage: (
    usage: { input_tokens?: number; output_tokens?: number } | undefined,
    model: string
  ) => void
  /** AIMessage.id values already persisted; used to skip duplicates after HITL resume. */
  seenAiMessageIds: Set<string>
  /** Map from LangGraph tool_call_id → DB tool_calls row id (for finishing). */
  toolCallRowIdByCallId: Map<string, string>
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
  const content = (msg as unknown as { content?: unknown }).content
  const sessionMsg = await deps.persist.appendMessage({
    role: 'assistant',
    content: typeof content === 'string' ? content : null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  })
  deps.emit({ type: 'message.appended', message: sessionMsg })

  for (const tc of toolCalls) {
    deps.emit({ type: 'tool.start', tool: tc.name, args: tc.args, callId: tc.id })
    const rowId = await deps.persist.recordToolCall(tc, {
      sideEffect: tc.name === 'update_frontmatter',
      messageId: sessionMsg.id
    })
    deps.toolCallRowIdByCallId.set(tc.id, rowId)
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

  const rowId = deps.toolCallRowIdByCallId.get(callId)
  if (rowId) {
    await deps.persist.finishToolCall(rowId, { result })
    deps.toolCallRowIdByCallId.delete(callId)
  }
}

export interface ActionRequest {
  name: string
  args: Record<string, unknown>
  description?: string
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

/**
 * Translate one LangGraph stream entry. `streamMode` was set to
 * ['updates', 'messages'] so each entry is a tuple `[mode, payload]`.
 */
export async function translateStreamEntry(
  deps: TranslatorDeps,
  entry: unknown,
  _modelName: string
): Promise<void> {
  if (!Array.isArray(entry) || entry.length < 2) return
  const [mode, payload] = entry as [string, unknown]

  if (mode === 'updates') {
    const nodes = (payload ?? {}) as Record<string, { messages?: unknown[] }>
    for (const nodeKey of Object.keys(nodes)) {
      const node = nodes[nodeKey]
      const messages: unknown[] = node?.messages ?? []
      for (const m of messages) {
        if (isAIMessage(m as never)) await handleAssistantMessage(deps, m as AIMessage)
        else if (isToolMessage(m as never)) await handleToolMessage(deps, m as ToolMessage)
      }
    }
    return
  }

  if (mode === 'messages') {
    const tuple = payload as [unknown, { langgraph_node?: string }]
    const [chunk, metadata] = tuple
    if (metadata?.langgraph_node !== 'model') return
    if (!isAIMessageChunk(chunk as never)) return
    const content = (chunk as AIMessageChunk).content
    const text = typeof content === 'string' ? content : ''
    if (text) deps.emit({ type: 'token', text })
    return
  }
}

export function emitError(deps: TranslatorDeps, err: unknown): void {
  try {
    const norm = normalizeLLMError(err)
    deps.emit({ type: 'error', error: norm.code, detail: norm.message })
  } catch {
    // AbortError fell through normalizeLLMError's throw — runner should call emitCanceled instead.
    deps.emit({ type: 'canceled' })
  }
}

export function emitCanceled(deps: TranslatorDeps): void {
  deps.emit({ type: 'canceled' })
}

export function emitDone(
  deps: TranslatorDeps,
  finalUsage: { input_tokens?: number; output_tokens?: number } | undefined,
  modelName: string
): void {
  deps.recordUsage(finalUsage, modelName)
  const promptTokens = finalUsage?.input_tokens ?? 0
  const completionTokens = finalUsage?.output_tokens ?? 0
  deps.emit({
    type: 'done',
    usage: finalUsage
      ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
      : undefined
  })
}
