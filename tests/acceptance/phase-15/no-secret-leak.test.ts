// tests/acceptance/phase-15/no-secret-leak.test.ts
// Acceptance 10.19 — no api-key leaks to renderer

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

describe('10.19 — no api-key leaks to renderer', () => {
  it('renderer source does not import getProfileDecryptedKey', () => {
    let hits = ''
    try {
      hits = execSync(`grep -rln "getProfileDecryptedKey" src/ 2>/dev/null || true`, {
        encoding: 'utf8'
      })
    } catch {
      /* */
    }
    expect(hits.trim()).toBe('')
  })

  it('preload does not re-export getProfileDecryptedKey or apiKey values', () => {
    let hits = ''
    try {
      hits = execSync(`grep -rn "getProfileDecryptedKey\\|apiKey" preload/ 2>/dev/null || true`, {
        encoding: 'utf8'
      })
    } catch {
      /* */
    }
    const lines = hits.split('\n').filter(Boolean)
    // Allow type-only references and comments
    const codeHits = lines.filter((l) => !/\.d\.ts|\/\/|\*/.test(l) && !l.includes('import type'))
    expect(codeHits).toEqual([])
  })

  it('IPC contract type for ai.* does not declare any apiKey field', () => {
    const text = fs.readFileSync('shared/ipc-contract.ts', 'utf8')
    // Find the ai namespace block by locating its start and matching balanced braces
    const aiStart = text.indexOf('ai: {')
    expect(aiStart).toBeGreaterThan(0)
    let depth = 0
    let aiEnd = -1
    for (let i = aiStart; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          aiEnd = i + 1
          break
        }
      }
    }
    expect(aiEnd).toBeGreaterThan(0)
    const aiBlock = text.slice(aiStart, aiEnd)
    expect(aiBlock.toLowerCase()).not.toContain('apikey')
    expect(aiBlock.toLowerCase()).not.toContain('api_key')
  })

  it('preload ensures comment about not exposing api keys exists', () => {
    const text = fs.readFileSync('preload/preload.ts', 'utf8')
    expect(text).toContain('getProfileDecryptedKey')
    expect(text).toContain('NOT exposed')
  })
})
