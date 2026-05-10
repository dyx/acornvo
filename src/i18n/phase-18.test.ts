import { describe, expect, it } from 'vitest'
import en from './locales/en-US.json'
import zh from './locales/zh-CN.json'

const PHASE_18_PREFIXES = ['obs.', 'about.', 'crash.', 'update.', 'telemetry.', 'settings.tab.about', 'settings.tab.observability']

function flatten(o: unknown, prefix = ''): string[] {
  if (typeof o !== 'object' || o === null) return [prefix.replace(/\.$/, '')]
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flatten(v, `${prefix}${k}.`))
}

function p18Keys(blob: unknown): Set<string> {
  return new Set(flatten(blob).filter((k) => PHASE_18_PREFIXES.some((p) => k === p || k.startsWith(p))))
}

describe('phase-18 i18n key parity', () => {
  it('en and zh have identical phase-18 key sets', () => {
    const e = p18Keys(en); const z = p18Keys(zh)
    expect([...e].sort()).toEqual([...z].sort())
  })
})
