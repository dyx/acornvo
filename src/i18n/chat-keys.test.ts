import { describe, it, expect } from 'vitest'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

type LocaleNode = string | { [key: string]: LocaleNode }

function walkKeys(obj: LocaleNode, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return [prefix]
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    out.push(...walkKeys(v, key))
  }
  return out
}

function walkStructure(obj: LocaleNode, prefix = ''): Map<string, 'string' | 'object'> {
  const map = new Map<string, 'string' | 'object'>()
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    map.set(prefix, 'string')
    return map
  }
  map.set(prefix, 'object')
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    for (const [childKey, childType] of walkStructure(v, key)) {
      map.set(childKey, childType)
    }
  }
  return map
}

describe('chat.* i18n key parity', () => {
  const zhChat = (zhCN as Record<string, unknown>).chat as Record<string, unknown>
  const enChat = (enUS as Record<string, unknown>).chat as Record<string, unknown>

  it('chat namespace exists in both locales', () => {
    expect(zhChat).toBeDefined()
    expect(enChat).toBeDefined()
  })

  it('every zh-CN chat.* key exists in en-US with the same type (string vs object)', () => {
    const zhStructure = walkStructure(zhChat, 'chat')
    const enStructure = walkStructure(enChat, 'chat')

    const missingInEn: string[] = []
    const typeMismatch: string[] = []

    for (const [key, zhType] of zhStructure) {
      const enType = enStructure.get(key)
      if (enType === undefined) {
        missingInEn.push(key)
      } else if (enType !== zhType) {
        typeMismatch.push(`${key} (zh-CN: ${zhType}, en-US: ${enType})`)
      }
    }

    if (missingInEn.length > 0) {
      expect.fail(`Missing keys in en-US:\n  ${missingInEn.join('\n  ')}`)
    }
    if (typeMismatch.length > 0) {
      expect.fail(`Type mismatches between zh-CN and en-US:\n  ${typeMismatch.join('\n  ')}`)
    }
  })

  it('no extra keys in en-US chat.* that zh-CN does not have', () => {
    const zhKeys = new Set(walkStructure(zhChat, 'chat').keys())
    const enStructure = walkStructure(enChat, 'chat')

    const extraInEn: string[] = []

    for (const key of enStructure.keys()) {
      if (!zhKeys.has(key)) {
        extraInEn.push(key)
      }
    }

    if (extraInEn.length > 0) {
      expect.fail(`Extra keys in en-US not present in zh-CN:\n  ${extraInEn.join('\n  ')}`)
    }
  })

  it('en-US and zh-CN have identical chat.* leaf key sets', () => {
    const zhLeafKeys = walkKeys(zhChat, 'chat')
      .filter((k) => typeof getAtPath(zhChat, k.replace('chat.', '')) === 'string')
      .sort()
    const enLeafKeys = walkKeys(enChat, 'chat')
      .filter((k) => typeof getAtPath(enChat, k.replace('chat.', '')) === 'string')
      .sort()
    expect(zhLeafKeys).toEqual(enLeafKeys)
  })
})

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[k]
    return undefined
  }, obj)
}
