# Phase 18 — Foundation (Migration + Logger + Perf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plan Index:** 1 of 5 for `phase-18-observability-and-packaging`
**OpenSpec tasks covered:** 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4

**Status:** Ready
**Last Updated:** 2026-05-09
**Plan branch:** `phase-19-ui-remediation` (Phase 18 work continues on this branch per current setup)

**Sources:**

- `openspec/changes/phase-18-observability-and-packaging/proposal.md`
- `openspec/changes/phase-18-observability-and-packaging/design.md` (D1, D2, D11)
- `openspec/changes/phase-18-observability-and-packaging/tasks.md` (§1, §2, §3)
- `openspec/changes/phase-18-observability-and-packaging/specs/observability-logger/spec.md`
- `openspec/changes/phase-18-observability-and-packaging/specs/observability-perf/spec.md`

**Out of scope:**

- Crash reporter, diagnostic bundle (Plan 2)
- Observability UI page (Plan 2)
- About / Update / Telemetry (Plan 3)
- Packaging / CI release (Plan 4)
- Verification (Plan 5)

**Open issues:**

- The OpenSpec doc says `010_perf_samples.sql`, but slot `010` is taken by Phase 16's `010_sessions.sql`. We use `011_perf_samples.sql` with `user_version = 11`. The OpenSpec spec text remains authoritative for behavior; only the version number diverges. Capture this in the migration's header comment so anyone reading later spots it.

---

## Goal

Establish the foundation for Phase 18 observability: a new SQLite migration (perf_samples + telemetry_local + ops_log index), a JSON-Lines structured logger, and a perf-sampling module — all wired into the existing main-process bootstrap.

## Architecture

- **Logger:** `electron/obs/logger.ts` exports a typed `logger` with `debug/info/warn/error(area, payload)` writing newline-delimited JSON to `<userData>/logs/app-YYYY-MM-DD.log`. Reuses `electron-log` only for path resolution & rotate; emit format is JSON Lines so the existing free-text `electron/services/logger.ts` (Phase 13) stays untouched and can be migrated file-by-file.
- **Perf:** `electron/obs/perf.ts` exports `perf.start(area, meta) → end({ ok, meta })` that inserts a row into `perf_samples` via the shared db. Bounded (100k rows; trim to 80k on boot).
- **Migration:** `011_perf_samples.sql` adds `perf_samples`, `telemetry_local`, and `idx_ops_log_ts`; bumps `user_version` to `11`.

## Tech Stack

- Node `node:fs/promises`, `node:path`, `node:os`
- Electron `app.getPath('userData')` for log dir
- `better-sqlite3` for DB writes
- `electron-log` (already in deps) for file-rotate primitives
- `vitest` + `jsdom` for tests

---

<!-- openspec-task: 1.1 -->

### Task 1: Add migration 011_perf_samples.sql

**Files:**

- Create: `electron/services/db/migrations/011_perf_samples.sql`
- Create: `electron/services/db/migrations/011_perf_samples.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/services/db/migrations/011_perf_samples.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '../migrations'

const MIG_DIR = join(__dirname)

describe('migration 011_perf_samples', () => {
  it('creates perf_samples, telemetry_local, idx_ops_log_ts and bumps user_version to 11', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIG_DIR)
    expect(db.pragma('user_version', { simple: true })).toBe(11)

    const cols = (table: string): string[] =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name)

    expect(cols('perf_samples')).toEqual(
      expect.arrayContaining(['id', 'ts', 'area', 'ok', 'ms', 'meta'])
    )
    expect(cols('telemetry_local')).toEqual(
      expect.arrayContaining(['id', 'day', 'metric', 'value'])
    )

    const idx = (db.prepare(`PRAGMA index_list(ops_log)`).all() as { name: string }[]).map(
      (r) => r.name
    )
    expect(idx).toContain('idx_ops_log_ts')

    const idx2 = (db.prepare(`PRAGMA index_list(perf_samples)`).all() as { name: string }[]).map(
      (r) => r.name
    )
    expect(idx2).toContain('idx_perf_area_ts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/services/db/migrations/011_perf_samples.test.ts`
Expected: FAIL — migration file does not exist; `perf_samples` table missing.

- [ ] **Step 3: Write the migration SQL**

```sql
-- electron/services/db/migrations/011_perf_samples.sql
-- Phase 18 — perf sampling + local telemetry + ops_log index.
-- NOTE: OpenSpec proposal originally numbered this 010_perf_samples;
--       slot 010 was already taken by Phase 16 (010_sessions.sql),
--       so we ship as 011 with user_version = 11.

CREATE TABLE IF NOT EXISTS perf_samples (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   TEXT    NOT NULL,
  area TEXT    NOT NULL,
  ok   INTEGER NOT NULL,
  ms   INTEGER NOT NULL,
  meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_perf_area_ts ON perf_samples(area, ts);

CREATE TABLE IF NOT EXISTS telemetry_local (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  day    TEXT    NOT NULL,
  metric TEXT    NOT NULL,
  value  REAL    NOT NULL,
  meta   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_telemetry_day_metric ON telemetry_local(day, metric);

CREATE INDEX IF NOT EXISTS idx_ops_log_ts ON ops_log(ts);

PRAGMA user_version = 11;
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run electron/services/db/migrations/011_perf_samples.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the migration is shipped to `out/main`**

Run: `node scripts/copy-sql-migrations.mjs && ls out/main/011_perf_samples.sql`
Expected: file exists in `out/main/`.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/011_perf_samples.sql electron/services/db/migrations/011_perf_samples.test.ts
git commit -m "feat(db): migration 011 perf_samples + telemetry_local + ops_log index"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Add license-checker dev dependency

**Files:**

- Modify: `package.json` (devDependencies)
- Modify: `package-lock.json` (auto-generated)

Note: `electron-builder`, `electron-updater`, and `electron-log` are already deps. Only `license-checker` is missing per the OpenSpec task.

- [ ] **Step 1: Install the dependency**

Run: `npm install --save-dev license-checker`
Expected: `package.json` `devDependencies.license-checker` set; `package-lock.json` updated.

- [ ] **Step 2: Verify install**

Run: `npx license-checker --version`
Expected: prints a version number (≥ 25.x).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add license-checker for build-time license report"
```

---

<!-- openspec-task: 2.1 -->

### Task 3: Implement `electron/obs/logger.ts` (JSON Lines)

**Files:**

- Create: `electron/obs/logger.ts`
- Create: `electron/obs/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/logger.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'obs-logger-'))

vi.mock('electron', () => ({
  app: { getPath: (key: string) => (key === 'userData' ? tempBase : tempBase) }
}))

import { createLogger, __resetLoggerForTests } from './logger'

describe('obs logger (JSON Lines)', () => {
  beforeEach(() => __resetLoggerForTests())
  afterEach(() => {
    /* keep tmp dir until process exit */
  })

  it('writes one JSON Line per record with required fields', () => {
    const log = createLogger({ now: () => new Date('2026-05-09T03:04:05.000Z') })
    log.info('clipper', { op: 'save', ok: true, ms: 12, meta: { url: 'https://x' } })
    log.warn('agent', { op: 'step', ok: false, ms: 901, msg: 'rate limited' })

    const files = readdirSync(join(tempBase, 'logs')).filter((f) => f.endsWith('.log'))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^app-2026-05-09\.log$/)

    const lines = readFileSync(join(tempBase, 'logs', files[0]), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
    const r0 = JSON.parse(lines[0])
    expect(r0).toMatchObject({
      level: 'info',
      area: 'clipper',
      op: 'save',
      ok: true,
      ms: 12,
      meta: { url: 'https://x' }
    })
    expect(typeof r0.ts).toBe('string')
    expect(r0.ts.startsWith('2026-05-09T')).toBe(true)
  })

  afterAll(() => rmSync(tempBase, { recursive: true, force: true }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/logger.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the logger**

```ts
// electron/obs/logger.ts
import { app } from 'electron'
import { mkdirSync, appendFileSync, statSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogPayload {
  op?: string
  ok?: boolean
  ms?: number
  msg?: string
  meta?: Record<string, unknown>
}

export interface LogEntry extends LogPayload {
  ts: string
  level: LogLevel
  area: string
}

export interface Logger {
  debug: (area: string, payload?: LogPayload) => void
  info: (area: string, payload?: LogPayload) => void
  warn: (area: string, payload?: LogPayload) => void
  error: (area: string, payload?: LogPayload) => void
}

const TEN_MB = 10 * 1024 * 1024

interface LoggerOpts {
  now?: () => Date
  dir?: string
  mirrorConsole?: boolean
}

let cached: Logger | null = null

export function __resetLoggerForTests(): void {
  cached = null
}

export function getLogDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function todayUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rotateIfNeeded(filePath: string): string {
  if (!existsSync(filePath)) return filePath
  let size = 0
  try {
    size = statSync(filePath).size
  } catch {
    return filePath
  }
  if (size < TEN_MB) return filePath
  // Rotate: app-YYYY-MM-DD.log → app-YYYY-MM-DD.<n>.log
  let n = 1
  while (existsSync(filePath.replace(/\.log$/, `.${n}.log`))) n += 1
  renameSync(filePath, filePath.replace(/\.log$/, `.${n}.log`))
  return filePath
}

export function createLogger(opts: LoggerOpts = {}): Logger {
  const now = opts.now ?? (() => new Date())
  const dir = opts.dir ?? getLogDir()
  mkdirSync(dir, { recursive: true })

  function write(level: LogLevel, area: string, payload: LogPayload = {}): void {
    const d = now()
    const filePath = rotateIfNeeded(join(dir, `app-${todayUtc(d)}.log`))
    const entry: LogEntry = { ts: d.toISOString(), level, area, ...payload }
    try {
      appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8')
    } catch {
      // last-resort console
      // eslint-disable-next-line no-console
      console.error('[logger] write failed', entry)
    }
    if (opts.mirrorConsole) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](`[${area}]`, payload)
    }
  }

  return {
    debug: (a, p) => write('debug', a, p),
    info: (a, p) => write('info', a, p),
    warn: (a, p) => write('warn', a, p),
    error: (a, p) => write('error', a, p)
  }
}

export function logger(): Logger {
  if (cached) return cached
  cached = createLogger({ mirrorConsole: process.env.NODE_ENV === 'development' })
  return cached
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run electron/obs/logger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/obs/logger.ts electron/obs/logger.test.ts
git commit -m "feat(obs): JSON Lines logger with daily files and 10MB shard rotation"
```

---

<!-- openspec-task: 2.2 -->

### Task 4: Implement boot-time rotate (7-day + 50MB → 40MB)

**Files:**

- Modify: `electron/obs/logger.ts` (add `rotateOnBoot()` export)
- Create: `electron/obs/logger.rotate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/logger.rotate.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'obs-rotate-'))
const logDir = join(tempBase, 'logs')

vi.mock('electron', () => ({
  app: { getPath: () => tempBase }
}))

import { rotateOnBoot } from './logger'

describe('rotateOnBoot', () => {
  it('deletes files older than 7 days and trims total to <= 40MB starting from oldest', () => {
    mkdirSync(logDir, { recursive: true })
    const now = Date.now()
    // Old file (10 days)
    const old = join(logDir, 'app-2026-04-29.log')
    writeFileSync(old, 'x')
    const tenDaysAgo = (now - 10 * 86400 * 1000) / 1000
    utimesSync(old, tenDaysAgo, tenDaysAgo)

    // 6 fresh files of ~10MB each = 60MB total
    for (let i = 0; i < 6; i += 1) {
      writeFileSync(join(logDir, `app-fresh-${i}.log`), Buffer.alloc(10 * 1024 * 1024))
    }

    rotateOnBoot({ now: () => new Date(now) })

    const remaining = readdirSync(logDir)
    expect(remaining).not.toContain('app-2026-04-29.log')

    const total = remaining.reduce((sum, f) => sum + statSync(join(logDir, f)).size, 0)
    expect(total).toBeLessThanOrEqual(40 * 1024 * 1024)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/logger.rotate.test.ts`
Expected: FAIL — `rotateOnBoot` not exported.

- [ ] **Step 3: Implement `rotateOnBoot`**

Append to `electron/obs/logger.ts`:

```ts
import { readdirSync, unlinkSync } from 'node:fs'

const SEVEN_DAYS_MS = 7 * 86400 * 1000
const FIFTY_MB = 50 * 1024 * 1024
const FORTY_MB = 40 * 1024 * 1024

export function rotateOnBoot(opts: { now?: () => Date; dir?: string } = {}): void {
  const now = (opts.now ?? (() => new Date()))().getTime()
  const dir = opts.dir ?? getLogDir()
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.log'))
  } catch {
    return
  }

  // Phase 1: drop files older than 7 days.
  for (const f of files) {
    try {
      const st = statSync(join(dir, f))
      if (now - st.mtimeMs > SEVEN_DAYS_MS) {
        unlinkSync(join(dir, f))
      }
    } catch {
      /* ignore */
    }
  }

  // Phase 2: if total > 50MB, delete oldest until <= 40MB.
  const survivors = readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => {
      const full = join(dir, f)
      const st = statSync(full)
      return { f, full, mtime: st.mtimeMs, size: st.size }
    })
    .sort((a, b) => a.mtime - b.mtime)

  let total = survivors.reduce((s, r) => s + r.size, 0)
  if (total <= FIFTY_MB) return
  for (const r of survivors) {
    if (total <= FORTY_MB) break
    try {
      unlinkSync(r.full)
      total -= r.size
    } catch {
      /* ignore */
    }
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run electron/obs/logger.rotate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/obs/logger.ts electron/obs/logger.rotate.test.ts
git commit -m "feat(obs): boot rotate (7-day expiry + 50MB→40MB cap)"
```

---

<!-- openspec-task: 2.3 -->

### Task 5: Replace `console.*` in key areas with structured logger

**Files:**

- Modify: `electron/services/indexer.ts` (replace `console.warn/error` with `logger.warn/error('indexer', ...)`)
- Modify: `electron/clipper/*.ts` (top-level — search for `console.`)
- Modify: `electron/ai/**/*.ts`
- Modify: `electron/agent/**/*.ts`
- Modify: `electron/queue/runner.ts`, `electron/queue/store.ts`
- Modify: `electron/main.ts` / `electron/bootstrap.ts`
- Modify: `electron/update/updater.ts` (only if it exists yet — Plan 3 creates it; otherwise skip)

- [ ] **Step 1: Identify candidates**

Run: `git grep -n "console\." electron/services electron/clipper electron/ai electron/agent electron/queue electron/main.ts electron/bootstrap.ts | grep -v "\.test\." | grep -v "console.assert" | wc -l`
Record the count and examples. Expected: a non-zero list (Phase 13 free-form `electron/services/logger.ts` already wraps some — this task is about direct `console.*` calls in business logic).

- [ ] **Step 2: Pick a representative file and write a smoke test**

Choose `electron/queue/runner.ts`. Add a smoke test asserting that on a runner-handler error, the structured logger receives an `error` call with `area='queue'` and a non-empty `meta.error`.

```ts
// electron/queue/runner.logger.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/obs/logger', () => {
  const calls: unknown[] = []
  return {
    logger: () => ({
      debug: (a: string, p: unknown) => calls.push(['debug', a, p]),
      info: (a: string, p: unknown) => calls.push(['info', a, p]),
      warn: (a: string, p: unknown) => calls.push(['warn', a, p]),
      error: (a: string, p: unknown) => calls.push(['error', a, p])
    }),
    __calls: calls
  }
})

import * as loggerMod from '@/obs/logger'
import { runOnce } from './runner'

describe('queue runner uses structured logger on error', () => {
  beforeEach(() => {
    ;(loggerMod as unknown as { __calls: unknown[][] }).__calls.length = 0
  })

  it('emits area="queue" error on handler failure', async () => {
    // Arrange a fake job that throws (use existing test fixtures pattern).
    // The exact arrangement depends on store.ts shape; copy from queue/runner.test.ts.
    // ... omitted for brevity; mirror existing failure scenario ...
    // Act: await runOnce(...)
    const calls = (loggerMod as unknown as { __calls: unknown[][] }).__calls
    expect(calls.some((c) => c[0] === 'error' && c[1] === 'queue')).toBe(true)
  })
})
```

(If your existing `queue/runner.test.ts` already drives a failure path, prefer extending it instead of a parallel file.)

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run electron/queue/runner.logger.test.ts`
Expected: FAIL — no logger calls captured because runner still uses `console.*`.

- [ ] **Step 4: Migrate `electron/queue/runner.ts`**

Replace each direct `console.warn(...)` / `console.error(...)` with:

```ts
import { logger } from '@/obs/logger'
// ...
logger().error('queue', {
  op: 'run',
  ok: false,
  msg: err instanceof Error ? err.message : String(err),
  meta: { jobId: job.id, kind: job.kind }
})
```

Apply the same pattern to: `electron/services/indexer.ts` (`area: 'indexer'`), `electron/clipper/*.ts` (`'clipper'`), `electron/ai/**/*.ts` (`'ai'`), `electron/agent/**/*.ts` (`'agent'`), `electron/queue/store.ts` (`'queue'`), `electron/main.ts` / `electron/bootstrap.ts` (`'app'`).

Keep `electron/services/logger.ts` (the legacy free-text logger) **untouched** for now — Phase 18 deliberately runs both side-by-side; full deprecation is out of scope.

- [ ] **Step 5: Run the smoke test**

Run: `npx vitest run electron/queue/runner.logger.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: PASS (no regressions). Triage any new failures: usually they are tests that asserted on `console.error` mocks; rewrite those tests to assert against the `@/obs/logger` mock instead.

- [ ] **Step 7: Commit**

```bash
git add electron/queue/runner.ts electron/queue/runner.logger.test.ts electron/services/indexer.ts electron/clipper electron/ai electron/agent electron/main.ts electron/bootstrap.ts electron/queue/store.ts
git commit -m "refactor(obs): replace console.* with structured logger in key areas"
```

---

<!-- openspec-task: 2.4 -->

### Task 6: Mirror to stdout in dev, file-only in prod

**Files:**

- Modify: `electron/obs/logger.ts` (already wired via `mirrorConsole` option in Task 3 — verify gating)
- Modify: `electron/main.ts` or `electron/bootstrap.ts` to call `rotateOnBoot()` and seed `logger()` early

- [ ] **Step 1: Write failing test for production gating**

```ts
// electron/obs/logger.env.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('logger mirror gating', () => {
  const origEnv = process.env.NODE_ENV
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    process.env.NODE_ENV = origEnv
  })

  it('does not mirror to console in production', async () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { logger, __resetLoggerForTests } = await import('./logger')
    __resetLoggerForTests()
    logger().info('app', { op: 'boot' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('mirrors to console in development', async () => {
    process.env.NODE_ENV = 'development'
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { logger, __resetLoggerForTests } = await import('./logger')
    __resetLoggerForTests()
    logger().info('app', { op: 'boot' })
    expect(spy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify dev case fails**

Run: `npx vitest run electron/obs/logger.env.test.ts`
Expected: PROD test passes, DEV test passes if Task 3 wiring is correct. Fix any gaps.

- [ ] **Step 3: Wire boot rotate + early logger init in main**

Edit `electron/main.ts` (or `electron/bootstrap.ts` — pick whichever runs first on `app.whenReady`). Add at the very top of the boot sequence:

```ts
import { logger, rotateOnBoot } from '@/obs/logger'

// ... inside whenReady() before any other init:
rotateOnBoot()
logger().info('app', { op: 'boot', meta: { ts: new Date().toISOString() } })
```

- [ ] **Step 4: Run app once and verify boot line lands on disk**

Run: `npm run dev`
Manual check: in another terminal, `tail -n 1 ~/Library/Application\ Support/acornvo/logs/app-*.log` (path depends on `app.getPath('userData')`).
Expected: a JSON Line whose `area: "app", op: "boot"`.

- [ ] **Step 5: Commit**

```bash
git add electron/obs/logger.ts electron/obs/logger.env.test.ts electron/main.ts electron/bootstrap.ts
git commit -m "feat(obs): boot logger init + dev-only console mirror"
```

---

<!-- openspec-task: 3.1 -->

### Task 7: Implement `electron/obs/perf.ts` with start/end + DB write

**Files:**

- Create: `electron/obs/perf.ts`
- Create: `electron/obs/perf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/perf.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '@/services/db/migrations'
import { createPerf } from './perf'

const MIG_DIR = join(process.cwd(), 'electron/services/db/migrations')

describe('perf.start / end', () => {
  it('writes a row to perf_samples with ms ≥ 0 and meta JSON-stringified', async () => {
    const db = new Database(':memory:')
    runMigrations(db, MIG_DIR)
    const perf = createPerf({ db, now: makeStubClock([0, 12]) })
    const end = perf.start('search.query', { sessionId: 's1' })
    end({ ok: true, meta: { hits: 7 } })

    const row = db.prepare(`SELECT * FROM perf_samples`).get() as {
      area: string
      ok: number
      ms: number
      meta: string
    }
    expect(row.area).toBe('search.query')
    expect(row.ok).toBe(1)
    expect(row.ms).toBe(12)
    expect(JSON.parse(row.meta)).toEqual({ sessionId: 's1', hits: 7 })
  })
})

function makeStubClock(seq: number[]): () => number {
  let i = 0
  return () => seq[Math.min(i++, seq.length - 1)]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/perf.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement perf**

```ts
// electron/obs/perf.ts
import type Database from 'better-sqlite3'

export interface PerfStartMeta {
  [k: string]: unknown
}

export interface PerfEndArgs {
  ok: boolean
  meta?: PerfStartMeta
}

export interface PerfDeps {
  db: Database.Database
  now?: () => number
}

export interface Perf {
  start: (area: string, meta?: PerfStartMeta) => (args: PerfEndArgs) => void
}

export function createPerf(deps: PerfDeps): Perf {
  const now = deps.now ?? (() => Date.now())
  const ins = deps.db.prepare(
    `INSERT INTO perf_samples (ts, area, ok, ms, meta) VALUES (?, ?, ?, ?, ?)`
  )

  return {
    start(area, startMeta = {}) {
      const t0 = now()
      return ({ ok, meta = {} }) => {
        const t1 = now()
        const ms = Math.max(0, t1 - t0)
        const merged = { ...startMeta, ...meta }
        ins.run(new Date().toISOString(), area, ok ? 1 : 0, ms, JSON.stringify(merged))
      }
    }
  }
}

let cached: Perf | null = null

export function setPerfInstance(p: Perf): void {
  cached = p
}

export function perf(): Perf {
  if (!cached) throw new Error('perf not initialized — call setPerfInstance during boot')
  return cached
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run electron/obs/perf.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `setPerfInstance` in boot**

Modify `electron/bootstrap.ts` (or wherever the shared db handle is built) to set the singleton:

```ts
import { createPerf, setPerfInstance } from '@/obs/perf'
// ... after db handle is ready:
setPerfInstance(createPerf({ db }))
```

- [ ] **Step 6: Commit**

```bash
git add electron/obs/perf.ts electron/obs/perf.test.ts electron/bootstrap.ts
git commit -m "feat(obs): perf.start/end with perf_samples writer"
```

---

<!-- openspec-task: 3.2 -->

### Task 8: Instrument key paths with perf

**Files:**

- Modify: `electron/services/indexer.ts` (`indexer.scan`, `indexer.update`)
- Modify: `electron/clipper/*` save path (`clipper.save`)
- Modify: `electron/clipper/*` AI review path (`clipper.ai-review`)
- Modify: `electron/agent/**` per-step LLM caller (`agent.step`)
- Modify: `electron/services/search/*` query entry (`search.query`)
- Modify: `electron/ipc/project.ts` open handler (`project.open`)

- [ ] **Step 1: Write failing test for one site (search.query)**

```ts
// electron/services/search/search.perf.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '@/services/db/migrations'
import { createPerf, setPerfInstance } from '@/obs/perf'
import { runQuery } from './query' // adjust to actual entry

describe('search.query is instrumented', () => {
  it('writes a perf_samples row with area="search.query"', async () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    setPerfInstance(createPerf({ db }))
    await runQuery('hello world', { db })
    const row = db.prepare(`SELECT area FROM perf_samples`).get() as { area: string }
    expect(row.area).toBe('search.query')
  })
})
```

(Adjust import paths to match the actual search query entry; if there is no clean function boundary today, refactor the entry to take an optional `db` arg.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/services/search/search.perf.test.ts`
Expected: FAIL — no row written.

- [ ] **Step 3: Add the instrumentation**

Pattern to apply at every site:

```ts
import { perf } from '@/obs/perf'

const end = perf().start('search.query', {
  /* contextual meta */
})
try {
  const result = doWork()
  end({ ok: true, meta: { count: result.length } })
  return result
} catch (err) {
  end({ ok: false, meta: { error: (err as Error).message } })
  throw err
}
```

Apply at the six sites listed under **Files**. Areas exactly: `project.open`, `indexer.scan`, `indexer.update`, `clipper.save`, `clipper.ai-review`, `agent.step`, `search.query`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/services/search/search.perf.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/indexer.ts electron/clipper electron/agent electron/services/search electron/ipc/project.ts electron/services/search/search.perf.test.ts
git commit -m "feat(obs): instrument key paths (project.open / indexer / clipper / agent / search) with perf"
```

---

<!-- openspec-task: 3.3 -->

### Task 9: Implement perf_samples roll-cleanup (>100k → 80k)

**Files:**

- Modify: `electron/obs/perf.ts` (add `trimPerfSamples()`)
- Create: `electron/obs/perf.trim.test.ts`
- Modify: `electron/bootstrap.ts` to call `trimPerfSamples()` once on boot

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/perf.trim.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '@/services/db/migrations'
import { trimPerfSamples } from './perf'

describe('trimPerfSamples', () => {
  it('keeps only newest 80000 rows when total exceeds 100000', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    const ins = db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES (?, ?, 1, 1)`)
    const tx = db.transaction(() => {
      for (let i = 0; i < 100100; i += 1) {
        ins.run(new Date(2026, 0, 1, 0, 0, i).toISOString(), 'test')
      }
    })
    tx()

    trimPerfSamples({ db })

    const count = db.prepare(`SELECT COUNT(*) AS n FROM perf_samples`).get() as { n: number }
    expect(count.n).toBe(80000)
  })

  it('is a no-op below the 100k threshold', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    const ins = db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES (?, ?, 1, 1)`)
    for (let i = 0; i < 5; i += 1) ins.run(new Date(2026, 0, 1, 0, 0, i).toISOString(), 'test')
    trimPerfSamples({ db })
    const count = db.prepare(`SELECT COUNT(*) AS n FROM perf_samples`).get() as { n: number }
    expect(count.n).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/perf.trim.test.ts`
Expected: FAIL — `trimPerfSamples` not exported.

- [ ] **Step 3: Implement `trimPerfSamples`**

Append to `electron/obs/perf.ts`:

```ts
const PERF_HARD_CAP = 100_000
const PERF_SOFT_CAP = 80_000

export function trimPerfSamples(deps: { db: Database.Database }): void {
  const { db } = deps
  const row = db.prepare(`SELECT COUNT(*) AS n FROM perf_samples`).get() as { n: number }
  if (row.n <= PERF_HARD_CAP) return
  // Keep newest PERF_SOFT_CAP rows.
  db.prepare(
    `DELETE FROM perf_samples WHERE id IN (
       SELECT id FROM perf_samples ORDER BY id ASC LIMIT ?
     )`
  ).run(row.n - PERF_SOFT_CAP)
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/obs/perf.trim.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire in boot**

Edit `electron/bootstrap.ts` after `setPerfInstance(...)`:

```ts
import { trimPerfSamples } from '@/obs/perf'
// ...
trimPerfSamples({ db })
```

- [ ] **Step 6: Commit**

```bash
git add electron/obs/perf.ts electron/obs/perf.trim.test.ts electron/bootstrap.ts
git commit -m "feat(obs): trim perf_samples to 80k on boot when above 100k"
```

---

<!-- openspec-task: 3.4 -->

### Task 10: Implement `getAggregates(area, window)` (P50 / P95 / successRate / count)

**Files:**

- Modify: `electron/obs/perf.ts` (add `getAggregates`)
- Create: `electron/obs/perf.agg.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/perf.agg.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '@/services/db/migrations'
import { getAggregates } from './perf'

describe('getAggregates', () => {
  it('returns P50, P95, successRate, count for a window', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    const ins = db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES (?, ?, ?, ?)`)
    const now = new Date('2026-05-09T12:00:00.000Z')
    // 10 samples, ms = 10..100 step 10, all ok
    for (let i = 1; i <= 10; i += 1) {
      ins.run(new Date(now.getTime() - i * 60_000).toISOString(), 'search.query', 1, i * 10)
    }
    // 1 failure
    ins.run(now.toISOString(), 'search.query', 0, 999)

    const agg = getAggregates({
      db,
      area: 'search.query',
      windowMs: 24 * 3600 * 1000,
      now: () => now
    })
    expect(agg.count).toBe(11)
    // P50 of [10,20,…,100,999] sorted → index 5 → 60
    expect(agg.p50).toBeGreaterThanOrEqual(50)
    expect(agg.p50).toBeLessThanOrEqual(70)
    expect(agg.p95).toBeGreaterThanOrEqual(100)
    expect(agg.successRate).toBeCloseTo(10 / 11, 2)
  })

  it('returns zeros when no rows in window', () => {
    const db = new Database(':memory:')
    runMigrations(db, join(process.cwd(), 'electron/services/db/migrations'))
    const agg = getAggregates({ db, area: 'search.query', windowMs: 3600 * 1000 })
    expect(agg).toEqual({ count: 0, p50: 0, p95: 0, successRate: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/perf.agg.test.ts`
Expected: FAIL — `getAggregates` not exported.

- [ ] **Step 3: Implement `getAggregates`**

Append to `electron/obs/perf.ts`:

```ts
export interface AggDeps {
  db: Database.Database
  area: string
  windowMs: number
  now?: () => Date
}

export interface Aggregates {
  count: number
  p50: number
  p95: number
  successRate: number
}

export function getAggregates(deps: AggDeps): Aggregates {
  const now = (deps.now ?? (() => new Date()))()
  const since = new Date(now.getTime() - deps.windowMs).toISOString()
  const rows = deps.db
    .prepare(`SELECT ms, ok FROM perf_samples WHERE area = ? AND ts >= ? ORDER BY ms ASC`)
    .all(deps.area, since) as { ms: number; ok: number }[]

  if (rows.length === 0) return { count: 0, p50: 0, p95: 0, successRate: 0 }

  const ms = rows.map((r) => r.ms)
  const okCount = rows.reduce((s, r) => s + (r.ok ? 1 : 0), 0)
  return {
    count: rows.length,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
    successRate: okCount / rows.length
  }
}

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length))
  return sortedAsc[idx]
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/obs/perf.agg.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/obs/perf.ts electron/obs/perf.agg.test.ts
git commit -m "feat(obs): perf getAggregates(area, window) → P50/P95/successRate/count"
```

---

## Self-Review Checklist (run before handing plan off)

- [ ] All 10 OpenSpec labels (1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4) appear as `<!-- openspec-task: N.M -->` annotations directly above their corresponding `### Task N:` headings.
- [ ] No "TBD" / "TODO" / "fill in later" placeholders in code blocks.
- [ ] Every `Run:` step lists an explicit command and expected outcome.
- [ ] Migration version 011 (not 010) is used; comment in SQL header explains why.
- [ ] All new modules import from `@/obs/...` paths consistent with the rest of `electron/`.
