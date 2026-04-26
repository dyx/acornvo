import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { safeResolve } from './path-safety'
import { IpcError } from '@shared/ipc-contract'

describe('safeResolve', () => {
  describe('basic resolution + grove prefix check', () => {
    it('resolves a legal relative path inside the grove', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        expect(safeResolve(root, 'notes/a.md')).toBe(join(root, 'notes', 'a.md'))
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('accepts an absolute path that already lies inside the grove', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        const inside = join(root, 'notes', 'a.md')
        expect(safeResolve(root, inside)).toBe(inside)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('returns the grove root itself when given an empty relative path', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        expect(safeResolve(root, '')).toBe(root)
        expect(safeResolve(root, '.')).toBe(root)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('throws E_PERMISSION when the absolute path lies outside the grove', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        expect(() => safeResolve(root, '/etc/passwd')).toThrow(IpcError)
        expect(() => safeResolve(root, '/etc/passwd')).toThrow(/E_PERMISSION|escapes/i)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('error carries IpcErrorCode E_PERMISSION', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        try {
          safeResolve(root, '/etc/passwd')
          throw new Error('should have thrown')
        } catch (err) {
          expect(err).toBeInstanceOf(IpcError)
          expect((err as IpcError).code).toBe('E_PERMISSION')
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('rejects sibling paths that look like the grove prefix without separator', () => {
      // /tmp/grove-abc must NOT accept /tmp/grove-abc-evil
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        const evil = root + '-evil' + sep + 'x.md'
        expect(() => safeResolve(root, evil)).toThrow(/E_PERMISSION|escapes/i)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })
})
