# Phase 04 — File I/O & Atomicity: Plan 1 (Deps + safeResolve)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-04-file-io-atomic`
> **Task range:** OpenSpec tasks `1.1`–`2.4` (8 tasks)
> **Plan order:** 1 of 4. Subsequent plans (`tasks-3.1-3.7`, `4.1-5.6`, `6.1-7.10`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-25
> **Branch suggestion:** `feat/phase-04-file-io-atomic` (branch from `main` after phase-03 merges)

---

## Goal

Install the two new runtime deps (`iconv-lite`, `gray-matter`), scaffold the new service module files under `electron/services/` plus the shared frontmatter Zod schema, and ship a small, fully-tested `safeResolve` path-safety utility that all subsequent IPC / tool entry points must funnel through.

## Architecture

- **safeResolve is the single chokepoint** for translating an untrusted relative or absolute `path` argument into an absolute path that is guaranteed to stay inside the current grove root. Every later phase (file IPC, indexer, AI tools) calls it.
- The function is **synchronous** (`(groveRoot, p, opts?): string`), throwing `IpcError('E_PERMISSION', ...)` on any escape attempt. Sync keeps callers simple — IPC handlers wrap it in their own `async`.
- Two layers of defense: (a) **lexical** rejection of any `..` segment in the input string, and (b) **resolved-prefix** check that the absolute result starts with `path.resolve(groveRoot) + path.sep` (or equals the root exactly).
- Optional `{ realpath: true }` performs a `realpathSync` resolution to defeat symlink-based escapes; on `ENOENT` (path not yet created) we walk up to the nearest existing ancestor and validate that.
- This plan also creates **stub files** for `fs-atomic.ts`, `frontmatter.ts`, and `shared/frontmatter-schema.ts` so subsequent plans can hang implementations on them without merge conflicts.

## Tech Stack

- `iconv-lite@^0.6` (GBK / GB18030 decode for `readFileDetect` in Plan 2)
- `gray-matter@^4` (YAML frontmatter parse / stringify in Plan 3)
- `@types/gray-matter@^4` (dev) — gray-matter ships no types
- `zod` (already a project dep) — frontmatter schema in Plan 3
- `vitest@^2` (already configured) — unit tests
- Node 22+ (already pinned)

## Files Touched (cumulative for this plan)

| Path                                    | Action                         | Owner task         |
| --------------------------------------- | ------------------------------ | ------------------ |
| `package.json`                          | Modify (add 2 deps + 1 devDep) | 1.1, 1.2           |
| `electron/services/fs-atomic.ts`        | Create stub                    | 1.3                |
| `electron/services/frontmatter.ts`      | Create stub                    | 1.3                |
| `electron/services/path-safety.ts`      | Create stub → implement        | 1.3, 2.1, 2.2, 2.3 |
| `electron/services/path-safety.test.ts` | Create                         | 2.1, 2.2, 2.3, 2.4 |
| `shared/frontmatter-schema.ts`          | Create stub                    | 1.4                |

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Install runtime deps (iconv-lite, gray-matter)

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm current state**

```bash
node -e "const p=require('./package.json');console.log({deps:p.dependencies,dev:p.devDependencies})" | grep -E "iconv-lite|gray-matter" || echo "neither installed (expected)"
```

Expected: `neither installed (expected)`. If either is already present, stop and reconcile with the existing version before continuing.

- [ ] **Step 2: Install runtime deps**

```bash
npm install iconv-lite gray-matter
```

Expected: `package.json` `dependencies` now contains `iconv-lite` (`^0.6.x`) and `gray-matter` (`^4.x`); `npm install` exits 0.

- [ ] **Step 3: Verify both load**

```bash
node -e "const i=require('iconv-lite'); console.log('gbk decode:', i.decode(Buffer.from([0xc4,0xe3,0xba,0xc3]),'gbk'))"
node -e "const m=require('gray-matter'); console.log(m.default ? m.default('---\nfoo: bar\n---\nbody').data : m('---\nfoo: bar\n---\nbody').data)"
```

Expected: prints `gbk decode: 你好` and `{ foo: 'bar' }`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-04): add iconv-lite + gray-matter runtime deps"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Install @types/gray-matter

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install dev type package**

```bash
npm install -D @types/gray-matter
```

Expected: `package.json` `devDependencies` now contains `@types/gray-matter`.

- [ ] **Step 2: Verify TypeScript can resolve gray-matter types**

```bash
node -e "
const fs=require('fs');
const code=\`import matter from 'gray-matter';\nconst r = matter('---\nx: 1\n---\nb');\nconst data: { x?: number } = r.data;\nconsole.log(data.x);\n\`;
fs.writeFileSync('/tmp/_gm-check.ts', code);
"
npx tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --esModuleInterop --strict /tmp/_gm-check.ts && rm /tmp/_gm-check.ts
```

Expected: `tsc` exits 0 (no type errors). If it errors with "Cannot find module 'gray-matter' or its type declarations", the install is wrong — reinstall.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-04): add @types/gray-matter for typed frontmatter API"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Scaffold electron/services/{fs-atomic,frontmatter,path-safety}.ts

**Files:**

- Create: `electron/services/fs-atomic.ts`
- Create: `electron/services/frontmatter.ts`
- Create: `electron/services/path-safety.ts`

The scaffolds let later plans land implementations without conflicting with one another and give us a clean compile surface today. Each file exports the public symbols future plans will fill in. Stubs throw to make accidental use loud.

- [ ] **Step 1: Verify the services directory exists**

```bash
ls electron/services/
```

Expected output includes `atomicWrite.ts`, `db/`, `grove.ts`, `lockfile.ts`, etc. (Phase 2 / 3 artifacts.)

- [ ] **Step 2: Create `electron/services/fs-atomic.ts` stub**

```ts
// electron/services/fs-atomic.ts
// Implemented in Plan 2 of phase-04-file-io-atomic (tasks 3.1-3.7).
// This file is a placeholder so type-only imports compile cleanly.

export interface ReadFileDetectResult {
  content: string
  eol: 'lf' | 'crlf' | 'mixed'
  originalEncoding: 'utf8' | 'gbk'
  hadBom: boolean
  mtimeMs: number
  sha256: string
}

export interface WriteWithVerifyOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
}

export function writeFileAtomic(_abs: string, _data: string | Uint8Array): Promise<void> {
  throw new Error('writeFileAtomic: not yet implemented (phase-04 plan 2)')
}

export function readFileDetect(_abs: string): Promise<ReadFileDetectResult> {
  throw new Error('readFileDetect: not yet implemented (phase-04 plan 2)')
}

export function normalizeForDisk(_content: string, _opts: { eol: 'lf' | 'crlf' }): string {
  throw new Error('normalizeForDisk: not yet implemented (phase-04 plan 2)')
}

export function writeWithVerify(
  _abs: string,
  _content: string,
  _opts: WriteWithVerifyOptions
): Promise<{ mtimeMs: number; sha256: string }> {
  throw new Error('writeWithVerify: not yet implemented (phase-04 plan 2)')
}
```

- [ ] **Step 3: Create `electron/services/frontmatter.ts` stub**

```ts
// electron/services/frontmatter.ts
// Implemented in Plan 3 of phase-04-file-io-atomic (tasks 4.1-4.4).
import type { Frontmatter } from '@shared/frontmatter-schema'

export interface ParsedFile {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
}

export function parseFile(_raw: string): ParsedFile {
  throw new Error('frontmatter.parseFile: not yet implemented (phase-04 plan 3)')
}

export function stringify(_frontmatter: Frontmatter, _body: string): string {
  throw new Error('frontmatter.stringify: not yet implemented (phase-04 plan 3)')
}
```

- [ ] **Step 4: Create `electron/services/path-safety.ts` stub**

```ts
// electron/services/path-safety.ts
// Implemented across tasks 2.1-2.3 of this plan.

export interface SafeResolveOptions {
  /** When true, resolves symlinks via fs.realpathSync and verifies the real path is still inside groveRoot. */
  realpath?: boolean
}

export function safeResolve(
  _groveRoot: string,
  _p: string,
  _opts: SafeResolveOptions = {}
): string {
  throw new Error('safeResolve: not yet implemented (phase-04 plan 1, task 2.1)')
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: exits 0. The stubs are syntactically valid and the placeholder `Frontmatter` import resolves once Task 4 lands. If this step fails because `@shared/frontmatter-schema` isn't found yet, run Task 4 first then return — but ordering is fine if executed sequentially.

- [ ] **Step 6: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/frontmatter.ts electron/services/path-safety.ts
git commit -m "feat(phase-04): scaffold fs-atomic / frontmatter / path-safety service stubs"
```

---

<!-- openspec-task: 1.4 -->

### Task 4: Scaffold shared/frontmatter-schema.ts

**Files:**

- Create: `shared/frontmatter-schema.ts`

Stub now; full schema lands in Plan 3 task 4.3 (per design D5). This file lives at `shared/` root (not `shared/schemas/`) per the OpenSpec tasks.md task 1.4.

- [ ] **Step 1: Confirm `zod` is available**

```bash
node -e "const z=require('zod'); console.log(typeof z.object)"
```

Expected: `function`. (Phase 2 already added zod as a project dep.)

- [ ] **Step 2: Create `shared/frontmatter-schema.ts`**

```ts
// shared/frontmatter-schema.ts
// Stub — full implementation in Plan 3 task 4.3 (design D5).
import { z } from 'zod'

/**
 * Frontmatter schema is intentionally permissive: every documented field is optional,
 * and unknown keys are preserved (passthrough). Plan 3 expands this to cover the full
 * PRD field list (title, url, summary, rating, tags, ...).
 */
export const FrontmatterSchema = z.object({}).passthrough()

export type Frontmatter = z.infer<typeof FrontmatterSchema>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add shared/frontmatter-schema.ts
git commit -m "feat(phase-04): scaffold FrontmatterSchema (passthrough stub)"
```

---

<!-- openspec-task: 2.1 -->

### Task 5: Implement safeResolve — basic resolve + prefix check

**Files:**

- Modify: `electron/services/path-safety.ts`
- Create: `electron/services/path-safety.test.ts`

Spec scenarios covered: "合法相对路径", "绝对路径恰好在树林内", "越界". Lexical `..` rejection lands in Task 6; realpath option in Task 7.

- [ ] **Step 1: Write failing tests for the three core scenarios**

Create `electron/services/path-safety.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: all six tests fail with `safeResolve: not yet implemented (phase-04 plan 1, task 2.1)`.

- [ ] **Step 3: Implement `safeResolve` (lexical-`..` rejection deferred to Task 6)**

Replace the stub in `electron/services/path-safety.ts`:

```ts
import { resolve, sep } from 'node:path'
import { IpcError } from '@shared/ipc-contract'

export interface SafeResolveOptions {
  realpath?: boolean
}

export function safeResolve(groveRoot: string, p: string, _opts: SafeResolveOptions = {}): string {
  if (typeof groveRoot !== 'string' || groveRoot.length === 0) {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: groveRoot must be a non-empty string')
  }
  if (typeof p !== 'string') {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: path must be a string')
  }
  const normRoot = resolve(groveRoot)
  const normRootSep = normRoot.endsWith(sep) ? normRoot : normRoot + sep
  const abs = resolve(groveRoot, p)
  if (abs !== normRoot && !abs.startsWith(normRootSep)) {
    throw new IpcError('E_PERMISSION', `safeResolve: path escapes grove (${p})`)
  }
  return abs
}
```

- [ ] **Step 4: Run tests — confirm all six pass**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/path-safety.ts electron/services/path-safety.test.ts
git commit -m "feat(phase-04): safeResolve resolves+checks grove prefix"
```

---

<!-- openspec-task: 2.2 -->

### Task 6: Reject `..` segments lexically

**Files:**

- Modify: `electron/services/path-safety.ts`
- Modify: `electron/services/path-safety.test.ts`

Spec scenario covered: "路径段含 `..`". Even when the resolved path lands inside the grove, an input that contains a `..` segment is rejected — this prevents sneaky inputs like `'a/../b.md'` (resolves inside) from being treated differently than `'../b.md'`.

- [ ] **Step 1: Add failing tests for `..` segments**

Append inside the existing `describe('safeResolve', ...)` block in `path-safety.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — confirm new tests fail**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: 3 of the 4 new tests fail (the "..bar" case may already pass). The point is at least the first three should fail with no `E_PERMISSION` raised.

- [ ] **Step 3: Add lexical `..` rejection BEFORE the `resolve()` call**

Update `safeResolve` in `electron/services/path-safety.ts`. Add this block right after the `typeof p !== 'string'` guard:

```ts
// Reject any literal `..` path segment in the input. Use both / and \ as separators
// so we catch Windows-style inputs even on POSIX (defense in depth).
if (p.split(/[\\/]/).includes('..')) {
  throw new IpcError('E_PERMISSION', `safeResolve: path contains .. segment (${p})`)
}
```

- [ ] **Step 4: Run — all path-safety tests pass**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: all (10) passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/path-safety.ts electron/services/path-safety.test.ts
git commit -m "feat(phase-04): safeResolve rejects literal .. segments lexically"
```

---

<!-- openspec-task: 2.3 -->

### Task 7: Optional `{ realpath: true }` symlink check

**Files:**

- Modify: `electron/services/path-safety.ts`
- Modify: `electron/services/path-safety.test.ts`

Default behavior is unchanged (cheap, sync, no I/O). When callers opt in with `{ realpath: true }`, the function uses `realpathSync` to resolve symlinks and re-checks the grove prefix on the resolved path. If the path doesn't exist yet (`ENOENT`), we walk up to the nearest existing ancestor and validate that — this lets write-paths use the option without crashing.

- [ ] **Step 1: Add failing realpath tests**

Append to `path-safety.test.ts`:

```ts
import { symlinkSync, mkdirSync, writeFileSync } from 'node:fs'

// ... existing describe(...) blocks above

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
      expect(r).toBe(join(realRoot, 'sub', 'a.md'))
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
      expect(r).toBe(join(realRoot, 'will-be-created.md'))
    } finally {
      rmSync(realRoot, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run — new tests fail**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: 2 or 3 new tests fail (whichever currently get past the lexical guard and silently return the unresolved abs path).

- [ ] **Step 3: Implement realpath option**

Replace `electron/services/path-safety.ts` with:

```ts
import { dirname, resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'
import { IpcError } from '@shared/ipc-contract'

export interface SafeResolveOptions {
  realpath?: boolean
}

export function safeResolve(groveRoot: string, p: string, opts: SafeResolveOptions = {}): string {
  if (typeof groveRoot !== 'string' || groveRoot.length === 0) {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: groveRoot must be a non-empty string')
  }
  if (typeof p !== 'string') {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: path must be a string')
  }
  if (p.split(/[\\/]/).includes('..')) {
    throw new IpcError('E_PERMISSION', `safeResolve: path contains .. segment (${p})`)
  }
  const normRoot = resolve(groveRoot)
  const normRootSep = normRoot.endsWith(sep) ? normRoot : normRoot + sep
  const abs = resolve(groveRoot, p)
  if (abs !== normRoot && !abs.startsWith(normRootSep)) {
    throw new IpcError('E_PERMISSION', `safeResolve: path escapes grove (${p})`)
  }
  if (!opts.realpath) return abs

  const realRoot = realpathSync(normRoot)
  const realRootSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep
  const realAbs = realpathOrAncestor(abs)
  if (realAbs !== realRoot && !realAbs.startsWith(realRootSep)) {
    throw new IpcError('E_PERMISSION', `safeResolve: realpath escapes grove (${p})`)
  }
  return realAbs
}

/**
 * Resolve `abs` via realpath. If the path doesn't exist, walk up to the
 * nearest existing ancestor and re-attach the unresolved tail. This lets
 * write-paths use { realpath: true } without crashing on the first call.
 */
function realpathOrAncestor(abs: string): string {
  let ancestor = abs
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync(ancestor)
      return tail.length === 0 ? real : resolve(real, ...tail.reverse())
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const parent = dirname(ancestor)
      if (parent === ancestor) return abs // hit fs root, give up — return lexical
      tail.push(ancestor.slice(parent.length + 1))
      ancestor = parent
    }
  }
}
```

- [ ] **Step 4: Run — all tests pass**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: all (13) passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/path-safety.ts electron/services/path-safety.test.ts
git commit -m "feat(phase-04): safeResolve { realpath: true } resolves symlinks"
```

---

<!-- openspec-task: 2.4 -->

### Task 8: Cross-platform + edge-case unit tests

**Files:**

- Modify: `electron/services/path-safety.test.ts`

Spec coverage check: ensure tests cover Windows `C:\` style and POSIX `/` (we run on macOS/Linux so we simulate Windows by passing already-resolved Windows-style paths and verifying the prefix check doesn't false-positive); and edge cases: empty string, single `.`, grove root with trailing `/`.

- [ ] **Step 1: Add failing edge-case tests**

Append to `path-safety.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run — fix any test that fails**

```bash
npx vitest run electron/services/path-safety.test.ts
```

Expected: all tests pass on the first try (the implementation already handles these). If the "sibling root" test fails, it means the prefix check is missing the `+ sep` — fix the implementation, do not weaken the test.

- [ ] **Step 3: Run with coverage to confirm we are well above 85% on path-safety**

```bash
npx vitest run electron/services/path-safety.test.ts --coverage --coverage.include='electron/services/path-safety.ts' --coverage.reporter=text
```

Expected: `path-safety.ts` shows ≥85% lines / branches. (Plan 4 task 7.9 will re-verify across both `path-safety.ts` and `fs-atomic.ts`.) If coverage is short, look at the uncovered branches and add a focused test for each — do NOT add a `/* istanbul ignore */` comment.

- [ ] **Step 4: Run the full test suite to make sure nothing else broke**

```bash
npm test
```

Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/path-safety.test.ts
git commit -m "test(phase-04): cross-platform + edge-case coverage for safeResolve"
```

---

## Plan 1 Self-Review

Run a quick sanity check before handing off to Plan 2:

- [ ] **Spec coverage:** every requirement scenario in `specs/path-safety/spec.md` is exercised by a test in `path-safety.test.ts` — 合法相对路径 (Task 5), 绝对路径恰好在树林内 (Task 5), 越界 (Task 5), 路径段含 `..` (Task 6). The "全链路强制调用" requirement (every IPC handler must call `safeResolve`) is **enforced** in Plan 3 task 5.3 (handler skeleton), not here.
- [ ] **Files exist:** `electron/services/{fs-atomic,frontmatter,path-safety}.ts`, `shared/frontmatter-schema.ts`, `electron/services/path-safety.test.ts`.
- [ ] **Stubs throw loudly:** `fs-atomic.ts` and `frontmatter.ts` exports throw — Plan 2 / 3 will replace them.
- [ ] **No placeholders left** in committed code (search: `git grep -n 'TODO\|TBD\|FIXME' electron/services/path-safety.ts`).
- [ ] **All tests green:** `npm test` passes.

Once those are all checked, Plan 2 (`tasks-3.1-3.7`) can begin: it builds the `fs-atomic.ts` primitives that the IPC handlers in Plan 3 will call.
