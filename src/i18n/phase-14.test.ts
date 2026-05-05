import { describe, it, expect } from 'vitest'
import zh from './locales/zh-CN.json'

const REQUIRED_KEYS = [
  'history.jobs.tabLabel',
  'history.jobs.empty',
  'history.jobs.kindFilterLabel',
  'history.jobs.statusFilterLabel',
  'history.jobs.statusDefault',
  'history.jobs.statusAll',
  'history.jobs.kindAll',
  'history.jobs.kind.ai-review-clip',
  'history.jobs.kind.index-retry',
  'history.jobs.summary.aiReview',
  'history.jobs.summary.indexRetry',
  'history.jobs.clearDoneConfirm',
  'jobs.status.pending',
  'jobs.status.running',
  'jobs.status.done',
  'jobs.status.failed',
  'jobs.status.canceled',
  'jobs.action.retry',
  'jobs.action.cancel',
  'jobs.clearDone'
]

function get(obj: Record<string, unknown>, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as object)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, obj)
}

describe('phase-14 i18n keys', () => {
  it.each(REQUIRED_KEYS)('zh-CN has key %s', (key) => {
    const v = get(zh as Record<string, unknown>, key)
    expect(typeof v).toBe('string')
    expect((v as string).length).toBeGreaterThan(0)
  })
})
