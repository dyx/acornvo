import { tool } from '@langchain/core/tools'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ProviderCaps } from './capabilities'
import type { z } from 'zod'

export interface StructuredStrategy<T> {
  invoke(model: BaseChatModel, messages: any[]): Promise<{ raw: unknown; parsed: T | null }>
}

export class FunctionCallStrategy<T> implements StructuredStrategy<T> {
  constructor(
    private schema: z.ZodTypeAny,
    private sendSchema: Record<string, unknown>,
    private opts: { strict: boolean; betaUrl?: string; forceToolChoice: boolean }
  ) {}

  async invoke(model: BaseChatModel, messages: any[]): Promise<{ raw: unknown; parsed: T | null }> {
    const reviewTool = tool(async () => {}, {
      name: 'review_clip',
      description: 'Review the clip and output the structured result',
      schema: this.sendSchema as any
    })

    const boundModel = (model as any).bindTools([reviewTool], { strict: this.opts.strict })

    const res = await boundModel.invoke(messages)

    let toolCall = res.tool_calls?.[0]
    if (!toolCall && res.additional_kwargs?.tool_calls?.[0]) {
      const rawToolCall = res.additional_kwargs.tool_calls[0]
      toolCall = {
        name: rawToolCall.function.name,
        args: JSON.parse(rawToolCall.function.arguments),
        id: rawToolCall.id
      }
    }

    if (toolCall) {
      return { raw: res, parsed: this.schema.parse(toolCall.args) as T }
    }

    throw new Error('FunctionCallStrategy failed: no tool call found')
  }
}

export class JsonModeStrategy<T> implements StructuredStrategy<T> {
  constructor(
    private schema: z.ZodTypeAny,
    private sendSchema: Record<string, unknown>
  ) {}

  async invoke(model: BaseChatModel, messages: any[]): Promise<{ raw: unknown; parsed: T | null }> {
    const structuredModel = model.withStructuredOutput(this.sendSchema as any, {
      includeRaw: true,
      method: 'jsonMode',
      name: 'review_clip'
    })

    const out = await structuredModel.invoke(messages)
    return {
      raw: out.raw,
      parsed: this.schema.parse(out.parsed) as T
    }
  }
}

export class TextParseStrategy<T> implements StructuredStrategy<T> {
  constructor(private schema: z.ZodTypeAny) {}

  async invoke(model: BaseChatModel, messages: any[]): Promise<{ raw: unknown; parsed: T | null }> {
    const res = await model.invoke(messages)

    let text = res.content
    if (typeof text !== 'string') text = JSON.stringify(text)

    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (m) text = m[1]

    return { raw: res, parsed: this.schema.parse(JSON.parse(text)) as T }
  }
}

export function buildChain<T>(
  caps: ProviderCaps,
  schema: z.ZodTypeAny,
  sendSchema: Record<string, unknown>
): StructuredStrategy<T>[] {
  const chain: StructuredStrategy<T>[] = []

  if (caps.strictMode === 'deepseek_beta') {
    chain.push(
      new FunctionCallStrategy(schema, sendSchema, {
        strict: true,
        betaUrl: caps.betaUrlSuffix,
        forceToolChoice: false
      })
    )
  } else if (caps.strictMode === 'openai_strict') {
    chain.push(
      new FunctionCallStrategy(schema, sendSchema, {
        strict: true,
        forceToolChoice: caps.canForceToolChoice
      })
    )
  }

  if (caps.structuredMethod === 'json_mode' && !caps.canForceToolChoice) {
    chain.push(new JsonModeStrategy(schema, sendSchema))
  }

  chain.push(new TextParseStrategy(schema))

  return chain
}

export async function runChain<T>(
  chain: StructuredStrategy<T>[],
  model: BaseChatModel,
  messages: any[]
): Promise<{ raw: unknown; parsed: T | null }> {
  let lastError: any = null
  for (const strategy of chain) {
    try {
      return await strategy.invoke(model, messages)
    } catch (e: any) {
      lastError = e

      const errorMsg = e.message || ''
      // For network errors or API errors like 401/429, we should probably not fallback
      // but for parsing errors or tool choice errors, fallback is good.
      if (
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('401') ||
        errorMsg.includes('429')
      ) {
        throw e
      }
      // console.warn(`Strategy ${strategy.constructor.name} failed, falling back. Error: ${errorMsg}`)
    }
  }
  throw lastError
}
