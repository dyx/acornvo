# Phase 04 — File I/O & Atomicity: Plan 3 (Frontmatter codec + File IPC)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-04-file-io-atomic`
> **Task range:** OpenSpec tasks `4.1`–`5.6` (10 tasks)
> **Plan order:** 3 of 4. Depends on Plans 1 + 2; Plan 4 depends on this one.
> **Status:** Not started
> **Created:** 2026-04-25
> **Branch suggestion:** Continue on `feat/phase-04-file-io-atomic`.

---

## Goal

Wrap `gray-matter` + the Plan 1 Zod schema into a `frontmatter` codec, expand `FrontmatterSchema` to cover the full PRD field list, and expose the entire phase-04 surface — `read / readParsed / write / writeParsed / stat / exists / list / rename` — via a new `file` IPC namespace whose handlers all funnel through `safeResolve` + the current grove root.

## Architecture

- **Frontmatter codec** (`electron/services/frontmatter.ts`):
  - `parseFile(raw)` → `gray-matter` extracts `{ data, content, matter }`. We hand `data` to `FrontmatterSchema.parse(...)` (passthrough) — known fields get type checks (rating bounds, ISO datetimes, etc.); unknown keys ride along untouched.
  - `stringify(frontmatter, body)` → if `frontmatter` is an empty object, return `body` as-is (no `---` wrapper); otherwise `matter.stringify(body, frontmatter)`.
  - The codec is **pure**: no I/O, no globals. The IPC handler does the I/O.
- **Schema** (`shared/frontmatter-schema.ts`) implements design D5 verbatim — every documented field optional, top-level `.passthrough()`, `rating` is `int().min(1).max(5)`.
- **File IPC** (`electron/ipc/file.ts`):
  - Every handler starts the same way: `const root = requireGroveRoot()` → `const abs = safeResolve(root, rel)` → operate. This single template makes the "全链路强制调用" requirement (path-safety spec) easy to grep.
  - `requireGroveRoot()` calls `groveService.getCurrent()` and throws `IpcError('E_NOT_FOUND', 'no grove open')` when null.
  - `read` returns the decoded UTF-8 content + metadata via `readFileDetect`.
  - `readParsed` is `read` + `frontmatter.parseFile(content)`.
  - `write` is `writeWithVerify` (handles atomic + verify + mtime preflight).
  - `writeParsed` = `frontmatter.stringify` → `writeWithVerify`.
  - `list(dirRel, { recursive, includeHidden })` is a self-implemented walker that uses `fs.lstat` (so symlinks show as `isSymbolicLink` and we *skip* them entirely — neither include nor follow).
  - `rename(oldRel, newRel)` `safeResolve`s both sides and runs `fs.rename`.
- **Wiring**: `electron/ipc/handlers.ts` adds one new line: `file: fileHandlers`.

## Tech Stack

- `gray-matter@^4` (Plan 1)
- `zod` (already a dep)
- `node:fs/promises` (lstat / readdir / rename / stat / access)
- `node:path` (relative / join / dirname)

## Files Touched (cumulative for this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/services/frontmatter.ts` | Replace stubs with full impl | 4.1, 4.2, 5.6 |
| `electron/services/frontmatter.test.ts` | Create | 4.1, 4.2, 4.4 |
| `shared/frontmatter-schema.ts` | Replace stub with full schema | 4.3 |
| `shared/frontmatter-schema.test.ts` | Create | 4.3, 4.4 |
| `shared/ipc-contract.ts` | Modify (add `file` namespace + verify error codes) | 5.1, 5.2 |
| `electron/ipc/file.ts` | Create | 5.3, 5.4, 5.5, 5.6 |
| `electron/ipc/file.test.ts` | Create | 5.3, 5.4, 5.5, 5.6 |
| `electron/ipc/handlers.ts` | Modify (register `file` namespace) | 5.3 |

---

## Tasks

<!-- openspec-task: 4.1 -->
### Task 1: `frontmatter.parseFile`

**Files:**
- Modify: `electron/services/frontmatter.ts`
- Create: `electron/services/frontmatter.test.ts`

This task uses the **stub** `FrontmatterSchema` from Plan 1 (which is `z.object({}).passthrough()`). Task 3 (4.3) replaces the stub with the full schema, at which point parseFile gets stricter type checking "for free". Tests for known-field validation live in Task 3 / Task 4.

- [ ] **Step 1: Failing tests for the basic parse contract**

Create `electron/services/frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseFile } from './frontmatter'

describe('frontmatter.parseFile', () => {
  it('extracts frontmatter, body, and rawYaml from a wrapped md', () => {
    const raw = '---\ntitle: hi\nrating: 4\n---\n\n# Body\n\ncontent here.\n'
    const r = parseFile(raw)
    expect(r.frontmatter).toMatchObject({ title: 'hi', rating: 4 })
    expect(r.body).toBe('\n# Body\n\ncontent here.\n')
    expect(r.rawYaml).toContain('title: hi')
  })

  it('returns empty frontmatter and full input as body when no fence is present', () => {
    const raw = '# just a body\n\nno frontmatter\n'
    const r = parseFile(raw)
    expect(r.frontmatter).toEqual({})
    expect(r.body).toBe(raw)
    expect(r.rawYaml).toBe('')
  })

  it('preserves unknown fields via passthrough', () => {
    const raw = '---\ncustom_key: some_value\n---\nbody\n'
    const r = parseFile(raw)
    expect(r.frontmatter).toMatchObject({ custom_key: 'some_value' })
  })
})
```

- [ ] **Step 2: Run — fail (`parseFile not yet implemented`)**

```bash
npx vitest run electron/services/frontmatter.test.ts
```

Expected: 3 failed.

- [ ] **Step 3: Implement parseFile**

Update `electron/services/frontmatter.ts`:

```ts
import matter from 'gray-matter'
import { FrontmatterSchema, type Frontmatter } from '@shared/frontmatter-schema'

export interface ParsedFile {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
}

export function parseFile(raw: string): ParsedFile {
  const m = matter(raw)
  // m.data: parsed YAML object, m.content: body, m.matter: raw YAML string (between ---)
  const frontmatter = FrontmatterSchema.parse(m.data ?? {})
  return {
    frontmatter,
    body: m.content,
    rawYaml: m.matter ?? ''
  }
}

// Keep the throwing stub for stringify until Task 2.
export function stringify(_frontmatter: Frontmatter, _body: string): string {
  throw new Error('frontmatter.stringify: not yet implemented (phase-04 plan 3 task 2)')
}
```

Note: `gray-matter` exports a default function; `import matter from 'gray-matter'` is correct under our `esModuleInterop`. If TS complains, fall back to `import * as matter from 'gray-matter'` and call `matter.default(raw)`.

- [ ] **Step 4: Run — pass**

```bash
npx vitest run electron/services/frontmatter.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/frontmatter.ts electron/services/frontmatter.test.ts
git commit -m "feat(phase-04): frontmatter.parseFile (gray-matter + Zod passthrough)"
```

---

<!-- openspec-task: 4.2 -->
### Task 2: `frontmatter.stringify`

**Files:**
- Modify: `electron/services/frontmatter.ts`
- Modify: `electron/services/frontmatter.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `frontmatter.test.ts`:

```ts
import { stringify, parseFile } from './frontmatter'

describe('frontmatter.stringify', () => {
  it('emits a fenced frontmatter block when frontmatter is non-empty', () => {
    const out = stringify({ title: 'hi' } as never, '# Body\n')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toMatch(/title:\s*hi/)
    expect(out).toMatch(/---\n+# Body/)
  })

  it('returns body unchanged when frontmatter is empty', () => {
    const body = 'plain body, no frontmatter\n'
    expect(stringify({} as never, body)).toBe(body)
  })

  it('round-trips: parseFile(stringify(...)) preserves data', () => {
    const fm = { title: 'hi', tags: ['a', 'b'], rating: 3 }
    const body = '\n# Body\n'
    const round = parseFile(stringify(fm as never, body))
    expect(round.frontmatter).toMatchObject(fm)
    expect(round.body.trim()).toBe('# Body')
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
npx vitest run electron/services/frontmatter.test.ts -t "stringify"
```

Expected: 3 failed.

- [ ] **Step 3: Implement stringify**

Replace the stub in `electron/services/frontmatter.ts`:

```ts
export function stringify(frontmatter: Frontmatter, body: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body
  }
  // gray-matter's stringify takes (content, data) and returns a fenced string.
  return matter.stringify(body, frontmatter as Record<string, unknown>)
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run electron/services/frontmatter.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/frontmatter.ts electron/services/frontmatter.test.ts
git commit -m "feat(phase-04): frontmatter.stringify (skips wrapper for empty fm)"
```

---

<!-- openspec-task: 4.3 -->
### Task 3: Full FrontmatterSchema (design D5)

**Files:**
- Modify: `shared/frontmatter-schema.ts`
- Create: `shared/frontmatter-schema.test.ts`

Implements the schema verbatim from design D5 — every field optional, top-level `.passthrough()`, `rating` is `int().min(1).max(5)`. After this lands, `parseFile` (Task 1) automatically gets per-field type checking, and Task 4 covers the rating-out-of-range scenario explicitly.

- [ ] **Step 1: Failing schema-level tests**

Create `shared/frontmatter-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FrontmatterSchema } from './frontmatter-schema'

describe('FrontmatterSchema', () => {
  it('accepts an empty object', () => {
    expect(FrontmatterSchema.parse({})).toEqual({})
  })

  it('accepts the full PRD field list with valid values', () => {
    const full = {
      title: 'hi',
      url: 'https://example.com/a',
      site: 'example.com',
      author: 'me',
      published_at: '2025-01-01',
      clipped_at: '2025-01-02T03:04:05.000Z',
      source_type: 'article' as const,
      summary: 'tl;dr',
      highlights: ['quote a', 'quote b'],
      rating: 4,
      category: 'tech',
      tags: ['x', 'y'],
      reviewed_at: '2025-01-03T00:00:00.000Z',
      reviewed_model: 'claude-opus-4-7',
      reviewed_version: 1,
      reviewed_error: undefined,
      sync_warning: undefined
    }
    const r = FrontmatterSchema.parse(full)
    expect(r.title).toBe('hi')
    expect(r.rating).toBe(4)
    expect(r.tags).toEqual(['x', 'y'])
  })

  it('rejects rating out of range', () => {
    expect(() => FrontmatterSchema.parse({ rating: 6 })).toThrow(/1.*5|5.*1|range|less|greater/i)
    expect(() => FrontmatterSchema.parse({ rating: 0 })).toThrow()
  })

  it('rejects non-integer rating', () => {
    expect(() => FrontmatterSchema.parse({ rating: 3.5 })).toThrow(/integer|int/i)
  })

  it('rejects non-URL `url`', () => {
    expect(() => FrontmatterSchema.parse({ url: 'not a url' })).toThrow()
  })

  it('preserves unknown keys (passthrough)', () => {
    const r = FrontmatterSchema.parse({ title: 'hi', custom_key: 'hello' })
    expect((r as { custom_key?: string }).custom_key).toBe('hello')
  })

  it('rejects an invalid source_type enum value', () => {
    expect(() => FrontmatterSchema.parse({ source_type: 'whatever' })).toThrow()
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
npx vitest run shared/frontmatter-schema.test.ts
```

Expected: most tests fail (the stub passes literally everything).

- [ ] **Step 3: Implement the full schema**

Replace `shared/frontmatter-schema.ts`:

```ts
import { z } from 'zod'

/**
 * Frontmatter schema — design D5 of phase-04-file-io-atomic.
 *
 * Every documented field is optional so old files can lack any subset; unknown
 * keys are preserved (.passthrough). New optional fields can be added here without
 * breaking already-stored files.
 */
export const FrontmatterSchema = z
  .object({
    // 拾果 (clip) phase
    title: z.string().optional(),
    url: z.string().url().optional(),
    site: z.string().optional(),
    author: z.string().optional(),
    published_at: z.string().optional(), // permissive: YYYY-MM-DD or ISO
    clipped_at: z.string().datetime().optional(),
    source_type: z.enum(['article', 'rss', 'manual']).optional(),

    // 理果 (review) phase
    summary: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    reviewed_at: z.string().datetime().optional(),
    reviewed_model: z.string().optional(),
    reviewed_version: z.number().int().nonnegative().optional(),
    reviewed_error: z.string().optional(),

    // misc / future
    sync_warning: z.string().optional()
  })
  .passthrough()

export type Frontmatter = z.infer<typeof FrontmatterSchema>
```

- [ ] **Step 4: Run — schema tests pass; frontmatter codec tests still pass**

```bash
npx vitest run shared/frontmatter-schema.test.ts electron/services/frontmatter.test.ts
```

Expected: all green. (Codec tests from Tasks 1-2 should still pass since they only used title / tags / rating which remain valid.)

- [ ] **Step 5: Commit**

```bash
git add shared/frontmatter-schema.ts shared/frontmatter-schema.test.ts
git commit -m "feat(phase-04): full FrontmatterSchema per design D5"
```

---

<!-- openspec-task: 4.4 -->
### Task 4: Codec integration tests (full-field roundtrip + edge cases)

**Files:**
- Modify: `electron/services/frontmatter.test.ts`

Cross-cuts the frontmatter spec scenarios "全字段往返", "未知字段保留", "rating 越界报错", "空 frontmatter 不加包裹块". Some are partly covered by Tasks 1-3; this task fills any gap and adds the explicit roundtrip on the full PRD field set.

- [ ] **Step 1: Append integration tests**

Append to `electron/services/frontmatter.test.ts`:

```ts
describe('frontmatter codec — integration', () => {
  it('roundtrips the full PRD field set without loss', () => {
    const fm = {
      title: 'hi',
      url: 'https://example.com/a',
      site: 'example.com',
      author: 'me',
      published_at: '2025-01-01',
      clipped_at: '2025-01-02T03:04:05.000Z',
      source_type: 'article' as const,
      summary: 'tl;dr',
      highlights: ['quote a', 'quote b'],
      rating: 4,
      category: 'tech',
      tags: ['x', 'y'],
      reviewed_at: '2025-01-03T00:00:00.000Z',
      reviewed_model: 'claude-opus-4-7',
      reviewed_version: 1
    }
    const body = '\n# Body\n\nLorem ipsum.\n'
    const md = stringify(fm as never, body)
    const back = parseFile(md)
    expect(back.frontmatter).toMatchObject(fm)
    expect(back.body.trim()).toBe('# Body\n\nLorem ipsum.'.trim())
  })

  it('parseFile bubbles a Zod error for invalid rating', () => {
    const raw = '---\nrating: 9\n---\nbody\n'
    expect(() => parseFile(raw)).toThrow(/rating|5|less|greater/i)
  })

  it('stringify of empty frontmatter does NOT add wrapper bytes', () => {
    const body = '# just a body\n'
    const out = stringify({} as never, body)
    expect(out).toBe(body)
    expect(out.startsWith('---')).toBe(false)
  })

  it('stringify of a 1-key frontmatter starts with --- and has the key', () => {
    const out = stringify({ title: 'x' } as never, 'body')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toMatch(/^---\n[\s\S]*title:\s*x/)
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/services/frontmatter.test.ts
```

Expected: all pass (the schema work in Task 3 makes the rating-out-of-range case work).

- [ ] **Step 3: Run the whole suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add electron/services/frontmatter.test.ts
git commit -m "test(phase-04): frontmatter codec integration coverage"
```

---

<!-- openspec-task: 5.1 -->
### Task 5: Extend ipc-contract with the `file` namespace

**Files:**
- Modify: `shared/ipc-contract.ts`

This task is **type-only** — no runtime code yet. We declare the surface so handlers and renderer-side typings line up. Plan 4 task 7.x exercises the full chain end-to-end.

- [ ] **Step 1: Read the current contract to find the `IpcContract` type alias**

```bash
grep -n "IpcContract" shared/ipc-contract.ts
```

Expected output: `export type IpcContract = { ... }` plus the per-namespace fields.

- [ ] **Step 2: Add file-namespace types and extend `IpcContract`**

In `shared/ipc-contract.ts`, just above `export type IpcContract`, add:

```ts
import type { Frontmatter } from './frontmatter-schema'

export type EolStyle = 'lf' | 'crlf' | 'mixed'
export type FileEncoding = 'utf8' | 'gbk'

export interface FileReadResult {
  content: string
  eol: EolStyle
  mtimeMs: number
  sha256: string
  hadBom: boolean
  originalEncoding: FileEncoding
}

export interface FileReadParsedResult extends FileReadResult {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
}

export interface FileWriteOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
}

export interface FileWriteResult {
  mtimeMs: number
  sha256: string
}

export interface FileStat {
  size: number
  mtimeMs: number
  ctimeMs: number
  isFile: boolean
  isDirectory: boolean
}

export interface FileListEntry {
  rel: string
  isFile: boolean
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export interface FileListOptions {
  recursive?: boolean
  includeHidden?: boolean
}
```

Then in the `IpcContract` definition, add a new `file` namespace block:

```ts
  file: {
    read: (rel: string) => FileReadResult
    readParsed: (rel: string) => FileReadParsedResult
    write: (rel: string, content: string, opts?: FileWriteOptions) => FileWriteResult
    writeParsed: (
      rel: string,
      frontmatter: Frontmatter,
      body: string,
      opts?: FileWriteOptions
    ) => FileWriteResult
    stat: (rel: string) => FileStat
    exists: (rel: string) => boolean
    list: (dirRel: string, opts?: FileListOptions) => FileListEntry[]
    rename: (oldRel: string, newRel: string) => void
  }
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 0 errors. The existing handler map in `electron/ipc/handlers.ts` will now be incomplete (TS will say `Property 'file' is missing`), so we expect that file to error temporarily — that's fine; Task 7 fixes it.

If TS reports more than the missing `file` field on `ipcHandlers`, fix immediately — likely a typo in the new contract block.

- [ ] **Step 4: Commit**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(phase-04): declare file IPC namespace in shared contract"
```

---

<!-- openspec-task: 5.2 -->
### Task 6: Formalize new IPC error codes

**Files:**
- Modify: `shared/ipc-contract.ts`

Plan 2 already added `'E_ENCODING' | 'E_WRITE_VERIFY' | 'E_MTIME_MISMATCH'` to the `IpcErrorCode` union as their first throw sites landed. This task makes them first-class: a `IPC_ERROR_CODES` constant object so callers can reference them by name without typos, and a tightening `assert` that confirms the union is complete.

- [ ] **Step 1: Confirm Plan 2's union is in place**

```bash
grep -n "E_WRITE_VERIFY\|E_MTIME_MISMATCH\|E_ENCODING" shared/ipc-contract.ts
```

Expected: each code appears in the `IpcErrorCode` union. If any is missing, add it before continuing.

- [ ] **Step 2: Add a frozen constant object next to the union**

In `shared/ipc-contract.ts`, immediately below the `IpcErrorCode` union, add:

```ts
export const IPC_ERROR_CODES = {
  E_INTERNAL: 'E_INTERNAL',
  E_INVALID_ARGS: 'E_INVALID_ARGS',
  E_NOT_FOUND: 'E_NOT_FOUND',
  E_PERMISSION: 'E_PERMISSION',
  E_LOCKED: 'E_LOCKED',
  E_EXISTS: 'E_EXISTS',
  E_TIMEOUT: 'E_TIMEOUT',
  E_ENCODING: 'E_ENCODING',
  E_WRITE_VERIFY: 'E_WRITE_VERIFY',
  E_MTIME_MISMATCH: 'E_MTIME_MISMATCH'
} as const satisfies Record<IpcErrorCode, IpcErrorCode>
```

The `satisfies` clause makes the file fail to type-check if the union ever drifts away from the constant map.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: still 0 errors aside from the (already-known) missing `file` handlers entry.

- [ ] **Step 4: Add a tiny test that confirms each new code is throwable as an IpcError**

Create `shared/ipc-contract.test.ts` (or append if it already exists):

```ts
import { describe, it, expect } from 'vitest'
import { IpcError, IPC_ERROR_CODES } from './ipc-contract'

describe('IPC_ERROR_CODES', () => {
  it('lists exactly all members of IpcErrorCode', () => {
    expect(IPC_ERROR_CODES.E_ENCODING).toBe('E_ENCODING')
    expect(IPC_ERROR_CODES.E_WRITE_VERIFY).toBe('E_WRITE_VERIFY')
    expect(IPC_ERROR_CODES.E_MTIME_MISMATCH).toBe('E_MTIME_MISMATCH')
  })

  it('IpcError accepts each code', () => {
    for (const code of Object.values(IPC_ERROR_CODES)) {
      const err = new IpcError(code, 'test')
      expect(err.code).toBe(code)
    }
  })
})
```

- [ ] **Step 5: Run — pass**

```bash
npx vitest run shared/ipc-contract.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.test.ts
git commit -m "feat(phase-04): IPC_ERROR_CODES constant + completeness check"
```

---

<!-- openspec-task: 5.3 -->
### Task 7: File IPC handler skeleton (`requireGroveRoot` + `safeResolve` template)

**Files:**
- Create: `electron/ipc/file.ts`
- Modify: `electron/ipc/handlers.ts`
- Create: `electron/ipc/file.test.ts`

Implements the basic four: `read`, `write`, `stat`, `exists`. Tasks 8-10 add `list`, `rename`, `writeParsed` (and `readParsed`).

- [ ] **Step 1: Failing tests for the four basics**

Create `electron/ipc/file.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IpcError } from '@shared/ipc-contract'

// We mock the grove service so handlers see whichever grove root we pick per-test.
vi.mock('@/electron/services/grove', () => ({ getCurrent: vi.fn() }))
import * as groveSvc from '../services/grove'
import { fileHandlers } from './file'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

describe('fileHandlers (read/write/stat/exists)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipcfile-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('throws E_NOT_FOUND when no grove is open', async () => {
    setGroveRoot(null)
    await expect(fileHandlers.read('a.md')).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('write then read roundtrips', async () => {
    const r1 = await fileHandlers.write('a.md', '# hi\n', { eol: 'lf' })
    expect(typeof r1.mtimeMs).toBe('number')
    const r2 = await fileHandlers.read('a.md')
    expect(r2.content).toBe('# hi\n')
    expect(r2.eol).toBe('lf')
    expect(r2.hadBom).toBe(false)
  })

  it('write rejects path traversal with E_PERMISSION', async () => {
    await expect(fileHandlers.write('../escape.md', 'x')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('stat reports isFile / size for an existing file', async () => {
    writeFileSync(join(dir, 'a.md'), 'hello')
    const s = await fileHandlers.stat('a.md')
    expect(s.isFile).toBe(true)
    expect(s.isDirectory).toBe(false)
    expect(s.size).toBe(5)
  })

  it('stat throws E_NOT_FOUND for a missing path', async () => {
    await expect(fileHandlers.stat('missing.md')).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('exists returns true / false correctly', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    expect(await fileHandlers.exists('a.md')).toBe(true)
    expect(await fileHandlers.exists('missing.md')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — fail (file.ts doesn't exist yet)**

```bash
npx vitest run electron/ipc/file.test.ts
```

Expected: import resolution error or all tests fail.

- [ ] **Step 3: Implement the skeleton**

Create `electron/ipc/file.ts`:

```ts
import { stat as fsStat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import * as groveSvc from '../services/grove'
import { safeResolve } from '../services/path-safety'
import { readFileDetect, writeWithVerify } from '../services/fs-atomic'
import {
  IpcError,
  type FileListEntry,
  type FileListOptions,
  type FileReadParsedResult,
  type FileReadResult,
  type FileStat,
  type FileWriteOptions,
  type FileWriteResult
} from '@shared/ipc-contract'

function requireGroveRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return grove.path
}

export const fileHandlers = {
  async read(rel: string): Promise<FileReadResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      const r = await readFileDetect(abs)
      return {
        content: r.content,
        eol: r.eol,
        mtimeMs: r.mtimeMs,
        sha256: r.sha256,
        hadBom: r.hadBom,
        originalEncoding: r.originalEncoding
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${rel}: not found`)
      }
      throw err
    }
  },

  async readParsed(_rel: string): Promise<FileReadParsedResult> {
    throw new IpcError('E_INTERNAL', 'readParsed not yet implemented (phase-04 plan 3 task 10)')
  },

  async write(
    rel: string,
    content: string,
    opts: FileWriteOptions = {}
  ): Promise<FileWriteResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    return writeWithVerify(abs, content, opts)
  },

  async writeParsed(
    _rel: string,
    _frontmatter: never,
    _body: string,
    _opts?: FileWriteOptions
  ): Promise<FileWriteResult> {
    throw new IpcError('E_INTERNAL', 'writeParsed not yet implemented (phase-04 plan 3 task 10)')
  },

  async stat(rel: string): Promise<FileStat> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      const s = await fsStat(abs)
      return {
        size: s.size,
        mtimeMs: s.mtimeMs,
        ctimeMs: s.ctimeMs,
        isFile: s.isFile(),
        isDirectory: s.isDirectory()
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${rel}: not found`)
      }
      throw err
    }
  },

  async exists(rel: string): Promise<boolean> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      await access(abs, constants.F_OK)
      return true
    } catch {
      return false
    }
  },

  async list(_dirRel: string, _opts: FileListOptions = {}): Promise<FileListEntry[]> {
    throw new IpcError('E_INTERNAL', 'list not yet implemented (phase-04 plan 3 task 8)')
  },

  async rename(_oldRel: string, _newRel: string): Promise<void> {
    throw new IpcError('E_INTERNAL', 'rename not yet implemented (phase-04 plan 3 task 9)')
  }
}
```

- [ ] **Step 4: Wire `fileHandlers` into the central handler map**

Edit `electron/ipc/handlers.ts`. Add the import:

```ts
import { fileHandlers } from './file'
```

Then add `file: fileHandlers` to the `ipcHandlers` object:

```ts
export const ipcHandlers: HandlerMap = {
  ping: { /* ... existing ... */ },
  log: { /* ... existing ... */ },
  project: projectHandlers,
  file: fileHandlers
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: exits 0.

- [ ] **Step 6: Run — file IPC tests pass**

```bash
npx vitest run electron/ipc/file.test.ts
```

Expected: 6 passed.

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add electron/ipc/file.ts electron/ipc/file.test.ts electron/ipc/handlers.ts
git commit -m "feat(phase-04): file IPC skeleton (read/write/stat/exists) + safeResolve"
```

---

<!-- openspec-task: 5.4 -->
### Task 8: `list` walker (lstat-based, skips symlinks, hidden filter)

**Files:**
- Modify: `electron/ipc/file.ts`
- Modify: `electron/ipc/file.test.ts`

- [ ] **Step 1: Failing tests for the walker**

Append to `electron/ipc/file.test.ts`:

```ts
import { mkdirSync, symlinkSync } from 'node:fs'

describe('fileHandlers.list', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipclist-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('lists top-level files (non-recursive default)', async () => {
    writeFileSync(join(dir, 'a.md'), 'a')
    writeFileSync(join(dir, 'b.md'), 'b')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'c.md'), 'c')
    const r = await fileHandlers.list('.')
    const names = r.map((e) => e.rel).sort()
    expect(names).toEqual(['a.md', 'b.md', 'sub'])
    const sub = r.find((e) => e.rel === 'sub')!
    expect(sub.isDirectory).toBe(true)
  })

  it('descends recursively when { recursive: true }', async () => {
    writeFileSync(join(dir, 'a.md'), 'a')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'b.md'), 'b')
    mkdirSync(join(dir, 'sub', 'deeper'))
    writeFileSync(join(dir, 'sub', 'deeper', 'c.md'), 'c')
    const r = await fileHandlers.list('.', { recursive: true })
    const files = r.filter((e) => e.isFile).map((e) => e.rel).sort()
    expect(files).toEqual(['a.md', join('sub', 'b.md'), join('sub', 'deeper', 'c.md')])
  })

  it('hides dot-prefixed entries by default', async () => {
    writeFileSync(join(dir, 'visible.md'), 'v')
    writeFileSync(join(dir, '.hidden.md'), 'h')
    const r = await fileHandlers.list('.')
    expect(r.map((e) => e.rel)).toEqual(['visible.md'])
  })

  it('includes dot-prefixed entries when { includeHidden: true }', async () => {
    writeFileSync(join(dir, 'visible.md'), 'v')
    writeFileSync(join(dir, '.hidden.md'), 'h')
    const r = await fileHandlers.list('.', { includeHidden: true })
    expect(r.map((e) => e.rel).sort()).toEqual(['.hidden.md', 'visible.md'])
  })

  it('skips symlinks (neither follows nor lists)', async () => {
    writeFileSync(join(dir, 'real.md'), 'r')
    symlinkSync(join(dir, 'real.md'), join(dir, 'link.md'), 'file')
    const r = await fileHandlers.list('.', { recursive: true })
    expect(r.map((e) => e.rel)).toEqual(['real.md'])
  })

  it('rejects a path traversal in dirRel with E_PERMISSION', async () => {
    await expect(fileHandlers.list('../')).rejects.toMatchObject({ code: 'E_PERMISSION' })
  })
})
```

- [ ] **Step 2: Run — fail (`list not yet implemented`)**

```bash
npx vitest run electron/ipc/file.test.ts -t "list"
```

Expected: 6 failed.

- [ ] **Step 3: Implement the walker**

Replace the `list` stub in `electron/ipc/file.ts`. First add imports at the top:

```ts
import { lstat, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
```

Then replace the `list` method:

```ts
  async list(dirRel: string, opts: FileListOptions = {}): Promise<FileListEntry[]> {
    const root = requireGroveRoot()
    const absDir = safeResolve(root, dirRel)
    const recursive = opts.recursive === true
    const includeHidden = opts.includeHidden === true
    const out: FileListEntry[] = []
    await walk(absDir)
    return out

    async function walk(curAbs: string): Promise<void> {
      let entries: string[]
      try {
        entries = await readdir(curAbs)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new IpcError('E_NOT_FOUND', `${dirRel}: not found`)
        }
        throw err
      }
      for (const name of entries) {
        if (!includeHidden && name.startsWith('.')) continue
        const childAbs = join(curAbs, name)
        let st
        try {
          st = await lstat(childAbs)
        } catch (err) {
          // Race with deletion — skip.
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw err
        }
        if (st.isSymbolicLink()) continue // policy: skip symlinks entirely
        const isFile = st.isFile()
        const isDirectory = st.isDirectory()
        const rel = relative(root, childAbs)
        out.push({
          rel,
          isFile,
          isDirectory,
          size: st.size,
          mtimeMs: st.mtimeMs
        })
        if (recursive && isDirectory) await walk(childAbs)
      }
    }
  },
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run electron/ipc/file.test.ts
```

Expected: all (12) tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/file.ts electron/ipc/file.test.ts
git commit -m "feat(phase-04): file.list walker (lstat, skip symlinks, hidden filter)"
```

---

<!-- openspec-task: 5.5 -->
### Task 9: `rename` (both ends safeResolved)

**Files:**
- Modify: `electron/ipc/file.ts`
- Modify: `electron/ipc/file.test.ts`

- [ ] **Step 1: Failing tests**

Append to `electron/ipc/file.test.ts`:

```ts
describe('fileHandlers.rename', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipcrename-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('renames a file inside the grove', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    await fileHandlers.rename('a.md', 'b.md')
    expect(readFileSync(join(dir, 'b.md'), 'utf8')).toBe('x')
    expect(await fileHandlers.exists('a.md')).toBe(false)
  })

  it('cross-directory rename inside grove is allowed; mkdir -p the parent', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    await fileHandlers.rename('a.md', 'sub/deeper/b.md')
    expect(readFileSync(join(dir, 'sub', 'deeper', 'b.md'), 'utf8')).toBe('x')
  })

  it('rejects newRel that escapes the grove with E_PERMISSION; source untouched', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    await expect(fileHandlers.rename('a.md', '../escape.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('x')
  })

  it('rejects oldRel that escapes the grove with E_PERMISSION', async () => {
    await expect(fileHandlers.rename('../outside.md', 'a.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('throws E_NOT_FOUND when oldRel does not exist', async () => {
    await expect(fileHandlers.rename('missing.md', 'b.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
npx vitest run electron/ipc/file.test.ts -t "rename"
```

Expected: 5 failed.

- [ ] **Step 3: Implement rename**

Add to imports in `electron/ipc/file.ts`:

```ts
import { mkdir, rename as fsRename } from 'node:fs/promises'
import { dirname } from 'node:path'
```

Replace the `rename` stub:

```ts
  async rename(oldRel: string, newRel: string): Promise<void> {
    const root = requireGroveRoot()
    const absOld = safeResolve(root, oldRel)
    const absNew = safeResolve(root, newRel)
    await mkdir(dirname(absNew), { recursive: true })
    try {
      await fsRename(absOld, absNew)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${oldRel}: not found`)
      }
      throw err
    }
  },
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run electron/ipc/file.test.ts
```

Expected: all (17) tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/file.ts electron/ipc/file.test.ts
git commit -m "feat(phase-04): file.rename (both sides safeResolved, mkdir -p)"
```

---

<!-- openspec-task: 5.6 -->
### Task 10: `writeParsed` + `readParsed`

**Files:**
- Modify: `electron/ipc/file.ts`
- Modify: `electron/ipc/file.test.ts`

`writeParsed` is defined in tasks.md 5.6; `readParsed` is its symmetrical counterpart promised by ipc-contract task 5.1, so we land both here under the 5.6 annotation since the spec scenario "frontmatter 全字段往返" (Plan 4 task 7.8) requires both halves.

- [ ] **Step 1: Failing tests**

Append to `electron/ipc/file.test.ts`:

```ts
describe('fileHandlers.writeParsed / readParsed', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipcparsed-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('writeParsed then readParsed roundtrips frontmatter + body', async () => {
    const fm = { title: 'hi', tags: ['a'], rating: 4 }
    await fileHandlers.writeParsed('a.md', fm as never, '# Body\n', { eol: 'lf' })
    const r = await fileHandlers.readParsed('a.md')
    expect(r.frontmatter).toMatchObject(fm)
    expect(r.body).toContain('# Body')
    expect(r.eol).toBe('lf')
    expect(r.hadBom).toBe(false)
  })

  it('writeParsed with empty frontmatter writes plain body (no --- wrapper)', async () => {
    await fileHandlers.writeParsed('plain.md', {} as never, '# just body\n')
    const onDisk = readFileSync(join(dir, 'plain.md'), 'utf8')
    expect(onDisk.startsWith('---')).toBe(false)
    expect(onDisk).toContain('# just body')
  })

  it('writeParsed honors expectedMtime → throws E_MTIME_MISMATCH on stale read', async () => {
    await fileHandlers.writeParsed('a.md', { title: 'old' } as never, 'body\n')
    await expect(
      fileHandlers.writeParsed('a.md', { title: 'new' } as never, 'body\n', {
        expectedMtime: 1
      })
    ).rejects.toMatchObject({ code: 'E_MTIME_MISMATCH' })
  })

  it('writeParsed validates frontmatter — invalid rating is rejected', async () => {
    // gray-matter will accept whatever we hand it; the schema check happens on PARSE.
    // We simulate: write plain content with invalid rating in YAML, then readParsed should fail.
    await fileHandlers.write('bad.md', '---\nrating: 9\n---\nbody\n', { eol: 'lf' })
    await expect(fileHandlers.readParsed('bad.md')).rejects.toThrow(/rating|range|5/i)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
npx vitest run electron/ipc/file.test.ts -t "writeParsed|readParsed"
```

Expected: 4 failed (current stubs throw E_INTERNAL).

- [ ] **Step 3: Implement writeParsed + readParsed**

Add the import in `electron/ipc/file.ts`:

```ts
import { parseFile, stringify } from '../services/frontmatter'
import type { Frontmatter } from '@shared/frontmatter-schema'
```

Replace the two stubs:

```ts
  async readParsed(rel: string): Promise<FileReadParsedResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    let r
    try {
      r = await readFileDetect(abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${rel}: not found`)
      }
      throw err
    }
    const parsed = parseFile(r.content)
    return {
      content: r.content,
      eol: r.eol,
      mtimeMs: r.mtimeMs,
      sha256: r.sha256,
      hadBom: r.hadBom,
      originalEncoding: r.originalEncoding,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      rawYaml: parsed.rawYaml
    }
  },

  async writeParsed(
    rel: string,
    frontmatter: Frontmatter,
    body: string,
    opts: FileWriteOptions = {}
  ): Promise<FileWriteResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    const md = stringify(frontmatter, body)
    return writeWithVerify(abs, md, opts)
  },
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run electron/ipc/file.test.ts
```

Expected: all (21) tests pass.

- [ ] **Step 5: Run the whole suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: exits 0. The handler-map type now matches the contract exactly.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/file.ts electron/ipc/file.test.ts
git commit -m "feat(phase-04): file.writeParsed + readParsed (frontmatter codec via IPC)"
```

---

## Plan 3 Self-Review

- [ ] **Spec coverage:**
  - `frontmatter-codec/spec.md`: 含 frontmatter 的 md (Task 1), 无 frontmatter 的 md (Task 1), 类型不合法 (Task 4 + Task 3 schema), 未知字段保留 (Task 1, Task 3), 有 frontmatter / 空 frontmatter / 往返一致 (Task 2, Task 4), Schema 对齐 PRD / rating 范围 (Task 3, Task 4).
  - `path-safety/spec.md` (full-link enforcement): every `fileHandlers.*` method calls `safeResolve` (Task 7-10); list / rename traversal tests (Task 8, 9).
  - `md-file-io/spec.md`: 基础文件操作 — read / write / stat / exists / list (skip symlink) / rename (Tasks 7-10). Other md-file-io requirements were covered by Plan 2.
- [ ] **No placeholders:** `git grep -nE 'TODO|TBD|FIXME|not yet implemented' electron/ipc/file.ts electron/services/frontmatter.ts shared/frontmatter-schema.ts` is empty.
- [ ] **Type symbols line up:** `Frontmatter`, `FileReadResult`, `FileWriteResult`, `FileListEntry`, `FileStat` consistent across contract / handlers / tests.
- [ ] **Handler map is complete:** `electron/ipc/handlers.ts` `ipcHandlers` includes `file: fileHandlers` and TS type-checks without errors.
- [ ] **All tests green:** `npm test` passes.

Plan 4 (`tasks-6.1-7.10`) migrates phase-2 callers to the new `writeFileAtomic`, then runs the full acceptance smoke battery and the strict OpenSpec validate.
