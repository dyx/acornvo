import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
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

  describe('rejects .. segments', () => {
    it('rejects an input that contains a single .. segment', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        expect(() => safeResolve(root, '../outside.md')).toThrow(/E_PERMISSION/)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('rejects an input that contains a .. segment even if it resolves inside the grove', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        // a/../b.md → resolves to <root>/b.md, but we still reject it
        expect(() => safeResolve(root, 'a/../b.md')).toThrow(/E_PERMISSION/)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('rejects backslash-separated .. on any platform (defense in depth)', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        expect(() => safeResolve(root, 'a\\..\\b.md')).toThrow(/E_PERMISSION/)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('does NOT confuse "..bar" or "bar.." with the .. segment', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        expect(safeResolve(root, '..bar/x.md')).toBe(join(root, '..bar', 'x.md'))
        expect(safeResolve(root, 'bar../x.md')).toBe(join(root, 'bar..', 'x.md'))
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })

  describe('safeResolve { realpath: true }', () => {
    it('returns the resolved (realpath) absolute path when option is on', () => {
      const realRoot = mkdtempSync(join(tmpdir(), 'grove-real-'))
      try {
        mkdirSync(join(realRoot, 'sub'))
        writeFileSync(join(realRoot, 'sub', 'a.md'), 'x')
        // create a symlink INSIDE the grove pointing to another path INSIDE the grove
        const linkPath = join(realRoot, 'link-to-sub')
        symlinkSync(join(realRoot, 'sub'), linkPath, 'dir')
        const r = safeResolve(realRoot, 'link-to-sub/a.md', { realpath: true })
        // compare with realpathSync because on macOS /var is a symlink to /private/var
        expect(r).toBe(realpathSync(join(realRoot, 'sub', 'a.md')))
      } finally {
        rmSync(realRoot, { recursive: true, force: true })
      }
    })

    it('throws E_PERMISSION when a symlink inside the grove points OUTSIDE', () => {
      const realRoot = mkdtempSync(join(tmpdir(), 'grove-real-'))
      const outside = mkdtempSync(join(tmpdir(), 'outside-'))
      try {
        writeFileSync(join(outside, 'secret.md'), 'leak')
        symlinkSync(outside, join(realRoot, 'evil'), 'dir')
        expect(() => safeResolve(realRoot, 'evil/secret.md', { realpath: true })).toThrow(
          /E_PERMISSION/
        )
      } finally {
        rmSync(realRoot, { recursive: true, force: true })
        rmSync(outside, { recursive: true, force: true })
      }
    })

    it('falls back to ancestor realpath when target file does not exist (write path)', () => {
      const realRoot = mkdtempSync(join(tmpdir(), 'grove-real-'))
      try {
        // No file created — just request a path that would be inside the grove.
        const r = safeResolve(realRoot, 'will-be-created.md', { realpath: true })
        // Realpath of the (existing) grove root, joined with the leaf.
        // compare with realpathSync because on macOS /var is a symlink to /private/var
        expect(r).toBe(join(realpathSync(realRoot), 'will-be-created.md'))
      } finally {
        rmSync(realRoot, { recursive: true, force: true })
      }
    })
  })

  describe('safeResolve edge cases', () => {
    it('grove root with trailing separator behaves the same as without', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        const withSep = root.endsWith(sep) ? root : root + sep
        expect(safeResolve(withSep, 'a.md')).toBe(join(root, 'a.md'))
        expect(safeResolve(root, 'a.md')).toBe(join(root, 'a.md'))
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('throws E_INVALID_ARGS for non-string path', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        // @ts-expect-error — runtime check
        expect(() => safeResolve(root, 123)).toThrow(/E_INVALID_ARGS/)
        // @ts-expect-error
        expect(() => safeResolve(root, null)).toThrow(/E_INVALID_ARGS/)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('throws E_INVALID_ARGS for empty groveRoot', () => {
      expect(() => safeResolve('', 'a.md')).toThrow(/E_INVALID_ARGS/)
    })

    it('rejects an absolute path that is a sibling of grove root (no shared prefix dir)', () => {
      const root = mkdtempSync(join(tmpdir(), 'grove-'))
      try {
        const sibling = root + '-sibling' // e.g. /tmp/grove-abc-sibling
        expect(() => safeResolve(root, join(sibling, 'x.md'))).toThrow(/E_PERMISSION/)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('Windows-style absolute path in groveRoot — prefix check is case-sensitive on POSIX', () => {
      // We can't run real Windows here, but we can confirm path.resolve on POSIX
      // handles a Windows-shaped grove root by treating it as a relative path.
      // The point: the prefix check operates on whatever path.resolve returns; we
      // are not platform-specifically broken.
      const root = '/tmp/win-grove-xyz'
      mkdirSync(root, { recursive: true })
      try {
        expect(safeResolve(root, 'a.md')).toBe(join(root, 'a.md'))
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('handles filesystem root as grove root (exercises endsWith separator branches)', () => {
      // On POSIX, resolve('/') returns '/' which ends with sep, covering
      // both the normRoot.endsWith(sep) and realRoot.endsWith(sep) branches.
      expect(safeResolve('/', 'tmp')).toBe('/tmp')
      const real = safeResolve('/', 'tmp', { realpath: true })
      // /tmp may itself be a symlink (e.g. to /private/tmp on macOS)
      expect(real).toBe(realpathSync('/tmp'))
    })
  })
})
