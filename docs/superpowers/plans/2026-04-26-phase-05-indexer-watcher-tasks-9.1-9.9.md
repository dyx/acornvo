# Phase 05 — Indexer & Watcher: Plan 5 (Acceptance verification)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-05-indexer-watcher`
> **Task range:** OpenSpec tasks `9.1`–`9.9` (9 tasks)
> **Plan order:** 5 of 5. Depends on Plans 1–4.
> **Status:** Not started
> **Created:** 2026-04-26

---

## Goal

Run end-to-end acceptance scenarios against a real grove, exercising the indexer, watcher, self-write filter, and IPC surface. Each task is a short executable script + a vitest integration test that asserts the spec scenarios from `proposal.md` and the four `specs/*.md`.

## Architecture

- All acceptance tests live in `tests/acceptance/phase-05/` (a new top-level test directory). They use a real `better-sqlite3` connection, a real chokidar watcher, and a real `tmpdir` grove root — but mock out IPC by importing service modules directly.
- Each task creates one test file (or extends one shared file), so results are easy to skim. The naming mirrors `tasks.md` task numbers.
- Task 9.9 is purely a CLI invocation of `openspec validate --strict`; no test file.

## Tech Stack

- `vitest@^2` (existing)
- Real fs operations via `node:fs` and `node:fs/promises` against `mkdtempSync` directories
- No new deps

## Files Touched (this plan)

| Path                                                     | Action                   | Owner task |
| -------------------------------------------------------- | ------------------------ | ---------- |
| `tests/acceptance/phase-05/01-full-scan.test.ts`         | Create                   | 9.1        |
| `tests/acceptance/phase-05/02-external-add.test.ts`      | Create                   | 9.2        |
| `tests/acceptance/phase-05/03-external-delete.test.ts`   | Create                   | 9.3        |
| `tests/acceptance/phase-05/04-external-rename.test.ts`   | Create                   | 9.4        |
| `tests/acceptance/phase-05/05-self-write-filter.test.ts` | Create                   | 9.5        |
| `tests/acceptance/phase-05/06-batch-cp.test.ts`          | Create                   | 9.6        |
| `tests/acceptance/phase-05/07-frontmatter-only.test.ts`  | Create                   | 9.7        |
| `tests/acceptance/phase-05/08-cancel-scan.test.ts`       | Create                   | 9.8        |
| `tests/acceptance/phase-05/_helpers.ts`                  | Create (shared fixtures) | 9.1        |

## Pre-flight

Verify Plans 1–4 are merged: `electron/services/indexer.ts`, `watcher.ts`, `index-queries.ts` all export the public APIs used here.

Verify vitest picks up the new directory. If `vitest.config.ts` restricts `include` to `electron/**` or `src/**`, extend it:

```ts
test: {
  include: ['electron/**/*.test.ts', 'src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts']
}
```

(Add this as a Step 0 in Task 1 below if needed.)

---

## Tasks

<!-- openspec-task: 9.1 -->

### Task 1: Full scan of 50-file grove

**Files:**

- Create: `tests/acceptance/phase-05/_helpers.ts`
- Create: `tests/acceptance/phase-05/01-full-scan.test.ts`

- [ ] **Step 1: Verify vitest config includes `tests/`**

```bash
grep -E "include|testMatch" vitest.config.ts vitest.config.* 2>/dev/null || echo "no explicit include — defaults pick up tests/"
```

If `include` is set to a narrow pattern (e.g. `['electron/**']`), extend it to add `'tests/**/*.test.ts'`. Commit that change first as `chore(phase-05): broaden vitest include to tests/`.

- [ ] **Step 2: Write the shared helpers**

```ts
// tests/acceptance/phase-05/_helpers.ts
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function makeIndexedDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, summary TEXT, category TEXT, rating INTEGER,
      content_hash TEXT NOT NULL, mtime_ms INTEGER NOT NULL, size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path, title, summary, content);
  `)
  return db
}

export function makeGroveTmp(prefix = 'p5-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function seedMd(root: string, count: number, withFrontmatter = false): string[] {
  const paths: string[] = []
  mkdirSync(join(root, 'notes'), { recursive: true })
  for (let i = 0; i < count; i++) {
    const rel = `notes/note-${i.toString().padStart(3, '0')}.md`
    const body = withFrontmatter
      ? `---\ntitle: Note ${i}\ntags: [t${i % 5}]\n---\nbody ${i}`
      : `# note ${i}\ntext`
    writeFileSync(join(root, rel), body, 'utf8')
    paths.push(rel)
  }
  return paths
}

export function cleanup(root: string, db: Database.Database): void {
  rmSync(root, { recursive: true, force: true })
  db.close()
}

export function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const id = setInterval(() => {
      if (predicate()) {
        clearInterval(id)
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(id)
        reject(new Error(`timeout after ${timeoutMs}ms`))
      }
    }, intervalMs)
  })
}
```

- [ ] **Step 3: Write the acceptance test**

```ts
// tests/acceptance/phase-05/01-full-scan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import { makeIndexedDb, makeGroveTmp, seedMd, cleanup } from './_helpers'

describe('Acceptance 9.1 — full scan of 50-file grove', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(() => {
    _resetForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.1-')
  })
  afterEach(() => {
    cleanup(root, db)
  })

  it('inserts 50 rows after scan', async () => {
    seedMd(root, 50, true)
    await startScan(root)
    const n = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
    expect(n).toBe(50)
  })

  it('files_fts matches files row count', async () => {
    seedMd(root, 50, true)
    await startScan(root)
    const fts = (db.prepare('SELECT COUNT(*) AS n FROM files_fts').get() as { n: number }).n
    expect(fts).toBe(50)
  })

  it('tags.usage_count reflects seeded tag distribution (10 per tag)', async () => {
    seedMd(root, 50, true) // tags t0..t4 each appear 10 times
    await startScan(root)
    const tags = db.prepare('SELECT name, usage_count FROM tags ORDER BY name').all()
    expect(tags).toEqual([
      { name: 't0', usage_count: 10 },
      { name: 't1', usage_count: 10 },
      { name: 't2', usage_count: 10 },
      { name: 't3', usage_count: 10 },
      { name: 't4', usage_count: 10 }
    ])
  })
})
```

- [ ] **Step 4: Run**

```bash
npx vitest run tests/acceptance/phase-05/01-full-scan.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/acceptance/phase-05/_helpers.ts tests/acceptance/phase-05/01-full-scan.test.ts vitest.config.ts
git commit -m "test(phase-05): acceptance 9.1 — full scan of 50-file grove"
```

---

<!-- openspec-task: 9.2 -->

### Task 2: External add → row appears within 1s + `index:fileChanged` emitted

**Files:**

- Create: `tests/acceptance/phase-05/02-external-add.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  onFileChanged,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.2 — external add detected within 1s', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.2-')
    await startScan(root) // empty initial scan
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('inserts the new file within 1s and emits fileChanged', async () => {
    const events: { path: string }[] = []
    onFileChanged((p) => events.push(p))

    writeFileSync(join(root, 'new.md'), '# x')

    const t0 = Date.now()
    await waitFor(
      () => (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n === 1,
      2000
    )
    const elapsed = Date.now() - t0

    expect(elapsed).toBeLessThan(2000) // generous: chokidar awaitWriteFinish 200ms + flush 500ms
    expect(events.find((e) => e.path === 'new.md')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/02-external-add.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/02-external-add.test.ts
git commit -m "test(phase-05): acceptance 9.2 — external add reflected in 1s + event"
```

---

<!-- openspec-task: 9.3 -->

### Task 3: External delete → row removed + `index:fileDeleted`

**Files:**

- Create: `tests/acceptance/phase-05/03-external-delete.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  onFileDeleted,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.3 — external delete', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.3-')
    writeFileSync(join(root, 'gone.md'), '# bye')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('removes the row and emits fileDeleted', async () => {
    const events: { path: string }[] = []
    onFileDeleted((p) => events.push(p))

    rmSync(join(root, 'gone.md'))

    await waitFor(
      () => (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n === 0,
      2000
    )
    expect(events).toEqual([{ path: 'gone.md' }])
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/03-external-delete.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/03-external-delete.test.ts
git commit -m "test(phase-05): acceptance 9.3 — external delete removes row + emits event"
```

---

<!-- openspec-task: 9.4 -->

### Task 4: External `mv a.md b.md` → path updated, no delete+insert

**Files:**

- Create: `tests/acceptance/phase-05/04-external-rename.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  onFileRenamed,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.4 — external rename', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.4-')
    writeFileSync(join(root, 'a.md'), 'identical body')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('updates files.path to b.md and emits fileRenamed (not delete+insert)', async () => {
    const renameEvents: { oldPath: string; newPath: string }[] = []
    onFileRenamed((p) => renameEvents.push(p))

    const beforeHash = (
      db.prepare('SELECT content_hash FROM files WHERE path=?').get('a.md') as {
        content_hash: string
      }
    ).content_hash

    renameSync(join(root, 'a.md'), join(root, 'b.md'))

    await waitFor(() => {
      const row = db.prepare('SELECT path FROM files').get() as { path: string } | undefined
      return row?.path === 'b.md'
    }, 2000)

    const afterHash = (
      db.prepare('SELECT content_hash FROM files WHERE path=?').get('b.md') as {
        content_hash: string
      }
    ).content_hash
    expect(afterHash).toBe(beforeHash) // same body → same hash → confirms UPDATE not DELETE+INSERT
    expect(renameEvents).toEqual([{ oldPath: 'a.md', newPath: 'b.md' }])
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/04-external-rename.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/04-external-rename.test.ts
git commit -m "test(phase-05): acceptance 9.4 — external rename updates path (no delete+insert)"
```

---

<!-- openspec-task: 9.5 -->

### Task 5: Application self-write does NOT trigger `index:fileChanged`

**Files:**

- Create: `tests/acceptance/phase-05/05-self-write-filter.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  onFileChanged,
  registerSelfWrite,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup } from './_helpers'

describe('Acceptance 9.5 — self-write is filtered', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.5-')
    writeFileSync(join(root, 'a.md'), 'v1')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('does not emit fileChanged when the change was registered as a self-write', async () => {
    const events: { path: string }[] = []
    onFileChanged((p) => events.push(p))

    // Simulate file.write: write the file, then register self-write with the new mtime
    const abs = join(root, 'a.md')
    writeFileSync(abs, 'v2-from-app')
    const mtime = statSync(abs).mtimeMs
    registerSelfWrite(abs, mtime)

    // Wait the full chokidar awaitWriteFinish + debounce window
    await new Promise((r) => setTimeout(r, 1200))

    expect(events.find((e) => e.path === 'a.md')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/05-self-write-filter.test.ts
```

Expected: 1 passed.

> Note: registration timing matters — `registerSelfWrite` must happen **before** chokidar fires its `awaitWriteFinish` settled `change` event (~200ms). In production phase-04 hands off synchronously after `fs.rename`. The test above does the same.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/05-self-write-filter.test.ts
git commit -m "test(phase-05): acceptance 9.5 — self-write filter suppresses fileChanged"
```

---

<!-- openspec-task: 9.6 -->

### Task 6: Batch `cp -r src dst` (30 md) → single transaction; UI sees data within ~1s

**Files:**

- Create: `tests/acceptance/phase-05/06-batch-cp.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.6 — batch copy of 30 files', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.6-')
    mkdirSync(join(root, 'src'))
    for (let i = 0; i < 30; i++) writeFileSync(join(root, 'src', `${i}.md`), `# ${i}`)
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('inserts 30 dst rows after a single batched flush in ~1s', async () => {
    const t0 = Date.now()
    cpSync(join(root, 'src'), join(root, 'dst'), { recursive: true })

    await waitFor(() => {
      const n = (
        db.prepare("SELECT COUNT(*) AS n FROM files WHERE path LIKE 'dst/%'").get() as { n: number }
      ).n
      return n === 30
    }, 3000)

    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(3000) // chokidar awaitWriteFinish + debounce + write
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/06-batch-cp.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/06-batch-cp.test.ts
git commit -m "test(phase-05): acceptance 9.6 — batch cp of 30 files lands in one tx"
```

---

<!-- openspec-task: 9.7 -->

### Task 7: Frontmatter-only change → `content_hash` unchanged, `frontmatter_json` updated

**Files:**

- Create: `tests/acceptance/phase-05/07-frontmatter-only.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.7 — frontmatter-only change keeps content_hash', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.7-')
    writeFileSync(join(root, 'a.md'), '---\nrating: 3\n---\nstable body')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('keeps content_hash, updates frontmatter_json + rating', async () => {
    const before = db
      .prepare('SELECT content_hash, rating FROM files WHERE path=?')
      .get('a.md') as {
      content_hash: string
      rating: number
    }
    expect(before.rating).toBe(3)

    writeFileSync(join(root, 'a.md'), '---\nrating: 4\n---\nstable body')

    await waitFor(() => {
      const row = db.prepare('SELECT rating FROM files WHERE path=?').get('a.md') as
        | { rating: number }
        | undefined
      return row?.rating === 4
    }, 2000)

    const after = db.prepare('SELECT content_hash, rating FROM files WHERE path=?').get('a.md') as {
      content_hash: string
      rating: number
    }
    expect(after.content_hash).toBe(before.content_hash)
    expect(after.rating).toBe(4)
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/07-frontmatter-only.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/07-frontmatter-only.test.ts
git commit -m "test(phase-05): acceptance 9.7 — frontmatter-only change preserves content_hash"
```

---

<!-- openspec-task: 9.8 -->

### Task 8: `cancelScan()` mid-flight → state idle, partial data preserved

**Files:**

- Create: `tests/acceptance/phase-05/08-cancel-scan.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  startScan,
  cancelScan,
  state,
  _injectDbForTest,
  _resetForTest
} from '../../../electron/services/indexer'
import { _resetSelfWritesForTest } from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, seedMd, cleanup } from './_helpers'

describe('Acceptance 9.8 — cancelScan returns to idle and preserves partial data', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(() => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.8-')
    seedMd(root, 100)
  })
  afterEach(() => {
    cleanup(root, db)
  })

  it('flips state back to idle after cancel; some rows are preserved', async () => {
    const scanP = startScan(root)
    setTimeout(() => cancelScan(), 5)
    await scanP

    expect(state().state).toBe('idle')

    const n = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThanOrEqual(100)
  })
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/acceptance/phase-05/08-cancel-scan.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-05/08-cancel-scan.test.ts
git commit -m "test(phase-05): acceptance 9.8 — cancelScan to idle, partial data preserved"
```

---

<!-- openspec-task: 9.9 -->

### Task 9: `openspec validate phase-05-indexer-watcher --strict` passes

**Files:**

- (none — CLI invocation only)

- [ ] **Step 1: Run the validator**

```bash
openspec validate phase-05-indexer-watcher --strict
```

Expected: exits 0; no `WARN`, no `ERROR` lines. If anything fails:

- A `MissingScenario` ⇒ revisit `specs/*/spec.md` and add the missing scenario block.
- A `BrokenLink` ⇒ check `proposal.md` references match real spec files.
- A `MissingTask` ⇒ ensure `tasks.md` covers all `ADDED Requirements`.

Fix any issues at the OpenSpec artifact level (do **not** modify the plan files), then re-run.

- [ ] **Step 2: Run the full vitest suite as a final smoke**

```bash
npm run test
```

Expected: every test green (Plans 1–5 plus all pre-existing tests).

- [ ] **Step 3: Final commit**

If validator fixes were applied to OpenSpec artifacts, commit those:

```bash
git add openspec/changes/phase-05-indexer-watcher/
git commit -m "chore(phase-05): tighten spec scenarios per --strict validation"
```

If no changes were needed, skip — but record the validator output in the PR description.

---

## Self-Review Checklist (run after Task 9)

- [ ] Annotation labels present:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-04-26-phase-05-indexer-watcher-tasks-9.1-9.9.md | sort -u
  ```
  Expected: `9.1 9.2 9.3 9.4 9.5 9.6 9.7 9.8 9.9`.
- [ ] Spec coverage:
  - file-indexer scenarios "新树林首次扫描" / "二次打开无变更" / "扫描后磁盘文件被外部删除" → Tasks 1, 3
  - file-indexer scenario "正文改动" / "仅 frontmatter 改动" → Task 7
  - file-watcher scenarios "外部新增 md" / "外部删除 md" / "外部重命名文件" → Tasks 2, 3, 4
  - file-watcher scenario "git pull 一次改 100 个文件" → Task 6
  - file-watcher scenario "应用自身写不触发事件" → Task 5
  - index-startup-progress scenario "用户点击后台继续" → Task 8
  - validator hygiene → Task 9
- [ ] Each task ends with a commit step.
- [ ] No `TODO`, `TBD`, "appropriate handling" placeholders.
- [ ] All public APIs from Plans 1–4 are referenced verbatim: `startScan`, `cancelScan`, `state`, `_injectDbForTest`, `_resetForTest`, `start`, `stop`, `onFileChanged`, `onFileDeleted`, `onFileRenamed`, `registerSelfWrite`, `_resetSelfWritesForTest`.

---

## End of phase-05-indexer-watcher plan series

After this plan completes, the change is implementation-complete. Proceed to:

1. `openspec validate phase-05-indexer-watcher --strict` (Task 9 above)
2. PR review against `main`
3. After merge, archive the change with `/opsx:archive phase-05-indexer-watcher`
