import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ProviderCaps } from './capabilities'

export function stripUnsupported(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(stripUnsupported)
  }
  if (schema && typeof schema === 'object') {
    const next: any = {}
    for (const [k, v] of Object.entries(schema)) {
      if (['minItems', 'maxItems', 'minLength', 'maxLength'].includes(k)) {
        continue
      }
      next[k] = stripUnsupported(v)
    }
    return next
  }
  return schema
}

export function ensureAllRequired(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema

  const next = { ...schema }
  if (next.type === 'object' && next.properties) {
    next.required = Object.keys(next.properties)
    for (const k of Object.keys(next.properties)) {
      next.properties[k] = ensureAllRequired(next.properties[k])
    }
  } else if (next.type === 'array' && next.items) {
    next.items = ensureAllRequired(next.items)
  }
  return next
}

export function ensureAdditionalPropertiesFalse(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema

  const next = { ...schema }
  if (next.type === 'object') {
    next.additionalProperties = false
    if (next.properties) {
      for (const k of Object.keys(next.properties)) {
        next.properties[k] = ensureAdditionalPropertiesFalse(next.properties[k])
      }
    }
  } else if (next.type === 'array' && next.items) {
    next.items = ensureAdditionalPropertiesFalse(next.items)
  }
  return next
}

export function toSendSchema(schema: any, profile: ProviderCaps): Record<string, unknown> {
  let js = zodToJsonSchema(schema, { target: 'jsonSchema7' }) as Record<string, unknown>

  if (profile.schemaProfile !== 'strict_subset') {
    return js
  }

  js = stripUnsupported(js)
  js = ensureAllRequired(js)
  js = ensureAdditionalPropertiesFalse(js)

  return js
}
