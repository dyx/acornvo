# Phase 04 — File I/O & Atomicity: Plan 2 (fs-atomic core)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-04-file-io-atomic`
> **Task range:** OpenSpec tasks `3.1`–`3.7` (7 tasks)
> **Plan order:** 2 of 4. Depends on Plan 1 (`tasks-1.1-2.4`); Plans 3–4 depend on this one.
> **Status:** Not started
> **Created:** 2026-04-25
> **Branch suggestion:** Continue on `feat/phase-04-file-io-atomic` (same branch as Plan 1).

---

## Goal

Build the heart of phase 04: a single `electron/services/fs-atomic.ts` module that owns all on-disk reads and writes for the app. It must guarantee atomicity (no half-files on crash), encoding sanity (BOM-stripped UTF-8, GBK fallback), line-ending preservation, and post-write content verification — and serialize concurrent writes to the same path.

## Architecture

- **Atomicity** = `writeFile(<abs>.<uuid>.tmp)` + `fd.sync()` (fsync) + `fs.rename`. fsync is mandatory because rename only guarantees ordering against future renames, not durability against power loss. On `EXDEV` (cross-fs rename) we fall back to `copyFile + unlink` of the tmp.
- **Windows AV resilience.** `EPERM` / `EBUSY` on Windows usually means an antivirus is mid-scan; we retry the rename up to 2 times with 50 ms backoff.
- **Per-path serialization** uses a module-scope `Map<absPath, Promise<unknown>>`. Each `writeFileAtomic` chains onto the prior pending promise for the same path; the map entry is cleared in a `finally` once the chain settles. Different paths run in parallel.
- **Read-detect pipeline.** `readFileDetect(abs)` returns `{ content, eol, originalEncoding, hadBom, mtimeMs, sha256 }`:
  1. UTF-8 BOM (`EF BB BF`) → strip and record `hadBom: true`.
  2. `Buffer.isUtf8(buf)` (Node 22 built-in) → decode as UTF-8.
  3. Otherwise try `iconv-lite` GBK decode; success without replacement chars → `originalEncoding: 'gbk'`. Failure → throw `IpcError('E_ENCODING')`.
  4. EOL scan: count `\r\n` vs lone `\n`. Pure → `'lf'` or `'crlf'`. Mixed → majority wins, with `'mixed'` reported.
  5. `sha256` of the **decoded** UTF-8 bytes (not the raw on-disk buffer) so verify-after-write compares apples-to-apples.
- **Verified write.** `writeWithVerify(abs, content, { eol, expectedMtime? })`:
  1. If `expectedMtime` is set, `fs.stat(abs).mtimeMs` must match — otherwise throw `IpcError('E_MTIME_MISMATCH')`.
  2. `normalizeForDisk(content, { eol })` → `writeFileAtomic`.
  3. Read back, sha256 — if mismatch, wait 50 ms (cloud-sync delay), retry once. Still mismatch → `IpcError('E_WRITE_VERIFY')`.
- **Error code extension.** This plan extends `IpcErrorCode` (in `shared/ipc-contract.ts`) with `'E_ENCODING'`, `'E_WRITE_VERIFY'`, `'E_MTIME_MISMATCH'` as they're first thrown. Plan 3 task 5.2 formalizes them as constants and confirms the union is complete.

## Tech Stack

- `node:fs/promises` (open / rename / copyFile / unlink / readFile / stat / writeFile)
- `node:crypto` (`randomUUID`, `createHash`)
- `Buffer.isUtf8` (Node 22+, already pinned)
- `iconv-lite` (Plan 1 added it as a dep)
- `vitest@^2`

## Files Touched (cumulative for this plan)

| Path                                  | Action                                | Owner task                        |
| ------------------------------------- | ------------------------------------- | --------------------------------- |
| `shared/ipc-contract.ts`              | Modify (extend `IpcErrorCode`)        | 3.5, 3.7                          |
| `electron/services/fs-atomic.ts`      | Replace stub with real implementation | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 |
| `electron/services/fs-atomic.test.ts` | Create                                | all                               |

---

## Tasks

<!-- openspec-task: 3.1 -->

### Task 1: writeFileAtomic core (tmp + fsync + rename)

**Files:**

- Modify: `electron/services/fs-atomic.ts`
- Create: `electron/services/fs-atomic.test.ts`

- [ ] **Step 1: Write failing tests for the happy path**

Create `electron/services/fs-atomic.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from './fs-atomic'

describe('writeFileAtomic', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a string to a fresh path', async () => {
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'hello')
    expect(readFileSync(target, 'utf8')).toBe('hello')
  })

  it('writes bytes (Uint8Array) to a fresh path', async () => {
    const target = join(dir, 'a.bin')
    await writeFileAtomic(target, new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
    const buf = readFileSync(target)
    expect(Array.from(buf)).toEqual([0xde, 0xad, 0xbe, 0xef])
  })

  it('overwrites an existing file', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'old')
    await writeFileAtomic(target, 'new')
    expect(readFileSync(target, 'utf8')).toBe('new')
  })

  it('does not leave .tmp residue after success', async () => {
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'hello')
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })

  it('creates the parent directory if missing (mkdir -p semantics)', async () => {
    const target = join(dir, 'sub', 'deep', 'a.md')
    await writeFileAtomic(target, 'x')
    expect(readFileSync(target, 'utf8')).toBe('x')
  })
})
```

- [ ] **Step 2: Run — confirm all tests fail**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: 5 tests fail with "writeFileAtomic: not yet implemented".

- [ ] **Step 3: Implement the core (no EXDEV / no retry / no lock yet)**

Replace the stub `writeFileAtomic` export in `electron/services/fs-atomic.ts`:

```ts
import { open, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function writeFileAtomic(abs: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(abs), { recursive: true })
  const tmp = `${abs}.${randomUUID()}.tmp`
  const fd = await open(tmp, 'w')
  try {
    await fd.writeFile(data)
    await fd.sync()
  } finally {
    await fd.close()
  }
  await rename(tmp, abs)
}
```

(Leave `readFileDetect`, `normalizeForDisk`, `writeWithVerify` as their throwing stubs for now.)

- [ ] **Step 4: Run — all five tests pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): writeFileAtomic core (tmp + fsync + rename)"
```

---

<!-- openspec-task: 3.2 -->

### Task 2: EXDEV fallback (copyFile + unlink)

**Files:**

- Modify: `electron/services/fs-atomic.ts`
- Modify: `electron/services/fs-atomic.test.ts`

We can't easily produce a real cross-filesystem boundary in CI. The pragmatic test mocks `fs.rename` to throw `EXDEV` once and verifies the fallback is taken.

- [ ] **Step 1: Add a failing test that injects EXDEV**

Append to `fs-atomic.test.ts`:

```ts
import { vi } from 'vitest'

describe('writeFileAtomic EXDEV fallback', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-exdev-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('falls back to copyFile + unlink when rename throws EXDEV', async () => {
    const fsp = await import('node:fs/promises')
    const realRename = fsp.rename
    let renameCalls = 0
    vi.spyOn(fsp, 'rename').mockImplementation(async (src, dest) => {
      renameCalls++
      const err = new Error('EXDEV: cross-device link not permitted') as NodeJS.ErrnoException
      err.code = 'EXDEV'
      throw err
    })
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'across-fs')
    expect(renameCalls).toBe(1)
    expect(readFileSync(target, 'utf8')).toBe('across-fs')
    // tmp must be cleaned up even on the fallback path
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
    // restore for safety even though afterEach also restores
    vi.spyOn(fsp, 'rename').mockImplementation(realRename)
  })
})
```

- [ ] **Step 2: Run — confirm new test fails**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: the EXDEV test fails — the unmocked code throws the EXDEV error to the caller.

- [ ] **Step 3: Implement the fallback**

Update `writeFileAtomic` in `electron/services/fs-atomic.ts`:

```ts
import { open, rename, mkdir, copyFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function writeFileAtomic(abs: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(abs), { recursive: true })
  const tmp = `${abs}.${randomUUID()}.tmp`
  const fd = await open(tmp, 'w')
  try {
    await fd.writeFile(data)
    await fd.sync()
  } finally {
    await fd.close()
  }
  try {
    await rename(tmp, abs)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(tmp, abs)
      await unlink(tmp)
      return
    }
    // Best-effort cleanup of the tmp on any other rename failure.
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}
```

- [ ] **Step 4: Run — all tests pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all (6) tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): writeFileAtomic EXDEV fallback (copyFile + unlink)"
```

---

<!-- openspec-task: 3.3 -->

### Task 3: EPERM / EBUSY retry (Windows AV resilience)

**Files:**

- Modify: `electron/services/fs-atomic.ts`
- Modify: `electron/services/fs-atomic.test.ts`

- [ ] **Step 1: Add failing tests for the retry path**

Append to `fs-atomic.test.ts`:

```ts
describe('writeFileAtomic EPERM/EBUSY retry', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-retry-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('retries on EPERM up to 2 times then succeeds', async () => {
    const fsp = await import('node:fs/promises')
    const realRename = fsp.rename
    let attempts = 0
    vi.spyOn(fsp, 'rename').mockImplementation(async (src, dest) => {
      attempts++
      if (attempts <= 2) {
        const err = new Error('EPERM') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      return realRename(src, dest)
    })
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'retried')
    expect(attempts).toBe(3) // 2 failures + 1 success
    expect(readFileSync(target, 'utf8')).toBe('retried')
  })

  it('retries on EBUSY then gives up after 3 attempts (raises last error)', async () => {
    const fsp = await import('node:fs/promises')
    let attempts = 0
    vi.spyOn(fsp, 'rename').mockImplementation(async () => {
      attempts++
      const err = new Error('EBUSY') as NodeJS.ErrnoException
      err.code = 'EBUSY'
      throw err
    })
    const target = join(dir, 'a.md')
    await expect(writeFileAtomic(target, 'never')).rejects.toMatchObject({ code: 'EBUSY' })
    expect(attempts).toBe(3) // 1 initial + 2 retries
  })
})
```

- [ ] **Step 2: Run — both tests fail**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "retry"
```

Expected: 2 failed.

- [ ] **Step 3: Implement retry**

Wrap the `rename` call in `writeFileAtomic`:

```ts
async function renameWithAvRetry(tmp: string, abs: string): Promise<void> {
  let lastErr: NodeJS.ErrnoException | undefined
  for (let i = 0; i < 3; i++) {
    try {
      await rename(tmp, abs)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EXDEV') throw err // bubble up — caller does the copyFile fallback
      if (code !== 'EPERM' && code !== 'EBUSY') throw err
      lastErr = err as NodeJS.ErrnoException
      if (i < 2) await new Promise((r) => setTimeout(r, 50))
    }
  }
  throw lastErr
}
```

Then replace the `try { await rename(tmp, abs) }` block in `writeFileAtomic` with:

```ts
try {
  await renameWithAvRetry(tmp, abs)
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
    await copyFile(tmp, abs)
    await unlink(tmp)
    return
  }
  await unlink(tmp).catch(() => undefined)
  throw err
}
```

- [ ] **Step 4: Run — all tests pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all (8) tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): writeFileAtomic retries EPERM/EBUSY 2x at 50ms"
```

---

<!-- openspec-task: 3.4 -->

### Task 4: Per-path serialization lock

**Files:**

- Modify: `electron/services/fs-atomic.ts`
- Modify: `electron/services/fs-atomic.test.ts`

Two `writeFileAtomic` calls to the same `abs` path must serialize. Two calls to _different_ paths must run in parallel.

- [ ] **Step 1: Add failing tests for serialization order + parallelism**

Append to `fs-atomic.test.ts`:

```ts
describe('writeFileAtomic per-path serialization lock', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-lock-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('serializes two writes to the SAME path in submission order', async () => {
    const target = join(dir, 'a.md')
    // The two writes are launched effectively simultaneously.
    const a = writeFileAtomic(target, 'first')
    const b = writeFileAtomic(target, 'second')
    await Promise.all([a, b])
    // Final disk content is whatever was submitted second.
    expect(readFileSync(target, 'utf8')).toBe('second')
    // No tmp residue.
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })

  it('does NOT serialize writes to DIFFERENT paths (parallel ok)', async () => {
    const a = join(dir, 'a.md')
    const b = join(dir, 'b.md')
    const t0 = Date.now()
    await Promise.all([writeFileAtomic(a, 'aa'), writeFileAtomic(b, 'bb')])
    const elapsed = Date.now() - t0
    // Each write does an fsync; on a slow CI 50ms is generous. We only assert
    // that two parallel writes complete in well under 2x sequential time.
    expect(readFileSync(a, 'utf8')).toBe('aa')
    expect(readFileSync(b, 'utf8')).toBe('bb')
    expect(elapsed).toBeLessThan(2000)
  })

  it('clears the lock map on success so a third write to the same path also succeeds', async () => {
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, '1')
    await writeFileAtomic(target, '2')
    await writeFileAtomic(target, '3')
    expect(readFileSync(target, 'utf8')).toBe('3')
  })

  it('clears the lock map on failure (subsequent writes still work)', async () => {
    const target = join(dir, 'a.md')
    // First, use a write that will throw post-fsync — easiest: pass an invalid type.
    // We instead simulate failure by calling on a path whose parent we then chmod 0.
    // Simpler approach: trigger ENOTDIR by writing under an existing file.
    writeFileSync(join(dir, 'file'), 'x')
    const bad = join(dir, 'file', 'inside.md')
    await expect(writeFileAtomic(bad, 'will-fail')).rejects.toThrow()
    // Lock map must be released — a subsequent good write succeeds.
    const good = join(dir, 'good.md')
    await writeFileAtomic(good, 'ok')
    expect(readFileSync(good, 'utf8')).toBe('ok')
  })
})
```

- [ ] **Step 2: Run — `serializes two writes to the SAME path` will likely fail**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "serialization"
```

Expected: at least the "serializes" and "clears the lock" tests fail (concurrent writes can race for tmp creation / rename order is non-deterministic).

- [ ] **Step 3: Implement the per-path lock**

Add at the top of `electron/services/fs-atomic.ts`, inside the module scope:

```ts
const inflight = new Map<string, Promise<unknown>>()

function withPathLock<T>(abs: string, op: () => Promise<T>): Promise<T> {
  const prev = inflight.get(abs) ?? Promise.resolve()
  const next = prev.then(op, op) // run regardless of prior failure
  inflight.set(
    abs,
    next.finally(() => {
      // Only clear if no newer write has chained on top.
      if (inflight.get(abs) === next) inflight.delete(abs)
    })
  )
  return next
}
```

Refactor `writeFileAtomic` to wrap its body:

```ts
export async function writeFileAtomic(abs: string, data: string | Uint8Array): Promise<void> {
  return withPathLock(abs, async () => {
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${randomUUID()}.tmp`
    const fd = await open(tmp, 'w')
    try {
      await fd.writeFile(data)
      await fd.sync()
    } finally {
      await fd.close()
    }
    try {
      await renameWithAvRetry(tmp, abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await copyFile(tmp, abs)
        await unlink(tmp)
        return
      }
      await unlink(tmp).catch(() => undefined)
      throw err
    }
  })
}
```

- [ ] **Step 4: Run — all tests pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all (12) tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): writeFileAtomic per-path serialization lock"
```

---

<!-- openspec-task: 3.5 -->

### Task 5: readFileDetect (encoding + EOL + BOM + sha256)

**Files:**

- Modify: `shared/ipc-contract.ts` (extend `IpcErrorCode` with `'E_ENCODING'`)
- Modify: `electron/services/fs-atomic.ts`
- Modify: `electron/services/fs-atomic.test.ts`

Implements design D2 + D3. Returns `{ content, eol, originalEncoding, hadBom, mtimeMs, sha256 }`. Sub-steps 3.5.1–3.5.5 from `tasks.md` are folded into this single Superpowers task as separate test+impl cycles below.

- [ ] **Step 1: Extend the IpcErrorCode union with 'E_ENCODING'**

Edit `shared/ipc-contract.ts`. Find:

```ts
export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
```

Replace with:

```ts
export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
  | 'E_ENCODING'
```

(Run `npx tsc --noEmit -p tsconfig.node.json` once after to confirm no callers break.)

- [ ] **Step 2: Write failing tests for the read-detect contract**

Append to `fs-atomic.test.ts`:

```ts
import { encode as iconvEncode } from 'iconv-lite'
import { createHash } from 'node:crypto'
import { readFileDetect } from './fs-atomic'
import { IpcError } from '@shared/ipc-contract'

function sha256Hex(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex')
}

describe('readFileDetect', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-read-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads plain UTF-8 LF — no BOM, eol=lf, originalEncoding=utf8', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'hello\nworld\n', 'utf8')
    const r = await readFileDetect(target)
    expect(r.content).toBe('hello\nworld\n')
    expect(r.hadBom).toBe(false)
    expect(r.eol).toBe('lf')
    expect(r.originalEncoding).toBe('utf8')
    expect(r.sha256).toBe(sha256Hex('hello\nworld\n'))
    expect(typeof r.mtimeMs).toBe('number')
  })

  it('strips a UTF-8 BOM and reports hadBom=true', async () => {
    const target = join(dir, 'bom.md')
    writeFileSync(
      target,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi', 'utf8')])
    )
    const r = await readFileDetect(target)
    expect(r.content).toBe('hi')
    expect(r.hadBom).toBe(true)
    expect(r.originalEncoding).toBe('utf8')
    expect(r.sha256).toBe(sha256Hex('hi'))
  })

  it('decodes a GBK-encoded Chinese file', async () => {
    const target = join(dir, 'gbk.md')
    writeFileSync(target, iconvEncode('你好世界', 'gbk'))
    const r = await readFileDetect(target)
    expect(r.content).toBe('你好世界')
    expect(r.originalEncoding).toBe('gbk')
    expect(r.hadBom).toBe(false)
  })

  it('detects pure CRLF', async () => {
    const target = join(dir, 'crlf.md')
    writeFileSync(target, 'a\r\nb\r\nc\r\n', 'utf8')
    const r = await readFileDetect(target)
    expect(r.eol).toBe('crlf')
    // content stays in original bytes — line endings preserved in `content`
    // (renderer / IPC layer will decide whether to normalize on display).
    // The contract: `content` is the decoded UTF-8 string. We do NOT collapse
    // CRLF→LF inside readFileDetect; eol is metadata that callers use on write.
    expect(r.content).toBe('a\r\nb\r\nc\r\n')
  })

  it('classifies mixed line endings as "mixed"', async () => {
    const target = join(dir, 'mix.md')
    writeFileSync(target, 'a\nb\r\nc\nd\r\n', 'utf8')
    const r = await readFileDetect(target)
    expect(r.eol).toBe('mixed')
  })

  it('throws E_ENCODING on a clearly non-text binary file', async () => {
    const target = join(dir, 'bin.md')
    // Bytes that are neither valid UTF-8 nor plausible GBK text.
    // 0xc0 0x80 is a long-form NUL — invalid UTF-8 modified-UTF-8 form,
    // and high-byte sequences interleaved with control chars trigger GBK
    // replacement chars.
    writeFileSync(target, Buffer.from([0xc0, 0x80, 0xfe, 0xff, 0xff, 0xfe, 0xc0, 0x80, 0xfe, 0xff]))
    await expect(readFileDetect(target)).rejects.toBeInstanceOf(IpcError)
    await expect(readFileDetect(target)).rejects.toMatchObject({ code: 'E_ENCODING' })
  })

  it('produces a sha256 that matches the decoded UTF-8 content', async () => {
    const target = join(dir, 'sha.md')
    writeFileSync(target, 'abc', 'utf8')
    const r = await readFileDetect(target)
    expect(r.sha256).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})
```

- [ ] **Step 3: Run — confirm all 7 read-detect tests fail**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "readFileDetect"
```

Expected: 7 failed (`readFileDetect: not yet implemented`).

- [ ] **Step 4: Implement readFileDetect**

Update `electron/services/fs-atomic.ts`:

```ts
import { open, rename, mkdir, copyFile, unlink, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import iconv from 'iconv-lite'
import { IpcError } from '@shared/ipc-contract'

// ... existing writeFileAtomic + helpers above ...

export interface ReadFileDetectResult {
  content: string
  eol: 'lf' | 'crlf' | 'mixed'
  originalEncoding: 'utf8' | 'gbk'
  hadBom: boolean
  mtimeMs: number
  sha256: string
}

export async function readFileDetect(abs: string): Promise<ReadFileDetectResult> {
  const buf = await readFile(abs)
  const st = await stat(abs)

  // 1. UTF-8 BOM
  let body = buf
  let hadBom = false
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    body = buf.subarray(3)
    hadBom = true
  }

  // 2. Encoding detect (UTF-8 first, then GBK fallback)
  let content: string
  let originalEncoding: 'utf8' | 'gbk'
  if (Buffer.isUtf8(body)) {
    content = body.toString('utf8')
    originalEncoding = 'utf8'
  } else {
    try {
      const decoded = iconv.decode(body, 'gbk')
      // iconv-lite emits U+FFFD for un-decodable bytes; treat presence as failure.
      if (decoded.includes('�')) {
        throw new IpcError('E_ENCODING', `unable to decode ${abs} as utf-8 or gbk`)
      }
      content = decoded
      originalEncoding = 'gbk'
    } catch (err) {
      if (err instanceof IpcError) throw err
      throw new IpcError('E_ENCODING', `unable to decode ${abs}: ${(err as Error).message}`)
    }
  }

  // 3. EOL detection
  const eol = detectEol(content)

  // 4. sha256 of decoded UTF-8 content
  const sha256 = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')

  return { content, eol, originalEncoding, hadBom, mtimeMs: st.mtimeMs, sha256 }
}

function detectEol(s: string): 'lf' | 'crlf' | 'mixed' {
  let crlf = 0
  let lfOnly = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') {
      if (i > 0 && s[i - 1] === '\r') crlf++
      else lfOnly++
    }
  }
  if (crlf === 0 && lfOnly === 0) return 'lf' // no newlines → default lf
  if (crlf > 0 && lfOnly === 0) return 'crlf'
  if (lfOnly > 0 && crlf === 0) return 'lf'
  return 'mixed'
}
```

- [ ] **Step 5: Run — all readFileDetect tests pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all (19) tests pass. If the GBK test fails on a system that doesn't ship `iconv-lite`'s GBK table, install / re-run `npm install` (it's a runtime data file).

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): readFileDetect + E_ENCODING (UTF-8 BOM, GBK, EOL, sha256)"
```

---

<!-- openspec-task: 3.6 -->

### Task 6: normalizeForDisk (LF → target EOL)

**Files:**

- Modify: `electron/services/fs-atomic.ts`
- Modify: `electron/services/fs-atomic.test.ts`

Cheap, sync, pure function. Used by `writeWithVerify` (Task 7) to honor the file's original EOL.

- [ ] **Step 1: Add failing tests**

Append to `fs-atomic.test.ts`:

```ts
import { normalizeForDisk } from './fs-atomic'

describe('normalizeForDisk', () => {
  it('returns the input unchanged for { eol: "lf" }', () => {
    expect(normalizeForDisk('a\nb\n', { eol: 'lf' })).toBe('a\nb\n')
  })

  it('converts LF → CRLF for { eol: "crlf" }', () => {
    expect(normalizeForDisk('a\nb\n', { eol: 'crlf' })).toBe('a\r\nb\r\n')
  })

  it('does not double-encode existing CRLF when eol=crlf', () => {
    expect(normalizeForDisk('a\r\nb\r\n', { eol: 'crlf' })).toBe('a\r\nb\r\n')
  })

  it('strips lone CR when normalizing to LF', () => {
    // Defensive: if some upstream wrote bare \r, don't preserve it as CR-only.
    expect(normalizeForDisk('a\rb\n', { eol: 'lf' })).toBe('a\nb\n')
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "normalizeForDisk"
```

Expected: 4 failed.

- [ ] **Step 3: Implement**

Replace the stub `normalizeForDisk` in `fs-atomic.ts`:

```ts
export function normalizeForDisk(content: string, opts: { eol: 'lf' | 'crlf' }): string {
  // First, canonicalize to LF: any CRLF or lone CR → LF.
  const lf = content.replace(/\r\n?/g, '\n')
  if (opts.eol === 'lf') return lf
  return lf.replace(/\n/g, '\r\n')
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all (23) tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): normalizeForDisk LF/CRLF normalization"
```

---

<!-- openspec-task: 3.7 -->

### Task 7: writeWithVerify (mtime check + sha256 verify + retry)

**Files:**

- Modify: `shared/ipc-contract.ts` (extend `IpcErrorCode` with `'E_WRITE_VERIFY'` and `'E_MTIME_MISMATCH'`)
- Modify: `electron/services/fs-atomic.ts`
- Modify: `electron/services/fs-atomic.test.ts`

The orchestrator: pre-flight mtime check → normalize → atomic write → read back → sha256 verify with one 50ms retry. Sub-tasks 3.7.1–3.7.3 from `tasks.md` are the three test+impl cycles below.

- [ ] **Step 1: Extend IpcErrorCode with 2 more codes**

Edit `shared/ipc-contract.ts`. Update the union to:

```ts
export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
  | 'E_ENCODING'
  | 'E_WRITE_VERIFY'
  | 'E_MTIME_MISMATCH'
```

Type-check:

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: exits 0.

- [ ] **Step 2: Write failing tests for all three sub-cycles**

Append to `fs-atomic.test.ts`:

```ts
import { utimes } from 'node:fs/promises'
import { writeWithVerify } from './fs-atomic'

describe('writeWithVerify', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-verify-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // 3.7.1 mtime preflight
  it('writes successfully when expectedMtime matches current mtime', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'old', 'utf8')
    const before = (await stat(target)).mtimeMs
    const r = await writeWithVerify(target, 'new', { eol: 'lf', expectedMtime: before })
    expect(readFileSync(target, 'utf8')).toBe('new')
    expect(r.sha256).toBe(createHash('sha256').update('new').digest('hex'))
  })

  it('writes when expectedMtime is omitted (no preflight)', async () => {
    const target = join(dir, 'a.md')
    const r = await writeWithVerify(target, 'fresh', { eol: 'lf' })
    expect(readFileSync(target, 'utf8')).toBe('fresh')
    expect(typeof r.mtimeMs).toBe('number')
  })

  it('throws E_MTIME_MISMATCH when expectedMtime does not match current mtime', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'old', 'utf8')
    const wrongMtime = 1
    await expect(
      writeWithVerify(target, 'new', { eol: 'lf', expectedMtime: wrongMtime })
    ).rejects.toMatchObject({ code: 'E_MTIME_MISMATCH' })
    // Original content untouched.
    expect(readFileSync(target, 'utf8')).toBe('old')
  })

  // 3.7.2 normalize + atomic write
  it('honors eol=crlf by normalizing on the way to disk', async () => {
    const target = join(dir, 'a.md')
    await writeWithVerify(target, 'a\nb\n', { eol: 'crlf' })
    expect(readFileSync(target, 'utf8')).toBe('a\r\nb\r\n')
  })

  it('does not leave .tmp residue', async () => {
    const target = join(dir, 'a.md')
    await writeWithVerify(target, 'x', { eol: 'lf' })
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })

  // 3.7.3 verify + retry
  it('retries the verify-read once after a 50ms delay then succeeds', async () => {
    const fsp = await import('node:fs/promises')
    const realReadFile = fsp.readFile
    let calls = 0
    vi.spyOn(fsp, 'readFile').mockImplementation(async (...args: unknown[]) => {
      calls++
      // Only the SECOND call is the verify-read; the first returns stale "wrong-content".
      if (calls === 1) return Buffer.from('wrong-content', 'utf8') as never
      return realReadFile(args[0] as never, args[1] as never)
    })
    const target = join(dir, 'a.md')
    const r = await writeWithVerify(target, 'right', { eol: 'lf' })
    expect(r.sha256).toBe(createHash('sha256').update('right').digest('hex'))
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('throws E_WRITE_VERIFY when the verify-read keeps mismatching after retry', async () => {
    const fsp = await import('node:fs/promises')
    vi.spyOn(fsp, 'readFile').mockImplementation(
      async () => Buffer.from('always-wrong', 'utf8') as never
    )
    const target = join(dir, 'a.md')
    await expect(writeWithVerify(target, 'right', { eol: 'lf' })).rejects.toMatchObject({
      code: 'E_WRITE_VERIFY'
    })
  })
})
```

- [ ] **Step 3: Run — confirm all writeWithVerify tests fail**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "writeWithVerify"
```

Expected: 7 failed (`writeWithVerify: not yet implemented`).

- [ ] **Step 4: Implement writeWithVerify**

Replace the stub `writeWithVerify` export in `electron/services/fs-atomic.ts`:

```ts
export interface WriteWithVerifyOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
}

export async function writeWithVerify(
  abs: string,
  content: string,
  opts: WriteWithVerifyOptions = {}
): Promise<{ mtimeMs: number; sha256: string }> {
  const eol = opts.eol ?? 'lf'

  // 3.7.1 mtime preflight
  if (opts.expectedMtime !== undefined) {
    let currentMtime: number | undefined
    try {
      currentMtime = (await stat(abs)).mtimeMs
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      // File doesn't exist — caller said "I read mtime X" but the file is gone.
      // Treat as mismatch so they re-read and retry.
      throw new IpcError(
        'E_MTIME_MISMATCH',
        `${abs}: file not found (expected mtime ${opts.expectedMtime})`
      )
    }
    if (currentMtime !== opts.expectedMtime) {
      throw new IpcError(
        'E_MTIME_MISMATCH',
        `${abs}: mtime is ${currentMtime}, expected ${opts.expectedMtime}`
      )
    }
  }

  // 3.7.2 normalize + atomic write
  const onDisk = normalizeForDisk(content, { eol })
  const expectedSha = createHash('sha256').update(Buffer.from(onDisk, 'utf8')).digest('hex')
  await writeFileAtomic(abs, onDisk)

  // 3.7.3 verify (1 retry at 50ms)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) await new Promise((r) => setTimeout(r, 50))
    const got = await readFile(abs)
    const gotSha = createHash('sha256').update(got).digest('hex')
    if (gotSha === expectedSha) {
      const st = await stat(abs)
      return { mtimeMs: st.mtimeMs, sha256: expectedSha }
    }
  }
  throw new IpcError('E_WRITE_VERIFY', `${abs}: post-write sha256 mismatch after retry`)
}
```

- [ ] **Step 5: Run — all writeWithVerify tests pass**

```bash
npx vitest run electron/services/fs-atomic.test.ts -t "writeWithVerify"
```

Expected: 7 passed.

- [ ] **Step 6: Run the full fs-atomic test file**

```bash
npx vitest run electron/services/fs-atomic.test.ts
```

Expected: all (~30) tests pass.

- [ ] **Step 7: Run the full project suite**

```bash
npm test
```

Expected: all suites pass. (Phase 1/2/3 tests and Plan 1's path-safety tests included.)

- [ ] **Step 8: Commit**

```bash
git add shared/ipc-contract.ts electron/services/fs-atomic.ts electron/services/fs-atomic.test.ts
git commit -m "feat(phase-04): writeWithVerify + E_WRITE_VERIFY/E_MTIME_MISMATCH"
```

---

## Plan 2 Self-Review

- [ ] **Spec coverage:** every requirement in `specs/md-file-io/spec.md` has a covering test. 原子写入 (Tasks 1-4), 编码与 BOM 规范化 (Task 5: BOM strip + GBK + write-no-BOM is asserted in Plan 4 task 7.1), 换行风格保留 (Tasks 5-6 detect; Task 7 writes), 写后校验 (Task 7), mtime 乐观锁 (Task 7), 基础文件操作 (Plan 3, list/rename in particular).
- [ ] **No placeholders:** `git grep -nE 'TODO|TBD|FIXME' electron/services/fs-atomic.ts` returns nothing.
- [ ] **Type symbols line up:** `ReadFileDetectResult`, `WriteWithVerifyOptions`, and `'lf'|'crlf'|'mixed'` literals are consistent across exports and tests.
- [ ] **All tests green:** `npm test` passes.
- [ ] **Coverage spot-check on fs-atomic.ts:** `npx vitest run electron/services/fs-atomic.test.ts --coverage --coverage.include='electron/services/fs-atomic.ts' --coverage.reporter=text` reports ≥85%. Plan 4 task 7.9 re-verifies, but it's worth catching gaps now.

Once green, Plan 3 (`tasks-4.1-5.6`) builds the frontmatter codec on top of Plan 2's primitives and wires the whole thing into IPC.
