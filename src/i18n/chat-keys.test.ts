import { describe, it, expect } from 'vitest'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v as Record<string, unknown>, key))
    else out.push(key)
  }
  return out
}

describe('chat.* i18n key parity', () => {
  it('chat namespace exists in both locales', () => {
    expect((enUS as any).chat).toBeDefined()
    expect((zhCN as any).chat).toBeDefined()
  })

  it('en-US and zh-CN contain identical chat.* key sets', () => {
    const enKeys = flatten((enUS as any).chat).sort()
    const zhKeys = flatten((zhCN as any).chat).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('contains the documented core keys', () => {
    const enKeys = flatten((enUS as any).chat)
    const required = [
      'approval.title', 'approval.reason', 'approval.args',
      'approval.approve', 'approval.cancel', 'approval.edit',
      'tool.search_files', 'tool.read_file', 'tool.list_tags',
      'tool.update_frontmatter', 'tool.clip_summary',
      'error.step_limit', 'error.missing_profile', 'error.busy',
      'error.global_busy', 'error.user_rejected', 'error.approval_timeout',
      'error.path_escape', 'error.missing_reason',
    ]
    for (const k of required) expect(enKeys).toContain(k)
  })
})
