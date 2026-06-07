import type { TokenUsage } from './ai-types'

export type JSONSchema = {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null'
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: readonly (string | number)[]
  description?: string
  [k: string]: unknown
}

export interface ToolCtx {
  sessionId: string
  vaultRoot: string
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    ctx?: Record<string, unknown>
  ) => void
  signal: AbortSignal
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string
  description: string
  parameters: JSONSchema
  sideEffect: boolean
  execute(args: TArgs, ctx: ToolCtx): Promise<TResult>
}

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; detail?: unknown }

export interface Session {
  id: string
  title: string | null
  profileId: string | null
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export interface SessionMessage {
  id: number
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  toolCalls?: ToolCall[]
  toolCallId?: string
  usage?: TokenUsage
  attachments?: Attachment[]
  createdAt: string
}

export type AgentEvent =
  | { type: 'message.appended'; message: SessionMessage }
  | { type: 'step.start'; step: number }
  | { type: 'token'; text: string }
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool.approval-needed'; callId: string; tool: string; args: unknown; reason?: string }
  | { type: 'tool.start'; tool: string; args: unknown; callId?: string }
  | { type: 'tool.result'; tool: string; result: ToolResult; callId?: string }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'error'; error: string; detail?: unknown }
  | { type: 'canceled' }

export type Attachment =
  | { type: 'file'; path: string; title: string }
  | { type: 'clip'; clipId: number; url: string; title: string }

export interface RunAgentArgs {
  sessionId: string
  userText: string
  profileId: string
  history: SessionMessage[]
  deps: Record<string, unknown>
  streamWriter: { write: (e: AgentEvent) => void }
  attachments?: Attachment[]
}

export interface ChatWithToolsResult {
  text?: string
  toolCalls: ToolCall[]
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
  usage?: TokenUsage
}
