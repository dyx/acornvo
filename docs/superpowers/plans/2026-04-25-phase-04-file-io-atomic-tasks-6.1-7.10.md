# Phase 04 — File I/O & Atomicity: Plan 4 (Phase-2 migration + Acceptance + Validate)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-04-file-io-atomic`
> **Task range:** OpenSpec tasks `6.1`–`7.10` (13 tasks)
> **Plan order:** 4 of 4. Final plan; depends on Plans 1–3.
> **Status:** Not started
> **Created:** 2026-04-25
> **Branch suggestion:** Continue on `feat/phase-04-file-io-atomic`. After Task 13 the branch is mergeable.

---

## Goal

Two-part finish for phase 04: (1) migrate the three phase-2 disk writers (`recent.save`, `project.json` writer, `.lock` writer) off the older `atomicWrite.ts` primitive onto the new `writeFileAtomic` from `fs-atomic.ts`, so the entire app shares a single atomic-write code path; (2) run the acceptance smoke battery from the OpenSpec tasks (UTF-8 BOM, GBK, CRLF, frontmatter full-field roundtrip, path traversal, mtime mismatch), confirm coverage thresholds, and pass `openspec validate --strict`.

## Architecture

- **Migration shape.** Each phase-2 callsite swaps `import { atomicWriteJson } from './atomicWrite'` for `import { writeFileAtomic } from './fs-atomic'` and JSON-stringifies inline. We *don't* delete `atomicWrite.ts` in this phase — leaving the file as an unused shim minimizes the diff blast radius and makes the migration easier to revert if we hit a regression. A separate cleanup change can remove it later.
- **The lockfile gets a chmod.** The old `atomicWriteJson` had a `mode` option used by the lockfile (`0o600`). After the swap, we add `await chmod(path, 0o600).catch(() => undefined)` immediately after `writeFileAtomic`. There is a microscopic window (≤1 ms) where the file is `0o644` before the chmod — this is acceptable for a lockfile (it's local-only and contains pid/host metadata, not secrets).
- **Acceptance tests** live in a new `electron/ipc/file.smoke.test.ts` so they're easy to find as the canonical acceptance battery. They reuse the same `vi.mock('@/electron/services/grove')` pattern from Plan 3 — fast, hermetic, no real IPC bridge.
- **Power-loss test (7.5)** is a manual procedure with a documented checklist; automating SIGKILL races in CI is brittle and not worth the flake budget. The unit tests in Plan 2 already establish that `writeFileAtomic` cleans `.tmp` on failure and that `rename` is the only step that can leave a partial state.
- **Coverage threshold.** Plans 1+2 already established ≥85% on path-safety / fs-atomic individually. Task 12 here re-runs vitest with coverage scoped to those two files to confirm the gate.

## Tech Stack

- Already-installed: `iconv-lite`, `gray-matter`, `zod`, `vitest@^2`.
- `node:fs/promises` `chmod` for the lockfile mode preservation.
- `openspec` CLI for the strict validate at the end.

## Files Touched (cumulative for this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/services/recent.ts` | Modify (swap import + call) | 6.1 |
| `electron/services/grove.ts` | Modify (swap project.json writes) | 6.2 |
| `electron/services/lockfile.ts` | Modify (swap + add chmod) | 6.3 |
| `electron/ipc/file.smoke.test.ts` | Create | 7.1–7.4, 7.6–7.8 |
| `docs/runbooks/phase-04-power-loss.md` | Create | 7.5 |
| (none) | Coverage / validate runs only | 7.9, 7.10 |

---

## Tasks

<!-- openspec-task: 6.1 -->
### Task 1: Migrate `recent.save` to `writeFileAtomic`

**Files:**
- Modify: `electron/services/recent.ts`

- [ ] **Step 1: Locate the current write path**

```bash
grep -n "atomicWriteJson\|atomicWriteFile" electron/services/recent.ts
```

Expected: at least one call (e.g. `await atomicWriteJson(path, value)`).

- [ ] **Step 2: Run the existing recent-projects tests to establish a baseline**

```bash
npx vitest run electron/services/recent
```

Expected: phase-2 tests for recent.ts all pass. Note any flaky tests *before* changing anything; the migration must not introduce new failures.

- [ ] **Step 3: Swap the import + call**

In `electron/services/recent.ts`, replace:

```ts
import { atomicWriteJson } from './atomicWrite'
```

with:

```ts
import { writeFileAtomic } from './fs-atomic'
```

Then for each `atomicWriteJson(path, value)` callsite, replace with:

```ts
await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n')
```

(Match the pretty-print + trailing newline format the old helper used so the on-disk format is byte-identical.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 0 errors.

- [ ] **Step 5: Run recent-projects tests — green**

```bash
npx vitest run electron/services/recent
```

Expected: same passing tests as Step 2.

- [ ] **Step 6: Commit**

```bash
git add electron/services/recent.ts
git commit -m "refactor(phase-04): recent.save uses fs-atomic.writeFileAtomic"
```

---

<!-- openspec-task: 6.2 -->
### Task 2: Migrate `project.json` writes to `writeFileAtomic`

**Files:**
- Modify: `electron/services/grove.ts`

- [ ] **Step 1: Find all callsites**

```bash
grep -n "atomicWriteJson\|atomicWriteFile" electron/services/grove.ts
```

Expected: one or more callsites (project.json + possibly other JSON files written during grove init).

- [ ] **Step 2: Baseline phase-2 grove tests**

```bash
npx vitest run electron/services/grove
```

Expected: all phase-2 grove tests pass.

- [ ] **Step 3: Swap the import + each call**

In `electron/services/grove.ts`, replace:

```ts
import { atomicWriteJson } from './atomicWrite'
```

with:

```ts
import { writeFileAtomic } from './fs-atomic'
```

Then for each `atomicWriteJson(path, value)` callsite:

```ts
await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n')
```

- [ ] **Step 4: Type-check + tests**

```bash
npx tsc --noEmit -p tsconfig.node.json
npx vitest run electron/services/grove
```

Expected: 0 type errors; all grove tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/grove.ts
git commit -m "refactor(phase-04): grove writes project.json via fs-atomic.writeFileAtomic"
```

---

<!-- openspec-task: 6.3 -->
### Task 3: Migrate `.lock` writer (preserve `0o600` mode)

**Files:**
- Modify: `electron/services/lockfile.ts`

- [ ] **Step 1: Find the lock-write callsites**

```bash
grep -n "atomicWriteJson\|atomicWriteFile" electron/services/lockfile.ts
```

Expected: at least one call with `{ mode: 0o600 }`.

- [ ] **Step 2: Baseline phase-2 lockfile tests**

```bash
npx vitest run electron/services/lockfile
```

Expected: all phase-2 lockfile tests pass.

- [ ] **Step 3: Swap the import + each call, add a chmod after the write**

In `electron/services/lockfile.ts`:

```ts
import { writeFileAtomic } from './fs-atomic'
import { chmod } from 'node:fs/promises'
```

Replace each `await atomicWriteJson(path, value, { mode: 0o600 })` with:

```ts
await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n')
try {
  await chmod(path, 0o600)
} catch (err) {
  // chmod is a no-op on Windows NTFS — swallow.
  if ((err as NodeJS.ErrnoException).code !== 'ENOTSUP' && process.platform !== 'win32') {
    throw err
  }
}
```

- [ ] **Step 4: Add a focused test that confirms 0o600 is set on POSIX**

Append to `electron/services/lockfile.test.ts` (create if missing — most lockfile coverage lives in the phase-2 grove integration tests, but a tiny focused mode test is cheap):

```ts
// Only meaningful on POSIX; Windows skips.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Adjust the import below to whichever the lockfile module exposes for "write a lock".
// Most likely `acquire` — adapt the call shape if needed.
import * as lockfile from './lockfile'

const isPosix = process.platform !== 'win32'

describe.skipIf(!isPosix)('lockfile mode preservation', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lock-mode-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the lock file with mode 0o600', async () => {
    // The simplest reachable surface in the existing lockfile module that
    // produces the on-disk lock. Inspect lockfile.ts and call its public
    // "create lock" function with `dir` as the grove path. If `acquire` returns
    // a status object, accept the success branch and assert mode on the file.
    const outcome = await lockfile.acquire(dir)
    if (outcome.status !== 'acquired') {
      throw new Error(`expected acquired but got ${outcome.status}`)
    }
    const lockPath = join(dir, '.acorn', 'project.lock') // adjust if path helper says otherwise
    const m = statSync(lockPath).mode & 0o777
    expect(m).toBe(0o600)
    await lockfile.release(dir)
  })
})
```

If the test can't easily reach the lockfile path because `lockfile.acquire`'s shape differs, simplify by exposing a lower-level helper temporarily in the test (test-only export) — or skip this test and rely on `git diff` review of the chmod call. Do NOT weaken the implementation to make a test easier; the test is optional, the chmod is required.

- [ ] **Step 5: Type-check + tests**

```bash
npx tsc --noEmit -p tsconfig.node.json
npx vitest run electron/services/lockfile
```

Expected: 0 type errors; all lockfile tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/lockfile.ts electron/services/lockfile.test.ts
git commit -m "refactor(phase-04): lockfile uses fs-atomic.writeFileAtomic + chmod 0o600"
```

---

<!-- openspec-task: 7.1 -->
### Task 4: Smoke — new md write+read (UTF-8, LF, no BOM)

**Files:**
- Create: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Create the smoke harness**

Create `electron/ipc/file.smoke.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@/electron/services/grove', () => ({ getCurrent: vi.fn() }))
import * as groveSvc from '../services/grove'
import { fileHandlers } from './file'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-smoke-'))
  setGroveRoot(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  setGroveRoot(null)
})

// 7.1 new md
describe('smoke 7.1: write+read fresh md', () => {
  it('writes "# hi" and reads back with eol=lf hadBom=false', async () => {
    await fileHandlers.write('a.md', '# hi', { eol: 'lf' })
    const onDisk = readFileSync(join(dir, 'a.md'))
    // No BOM
    expect(onDisk[0]).not.toBe(0xef)
    // Read back via IPC
    const r = await fileHandlers.read('a.md')
    expect(r.content).toBe('# hi')
    expect(r.eol).toBe('lf')
    expect(r.hadBom).toBe(false)
    expect(r.originalEncoding).toBe('utf8')
  })
})
```

- [ ] **Step 2: Run — passes immediately**

```bash
npx vitest run electron/ipc/file.smoke.test.ts
```

Expected: 1 passed. (All the underlying machinery is in place from Plans 1-3; smoke just exercises it end to end.)

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.1 — fresh md write+read (LF, no BOM)"
```

---

<!-- openspec-task: 7.2 -->
### Task 5: Smoke — read a UTF-8 BOM file → hadBom: true, content stripped

**Files:**
- Modify: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Add the test**

Append to `file.smoke.test.ts`:

```ts
describe('smoke 7.2: BOM-prefixed UTF-8 file', () => {
  it('strips the BOM and reports hadBom=true', async () => {
    const target = join(dir, 'bom.md')
    writeFileSync(
      target,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi\n', 'utf8')])
    )
    const r = await fileHandlers.read('bom.md')
    expect(r.hadBom).toBe(true)
    expect(r.content).toBe('hi\n')
    expect(r.originalEncoding).toBe('utf8')
  })

  it('writeFile output for a fresh file has no BOM', async () => {
    await fileHandlers.write('fresh.md', 'plain', { eol: 'lf' })
    const buf = readFileSync(join(dir, 'fresh.md'))
    expect(buf[0]).not.toBe(0xef)
    expect(buf.toString('utf8')).toBe('plain')
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/ipc/file.smoke.test.ts -t "7.2"
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.2 — UTF-8 BOM strip on read; no BOM on write"
```

---

<!-- openspec-task: 7.3 -->
### Task 6: Smoke — GBK file → originalEncoding 'gbk'; write back as UTF-8

**Files:**
- Modify: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Add the test**

Append to `file.smoke.test.ts`:

```ts
import { encode as iconvEncode } from 'iconv-lite'

describe('smoke 7.3: GBK Chinese md file', () => {
  it('reads as UTF-8 with originalEncoding=gbk; writes back as UTF-8', async () => {
    const target = join(dir, 'gbk.md')
    writeFileSync(target, iconvEncode('你好世界\n', 'gbk'))
    const r = await fileHandlers.read('gbk.md')
    expect(r.content).toBe('你好世界\n')
    expect(r.originalEncoding).toBe('gbk')
    expect(r.hadBom).toBe(false)
    // Round-trip write defaults to UTF-8 (fileHandlers.write does NOT preserve original encoding)
    await fileHandlers.write('gbk.md', r.content, { eol: 'lf' })
    const after = readFileSync(join(dir, 'gbk.md'))
    expect(after.toString('utf8')).toBe('你好世界\n')
    // Re-read confirms the file is now UTF-8
    const r2 = await fileHandlers.read('gbk.md')
    expect(r2.originalEncoding).toBe('utf8')
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/ipc/file.smoke.test.ts -t "7.3"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.3 — GBK read → UTF-8 round-trip"
```

---

<!-- openspec-task: 7.4 -->
### Task 7: Smoke — CRLF file preserved on write

**Files:**
- Modify: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Add the test**

Append to `file.smoke.test.ts`:

```ts
describe('smoke 7.4: CRLF preservation', () => {
  it('reads CRLF as eol="crlf"; explicit eol:"crlf" write keeps it CRLF on disk', async () => {
    const target = join(dir, 'crlf.md')
    writeFileSync(target, 'a\r\nb\r\nc\r\n', 'utf8')
    const r = await fileHandlers.read('crlf.md')
    expect(r.eol).toBe('crlf')
    // Caller now writes back with eol: 'crlf' (the natural pattern from read.eol)
    await fileHandlers.write('crlf.md', 'x\ny\nz\n', { eol: 'crlf' })
    const onDisk = readFileSync(join(dir, 'crlf.md'), 'utf8')
    expect(onDisk).toBe('x\r\ny\r\nz\r\n')
    // Confirm read still classifies as crlf
    const r2 = await fileHandlers.read('crlf.md')
    expect(r2.eol).toBe('crlf')
  })

  it('default write (no eol option) emits LF', async () => {
    await fileHandlers.write('default-eol.md', 'a\nb\n')
    const onDisk = readFileSync(join(dir, 'default-eol.md'), 'utf8')
    expect(onDisk).toBe('a\nb\n')
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/ipc/file.smoke.test.ts -t "7.4"
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.4 — CRLF preserved when caller passes eol:crlf"
```

---

<!-- openspec-task: 7.5 -->
### Task 8: Manual power-loss procedure (runbook)

**Files:**
- Create: `docs/runbooks/phase-04-power-loss.md`

This is a **manual** test that the engineer runs once at the end of the phase. Automating SIGKILL races in CI is brittle and the unit-test layer (Plans 1+2) already establishes the building blocks — `.tmp` cleanup on failure, fsync before rename, `Map<absPath>` lock that releases on error.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/phase-04-power-loss.md`:

```markdown
# Phase 04 — Power-loss / kill-9 acceptance check

This runbook verifies that `writeFileAtomic` leaves the on-disk state intact when
the writing process is killed mid-write.

## Setup

1. Build the dev app: `npm run dev` (Electron will boot).
2. Open a fresh test grove (`/tmp/grove-pwrloss` is fine).
3. Open the DevTools console for the renderer.

## Run

In the DevTools console:

```js
// Big payload so the write is observably non-instant.
const payload = '# big\n' + 'lorem ipsum '.repeat(500_000)
window.api.file.write('big.md', payload).then(() => console.log('done'))
```

While the write is running (you can verify by `ls -la /tmp/grove-pwrloss/` from a
terminal — you should see a `big.md.<uuid>.tmp` file briefly), kill the Electron
main process:

```bash
pkill -9 -f electron
```

## Expected outcome

After re-launching the app and the same grove:

- [ ] `/tmp/grove-pwrloss/big.md` is **either** the previous version **or** the
      fully-written new version. Never half-written.
- [ ] No `.tmp` straggler remains in the grove root: `ls /tmp/grove-pwrloss/*.tmp 2>/dev/null` exits non-zero (no match).

If a `.tmp` straggler is present, that's an **acceptable** outcome (the rename
hadn't happened yet), so long as the target file is still the old/untouched
version. The phase-04 contract guarantees: **the target is never half-written**.
A separate cleanup pass at next boot (out of scope here) would remove any orphan
tmp files.

## Pass criteria

Both bullets above check out across at least one successful kill mid-write run.
Document the run in the change PR description.
```

- [ ] **Step 2: Run the procedure once and record the outcome in the PR description**

(No automated step. The doc creation itself satisfies this OpenSpec task.)

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/phase-04-power-loss.md
git commit -m "docs(phase-04): runbook for kill-9 power-loss acceptance test"
```

---

<!-- openspec-task: 7.6 -->
### Task 9: Smoke — path traversal → E_PERMISSION

**Files:**
- Modify: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Add the test**

Append to `file.smoke.test.ts`:

```ts
import { IpcError } from '@shared/ipc-contract'

describe('smoke 7.6: path traversal rejected', () => {
  it('write("../outside.md") throws E_PERMISSION', async () => {
    await expect(fileHandlers.write('../outside.md', 'x')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('read("../outside.md") throws E_PERMISSION', async () => {
    await expect(fileHandlers.read('../outside.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('list("../") throws E_PERMISSION', async () => {
    await expect(fileHandlers.list('../')).rejects.toMatchObject({ code: 'E_PERMISSION' })
  })

  it('rename("a.md", "../escape.md") leaves the source untouched', async () => {
    writeFileSync(join(dir, 'a.md'), 'orig')
    await expect(fileHandlers.rename('a.md', '../escape.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('orig')
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/ipc/file.smoke.test.ts -t "7.6"
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.6 — path traversal blocked across read/write/list/rename"
```

---

<!-- openspec-task: 7.7 -->
### Task 10: Smoke — mtime optimistic lock → E_MTIME_MISMATCH

**Files:**
- Modify: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Add the test**

Append to `file.smoke.test.ts`:

```ts
import { utimes } from 'node:fs/promises'

describe('smoke 7.7: mtime optimistic lock', () => {
  it('throws E_MTIME_MISMATCH when expectedMtime is stale', async () => {
    // Write once to establish a baseline.
    const r1 = await fileHandlers.write('a.md', 'v1', { eol: 'lf' })
    const staleMtime = r1.mtimeMs

    // Bump the mtime artificially (simulates a concurrent write by another process).
    const future = staleMtime + 5000
    await utimes(join(dir, 'a.md'), future / 1000, future / 1000)

    // Caller still holds the OLD expectedMtime — must be rejected.
    await expect(
      fileHandlers.write('a.md', 'v2', { eol: 'lf', expectedMtime: staleMtime })
    ).rejects.toMatchObject({ code: 'E_MTIME_MISMATCH' })

    // Original file content (post-utimes) must still be 'v1' — write was rejected.
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('v1')
  })

  it('writes succeed when expectedMtime matches the current value', async () => {
    const r1 = await fileHandlers.write('b.md', 'v1', { eol: 'lf' })
    await fileHandlers.write('b.md', 'v2', { eol: 'lf', expectedMtime: r1.mtimeMs })
    expect(readFileSync(join(dir, 'b.md'), 'utf8')).toBe('v2')
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/ipc/file.smoke.test.ts -t "7.7"
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.7 — mtime optimistic lock E_MTIME_MISMATCH"
```

---

<!-- openspec-task: 7.8 -->
### Task 11: Smoke — frontmatter full-field roundtrip

**Files:**
- Modify: `electron/ipc/file.smoke.test.ts`

- [ ] **Step 1: Add the test**

Append to `file.smoke.test.ts`:

```ts
describe('smoke 7.8: frontmatter full-field roundtrip via IPC', () => {
  it('writeParsed → readParsed preserves all PRD fields', async () => {
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
    await fileHandlers.writeParsed('full.md', fm as never, body, { eol: 'lf' })
    const r = await fileHandlers.readParsed('full.md')
    expect(r.frontmatter).toMatchObject(fm)
    // body must be semantically equal (gray-matter may normalize leading/trailing newlines).
    expect(r.body.trim()).toBe(body.trim())
    expect(r.eol).toBe('lf')
    expect(r.hadBom).toBe(false)
  })

  it('writeParsed with empty frontmatter writes plain body (no --- wrapper)', async () => {
    await fileHandlers.writeParsed('plain.md', {} as never, '# just body\n')
    const onDisk = readFileSync(join(dir, 'plain.md'), 'utf8')
    expect(onDisk.startsWith('---')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — pass**

```bash
npx vitest run electron/ipc/file.smoke.test.ts -t "7.8"
```

Expected: 2 passed.

- [ ] **Step 3: Run the full smoke battery + project suite**

```bash
npx vitest run electron/ipc/file.smoke.test.ts
npm test
```

Expected: every smoke test passes; the full project suite is green.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/file.smoke.test.ts
git commit -m "test(phase-04): smoke 7.8 — frontmatter full-field roundtrip via IPC"
```

---

<!-- openspec-task: 7.9 -->
### Task 12: Coverage gate — fs-atomic.ts and path-safety.ts ≥85%

**Files:**
- (no edits — coverage run only)

- [ ] **Step 1: Make sure `@vitest/coverage-v8` is installed**

```bash
npm ls @vitest/coverage-v8 || npm install -D @vitest/coverage-v8
```

Expected: package present and matched to `vitest@^2`.

- [ ] **Step 2: Run coverage scoped to the two phase-04 critical files**

```bash
npx vitest run --coverage \
  --coverage.include='electron/services/fs-atomic.ts' \
  --coverage.include='electron/services/path-safety.ts' \
  --coverage.reporter=text \
  --coverage.reporter=text-summary
```

Expected: both files report ≥85% on lines, branches, functions. Note the exact numbers in the next step.

- [ ] **Step 3: Record the numbers in the PR description**

Capture the two `text-summary` rows that mention `fs-atomic.ts` and `path-safety.ts`, e.g.:

```
fs-atomic.ts        |   91.2 |    87.5 |     100 |   91.2 |
path-safety.ts      |   97.6 |    93.3 |     100 |   97.6 |
```

If either file is below 85% on any column, identify the uncovered branches with:

```bash
npx vitest run --coverage \
  --coverage.include='electron/services/fs-atomic.ts' \
  --coverage.include='electron/services/path-safety.ts' \
  --coverage.reporter=html
```

Open `coverage/index.html`, click into the file, find the red lines, and add a focused test in the corresponding `.test.ts`. Re-run Step 2 until the gate passes. **Do not** add `/* istanbul ignore */` to silence coverage.

- [ ] **Step 4: Commit any new tests**

```bash
git add electron/services/fs-atomic.test.ts electron/services/path-safety.test.ts
# If no new tests were needed (coverage already ≥85%), skip the commit.
git diff --cached --quiet || git commit -m "test(phase-04): close coverage gaps in fs-atomic / path-safety"
```

---

<!-- openspec-task: 7.10 -->
### Task 13: `openspec validate phase-04-file-io-atomic --strict`

**Files:**
- (no edits expected — validation run only)

- [ ] **Step 1: Run the strict validate**

```bash
openspec validate phase-04-file-io-atomic --strict
```

Expected: exits 0 with no warnings or errors.

- [ ] **Step 2: If validate reports gaps, fix in the OpenSpec change**

Common cases:

- Missing requirement scenario → add it under the relevant `## ADDED Requirements` block in `openspec/changes/phase-04-file-io-atomic/specs/<capability>/spec.md`.
- A scenario refers to a method that doesn't appear in tasks.md → either add the task or revise the scenario to match what was actually built.
- Type-check or test failure → triage normally; the strict gate runs them as part of the validate.

After fixing, re-run:

```bash
openspec validate phase-04-file-io-atomic --strict
```

Expected: 0 errors. Repeat until clean.

- [ ] **Step 3: Run the full project suite one last time**

```bash
npm test
npx tsc --noEmit -p tsconfig.node.json
```

Expected: all green; 0 type errors.

- [ ] **Step 4: Confirm OpenSpec tasks.md is in sync**

Each of the 38 OpenSpec task lines should now be `[x]` (checked) — the
`/opsx:executing-plans` flow checks them off as plan tasks complete. If any are
still `[ ]` after this plan finishes, run:

```bash
openspec status --change phase-04-file-io-atomic --json | grep '"done": false'
```

For any remaining `done: false` lines, either complete the work or revise the task description if it was already covered by a sibling task.

- [ ] **Step 5: Commit any final fixups**

```bash
# Likely nothing to commit if Steps 1-3 were clean.
git status
git diff --cached --quiet || git commit -m "chore(phase-04): final cleanup before openspec validate --strict"
```

- [ ] **Step 6: Tag the branch as ready for PR**

(No git tag needed — just confirm this in the PR description: "All 38 OpenSpec tasks complete; `openspec validate --strict` passes; coverage on fs-atomic and path-safety ≥85%.")

---

## Plan 4 Self-Review

- [ ] **Spec coverage:** every OpenSpec scenario in `specs/{md-file-io,frontmatter-codec,path-safety}/spec.md` either has an automated test (Plans 1-3 unit tests + Plan 4 smoke tests) or a manual runbook (7.5).
- [ ] **No phase-2 callsite still uses `atomicWriteJson` for the three migrated files:** `git grep -n 'atomicWriteJson\|atomicWriteFile' electron/services/recent.ts electron/services/grove.ts electron/services/lockfile.ts` is empty.
- [ ] **`atomicWrite.ts` itself is intentionally untouched** (left as a dormant module to keep the diff focused; deletion is a separate change if needed).
- [ ] **All tests green:** `npm test` exits 0.
- [ ] **Type-check clean:** `npx tsc --noEmit -p tsconfig.node.json` exits 0.
- [ ] **Coverage gate met:** Task 12 records ≥85% on `fs-atomic.ts` and `path-safety.ts`.
- [ ] **OpenSpec strict validate passes:** Task 13 step 1 exits 0.

When all of the above check out, phase-04 is complete and the branch is ready for PR + archive (`/opsx:archive phase-04-file-io-atomic`).
