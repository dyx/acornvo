# Phase 18 — Crash Reporter + Diagnostic Bundle + Observability Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plan Index:** 2 of 5 for `phase-18-observability-and-packaging`
**OpenSpec tasks covered:** 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5

**Status:** Ready
**Last Updated:** 2026-05-09
**Plan branch:** `phase-19-ui-remediation`

**Sources:**

- `openspec/changes/phase-18-observability-and-packaging/proposal.md`
- `openspec/changes/phase-18-observability-and-packaging/design.md` (D3, D4, D5)
- `openspec/changes/phase-18-observability-and-packaging/tasks.md` (§4, §5, §6)
- `openspec/changes/phase-18-observability-and-packaging/specs/crash-reporting/spec.md`
- `openspec/changes/phase-18-observability-and-packaging/specs/diagnostic-bundle/spec.md`
- `openspec/changes/phase-18-observability-and-packaging/specs/observability-page/spec.md`

**Out of scope:**

- Logger / perf modules (Plan 1)
- About page / Auto-update / Telemetry switch (Plan 3)
- Packaging, App shell wiring, i18n (Plan 4)
- Verification (Plan 5)

**Open issues:**

- New file convention: OpenSpec spec text uses `src/pages/settings/Observability.tsx`. The repo's actual settings convention is `src/components/settings/<Name>Tab.tsx` rendered from `src/pages/Settings.tsx` via React Router. We follow the **repo convention** for consistency: `src/components/settings/ObservabilityTab.tsx`. The route remains `/settings/observability`.
- Adding `archiver` (mature Node zip lib) as a runtime dep for diagnostic bundles. Alternative `adm-zip` is sync-only and less battle-tested; not chosen.

---

## Goal

Capture process crashes locally, allow users to export a redacted 7-day diagnostic bundle, and surface AI-usage / queue-health / perf metrics in a new `/settings/observability` page.

## Architecture

- **Crash reporter:** `electron/obs/crashReporter.ts` hooks `app.on('render-process-gone')`, `process.on('uncaughtException' | 'unhandledRejection')`, plus Electron's built-in `crashReporter.start({ uploadToServer: false })`. Crashes write `<userData>/logs/crashes/<kind>-<ts>.log`. `checkLastRun()` + `ack(file)` move acknowledged crashes to `acked/` subdir; files >30d there are auto-deleted on boot.
- **Diagnostic bundle:** `electron/obs/diagnostic.ts` exports `exportDiagnosticBundle()` which streams a zip to `~/Downloads/Acornvo-Diagnostics-YYYYMMDD-HHMMSS.zip` containing the last 7 days of `app-*.log`, all `crashes/*.log`, an `about.json`, and an `env.json`. Files are scrubbed for API keys via regex before being added to the zip. Uses `archiver`.
- **Observability page:** `src/components/settings/ObservabilityTab.tsx` — three tab panels (AI / Queue / Perf) + a footer "Export Diagnostic Bundle" button. Data is fetched via existing `ipc.ai.usage.summary` (Phase 15), new `ipc.queue.health()` + `ipc.queue.recent()` calls, and a new `ipc.perf.aggregates(area, windowMs)` derived from `getAggregates()` (Plan 1).

## Tech Stack

- Electron `app`, `crashReporter`, `shell.showItemInFolder`
- `archiver` (new dep)
- React 19 + Tailwind 4 + Radix UI (existing)
- 5s polling via `setInterval` for queue tab; AbortController on unmount

---

<!-- openspec-task: 4.1 -->

### Task 1: Crash hooks → write `crashes/<kind>-<ts>.log`

**Files:**

- Create: `electron/obs/crashReporter.ts`
- Create: `electron/obs/crashReporter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/crashReporter.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'crashrpt-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempBase, on: vi.fn() },
  crashReporter: { start: vi.fn() }
}))

import { writeCrash } from './crashReporter'

describe('writeCrash', () => {
  it('creates crashes/<kind>-<ts>.log with reason payload', () => {
    writeCrash({
      kind: 'renderer',
      reason: 'crashed',
      details: { exitCode: 5, url: 'app://x' },
      now: () => new Date('2026-05-09T10:11:12.000Z')
    })
    const dir = join(tempBase, 'logs', 'crashes')
    const files = readdirSync(dir)
    expect(files.some((f) => /^renderer-2026-05-09-101112\.log$/.test(f))).toBe(true)
    const body = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'))
    expect(body).toMatchObject({ kind: 'renderer', reason: 'crashed' })
    expect(body.details).toMatchObject({ exitCode: 5, url: 'app://x' })
  })

  afterAll(() => rmSync(tempBase, { recursive: true, force: true }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/crashReporter.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement crash hooks**

```ts
// electron/obs/crashReporter.ts
import { app, crashReporter as electronCrashReporter } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, statSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from './logger'

export type CrashKind = 'renderer' | 'main' | 'unhandled-rejection'

export interface CrashPayload {
  kind: CrashKind
  reason: string
  details?: Record<string, unknown>
  now?: () => Date
}

export function getCrashesDir(): string {
  const dir = join(app.getPath('userData'), 'logs', 'crashes')
  mkdirSync(dir, { recursive: true })
  return dir
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fileTimestamp(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

export function writeCrash(p: CrashPayload): string {
  const now = (p.now ?? (() => new Date()))()
  const file = join(getCrashesDir(), `${p.kind}-${fileTimestamp(now)}.log`)
  const body = {
    ts: now.toISOString(),
    kind: p.kind,
    reason: p.reason,
    details: p.details ?? {}
  }
  writeFileSync(file, JSON.stringify(body, null, 2), 'utf8')
  return file
}

export function installCrashHooks(): void {
  app.on('render-process-gone', (_e, _wc, details) => {
    const file = writeCrash({
      kind: 'renderer',
      reason: details.reason,
      details: { exitCode: details.exitCode }
    })
    logger().error('crash', { op: 'renderer-gone', meta: { file, reason: details.reason } })
  })

  process.on('uncaughtException', (err) => {
    const file = writeCrash({ kind: 'main', reason: err.message, details: { stack: err.stack } })
    logger().error('crash', { op: 'uncaught', meta: { file } })
  })

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const file = writeCrash({ kind: 'unhandled-rejection', reason: msg, details: { reason: msg } })
    logger().error('crash', { op: 'unhandled-rejection', meta: { file } })
  })
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/obs/crashReporter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/obs/crashReporter.ts electron/obs/crashReporter.test.ts
git commit -m "feat(obs): write crash logs on render-process-gone / uncaught / unhandled-rejection"
```

---

<!-- openspec-task: 4.2 -->

### Task 2: Wire Electron `crashReporter.start` (minidumps, no upload)

**Files:**

- Modify: `electron/obs/crashReporter.ts` (add `startElectronCrashReporter`)
- Modify: `electron/bootstrap.ts` to call it before `app.whenReady()`

- [ ] **Step 1: Append `startElectronCrashReporter`**

In `electron/obs/crashReporter.ts`:

```ts
export function startElectronCrashReporter(): void {
  electronCrashReporter.start({
    uploadToServer: false,
    submitURL: '',
    productName: 'Acornvo'
  })
  // Hint Electron to land minidumps inside crashes/minidumps/
  app.setPath('crashDumps', join(getCrashesDir(), 'minidumps'))
}
```

- [ ] **Step 2: Wire in boot**

Edit `electron/bootstrap.ts`. Place **before** `app.whenReady()`:

```ts
import { installCrashHooks, startElectronCrashReporter } from '@/obs/crashReporter'

startElectronCrashReporter()

// after whenReady:
installCrashHooks()
```

- [ ] **Step 3: Smoke check**

Run: `npm run dev`
Manual: confirm `<userData>/logs/crashes/minidumps/` exists after boot.

- [ ] **Step 4: Commit**

```bash
git add electron/obs/crashReporter.ts electron/bootstrap.ts
git commit -m "feat(obs): start Electron crashReporter (no upload), redirect minidumps to crashes/minidumps"
```

---

<!-- openspec-task: 4.3 -->

### Task 3: `checkLastRun()` + `ack(file)`

**Files:**

- Modify: `electron/obs/crashReporter.ts`
- Create: `electron/obs/crashReporter.checkLastRun.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/crashReporter.checkLastRun.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'crash-ack-'))
vi.mock('electron', () => ({
  app: { getPath: () => tempBase, on: vi.fn() },
  crashReporter: { start: vi.fn() }
}))

import { checkLastRun, ack, getCrashesDir } from './crashReporter'

describe('checkLastRun + ack', () => {
  it('returns unacked files and moves them to acked/ on ack', () => {
    const dir = getCrashesDir()
    writeFileSync(join(dir, 'renderer-2026-05-09-101112.log'), '{}')
    writeFileSync(join(dir, 'main-2026-05-09-110000.log'), '{}')

    const unacked = checkLastRun()
    expect(unacked).toHaveLength(2)

    ack(unacked[0])
    const acked = readdirSync(join(dir, 'acked'))
    expect(acked).toHaveLength(1)

    expect(checkLastRun()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/crashReporter.checkLastRun.test.ts`
Expected: FAIL — `checkLastRun` / `ack` not exported.

- [ ] **Step 3: Implement `checkLastRun` and `ack`**

Append to `electron/obs/crashReporter.ts`:

```ts
function getAckedDir(): string {
  const dir = join(getCrashesDir(), 'acked')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function checkLastRun(): string[] {
  const dir = getCrashesDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => join(dir, f))
}

export function ack(file: string): void {
  const acked = getAckedDir()
  const dest = join(acked, file.split('/').pop() ?? 'unknown.log')
  renameSync(file, dest)
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/obs/crashReporter.checkLastRun.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/obs/crashReporter.ts electron/obs/crashReporter.checkLastRun.test.ts
git commit -m "feat(obs): checkLastRun()/ack() for unacknowledged crashes"
```

---

<!-- openspec-task: 4.4 -->

### Task 4: Auto-delete acked crashes older than 30 days

**Files:**

- Modify: `electron/obs/crashReporter.ts` (add `purgeOldAcked`)
- Create: `electron/obs/crashReporter.purge.test.ts`
- Modify: `electron/bootstrap.ts` to call `purgeOldAcked()` after `installCrashHooks()`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/crashReporter.purge.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'crash-purge-'))
vi.mock('electron', () => ({
  app: { getPath: () => tempBase, on: vi.fn() },
  crashReporter: { start: vi.fn() }
}))

import { purgeOldAcked, getCrashesDir } from './crashReporter'

describe('purgeOldAcked', () => {
  it('deletes acked files older than 30 days', () => {
    const dir = join(getCrashesDir(), 'acked')
    mkdirSync(dir, { recursive: true })
    const oldFile = join(dir, 'renderer-old.log')
    const freshFile = join(dir, 'renderer-fresh.log')
    writeFileSync(oldFile, '{}')
    writeFileSync(freshFile, '{}')
    const old = (Date.now() - 31 * 86400 * 1000) / 1000
    utimesSync(oldFile, old, old)

    purgeOldAcked({ now: () => new Date() })
    const remaining = readdirSync(dir)
    expect(remaining).toContain('renderer-fresh.log')
    expect(remaining).not.toContain('renderer-old.log')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/crashReporter.purge.test.ts`
Expected: FAIL — `purgeOldAcked` not exported.

- [ ] **Step 3: Implement `purgeOldAcked`**

Append to `electron/obs/crashReporter.ts`:

```ts
const THIRTY_DAYS_MS = 30 * 86400 * 1000

export function purgeOldAcked(opts: { now?: () => Date } = {}): void {
  const now = (opts.now ?? (() => new Date()))().getTime()
  const dir = join(getCrashesDir(), 'acked')
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    try {
      const st = statSync(full)
      if (now - st.mtimeMs > THIRTY_DAYS_MS) unlinkSync(full)
    } catch {
      /* ignore */
    }
  }
}
```

- [ ] **Step 4: Wire purge in boot**

Edit `electron/bootstrap.ts`:

```ts
import { purgeOldAcked } from '@/obs/crashReporter'
// ... after installCrashHooks():
purgeOldAcked()
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run electron/obs/crashReporter.purge.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/obs/crashReporter.ts electron/obs/crashReporter.purge.test.ts electron/bootstrap.ts
git commit -m "feat(obs): purge acked crash logs older than 30 days on boot"
```

---

<!-- openspec-task: 5.1 -->

### Task 5: Implement `exportDiagnosticBundle()` (zip skeleton)

**Files:**

- Create: `electron/obs/diagnostic.ts`
- Create: `electron/obs/diagnostic.test.ts`
- Modify: `package.json` (add `archiver` runtime dep)

- [ ] **Step 1: Add `archiver` dependency**

Run: `npm install --save archiver && npm install --save-dev @types/archiver`
Expected: deps installed.

- [ ] **Step 2: Write the failing test**

```ts
// electron/obs/diagnostic.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import unzipper from 'unzipper' // Note: only used in test; install as devDep before running

const tempBase = mkdtempSync(join(tmpdir(), 'diag-'))
const downloads = mkdtempSync(join(tmpdir(), 'diag-dl-'))

vi.mock('electron', () => ({
  app: {
    getPath: (k: string) => (k === 'downloads' ? downloads : tempBase),
    getVersion: () => '0.1.0'
  },
  shell: { showItemInFolder: vi.fn() }
}))

import { exportDiagnosticBundle } from './diagnostic'

describe('exportDiagnosticBundle', () => {
  it('produces a zip in downloads/ containing logs and metadata files', async () => {
    const logsDir = join(tempBase, 'logs')
    mkdirSync(logsDir, { recursive: true })
    writeFileSync(join(logsDir, 'app-2026-05-09.log'), '{"level":"info","area":"app"}\n')

    const zipPath = await exportDiagnosticBundle()
    expect(zipPath.endsWith('.zip')).toBe(true)
    expect(statSync(zipPath).isFile()).toBe(true)

    const zip = await unzipper.Open.file(zipPath)
    const names = zip.files.map((f) => f.path)
    expect(names).toContain('logs/app-2026-05-09.log')
    expect(names).toContain('about.json')
    expect(names).toContain('env.json')
  })
})
```

(Add `unzipper` as devDependency: `npm install --save-dev unzipper @types/unzipper`. It's only used in this test.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run electron/obs/diagnostic.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `exportDiagnosticBundle` skeleton**

```ts
// electron/obs/diagnostic.ts
import { app, shell } from 'electron'
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import archiver from 'archiver'
import { getLogDir } from './logger'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function bundleFilename(now: Date): string {
  return `Acornvo-Diagnostics-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}.zip`
}

export interface DiagnosticDeps {
  now?: () => Date
}

export async function exportDiagnosticBundle(deps: DiagnosticDeps = {}): Promise<string> {
  const now = (deps.now ?? (() => new Date()))()
  const downloads = app.getPath('downloads')
  mkdirSync(downloads, { recursive: true })
  const outPath = join(downloads, bundleFilename(now))

  const output = createWriteStream(outPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    archive.on('error', reject)
  })
  archive.pipe(output)

  // about.json
  archive.append(JSON.stringify(buildAboutJson(), null, 2), { name: 'about.json' })
  // env.json
  archive.append(JSON.stringify(buildEnvJson(), null, 2), { name: 'env.json' })

  // logs/
  const logDir = getLogDir()
  for (const f of safeReaddir(logDir)) {
    if (!f.endsWith('.log')) continue
    const full = join(logDir, f)
    if (!isWithinDays(full, 7, now)) continue
    archive.file(full, { name: `logs/${f}` })
  }

  // crashes/
  const crashesDir = join(logDir, 'crashes')
  for (const f of safeReaddir(crashesDir)) {
    if (!f.endsWith('.log')) continue
    archive.file(join(crashesDir, f), { name: `crashes/${f}` })
  }

  await archive.finalize()
  await done

  shell.showItemInFolder(outPath)
  return outPath
}

function buildAboutJson() {
  return {
    name: 'Acornvo',
    version: app.getVersion(),
    gitHash: process.env.__GIT_HASH__ ?? 'dev'
  }
}

function buildEnvJson() {
  return {
    platform: process.platform,
    arch: process.arch,
    versions: process.versions
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isWithinDays(file: string, days: number, now: Date): boolean {
  try {
    const st = statSync(file)
    return now.getTime() - st.mtimeMs <= days * 86400 * 1000
  } catch {
    return false
  }
}

// Re-exported in subsequent task; placeholder import to keep ts happy if needed.
export { readFileSync as _rfs }
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run electron/obs/diagnostic.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/obs/diagnostic.ts electron/obs/diagnostic.test.ts package.json package-lock.json
git commit -m "feat(obs): exportDiagnosticBundle scaffolding (zip with logs + about/env)"
```

---

<!-- openspec-task: 5.2 -->

### Task 6: Bundle 7-day logs + crashes/\*.log + about.json + env.json

This task is largely satisfied by the skeleton in Task 5. Verify completeness explicitly.

**Files:**

- Modify: `electron/obs/diagnostic.test.ts` (add assertion for crashes/ inclusion)

- [ ] **Step 1: Extend the test to cover crash files and 7-day window**

Append to the existing describe in `electron/obs/diagnostic.test.ts`:

```ts
it('includes crashes/*.log and excludes logs older than 7 days', async () => {
  const logsDir = join(tempBase, 'logs')
  const crashesDir = join(logsDir, 'crashes')
  mkdirSync(crashesDir, { recursive: true })
  writeFileSync(join(crashesDir, 'renderer-2026-05-09.log'), '{}')
  const old = join(logsDir, 'app-2026-04-01.log')
  writeFileSync(old, 'old')
  const longAgo = (Date.now() - 30 * 86400 * 1000) / 1000
  utimesSync(old, longAgo, longAgo)

  const zipPath = await exportDiagnosticBundle()
  const zip = await unzipper.Open.file(zipPath)
  const names = zip.files.map((f) => f.path)
  expect(names).toContain('crashes/renderer-2026-05-09.log')
  expect(names).not.toContain('logs/app-2026-04-01.log')
})
```

(Add `import { utimesSync } from 'node:fs'` to test imports.)

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/obs/diagnostic.test.ts`
Expected: PASS (the skeleton from Task 5 already filters by `isWithinDays(.., 7, now)` and walks `crashes/`).

- [ ] **Step 3: Commit**

```bash
git add electron/obs/diagnostic.test.ts
git commit -m "test(obs): assert crashes/ inclusion and 7-day log filter in diagnostic bundle"
```

---

<!-- openspec-task: 5.3 -->

### Task 7: Redact API keys in zipped log copies

**Files:**

- Modify: `electron/obs/diagnostic.ts` (`scrubSecrets`, plumb into `archive.append`)
- Create: `electron/obs/diagnostic.scrub.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/obs/diagnostic.scrub.test.ts
import { describe, expect, it } from 'vitest'
import { scrubSecrets } from './diagnostic'

describe('scrubSecrets', () => {
  it('replaces sk-* and Bearer tokens with [REDACTED:api-key]', () => {
    const before = 'authorization: Bearer abc.def.ghi\nkey: sk-proj-1234abcd'
    const after = scrubSecrets(before)
    expect(after).not.toMatch(/sk-proj-1234abcd/)
    expect(after).not.toMatch(/abc\.def\.ghi/)
    expect(after).toMatch(/\[REDACTED:api-key\]/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/obs/diagnostic.scrub.test.ts`
Expected: FAIL — `scrubSecrets` not exported.

- [ ] **Step 3: Implement `scrubSecrets` and apply to log entries**

In `electron/obs/diagnostic.ts`:

```ts
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_\-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /api[_-]?key["':\s]*[A-Za-z0-9_\-]{16,}/gi
]

export function scrubSecrets(input: string): string {
  let out = input
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED:api-key]')
  return out
}
```

Then change the log inclusion in `exportDiagnosticBundle` from `archive.file(...)` to:

```ts
const raw = readFileSync(full, 'utf8')
archive.append(scrubSecrets(raw), { name: `logs/${f}` })
```

(Apply same to `crashes/*.log`.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/obs/diagnostic.scrub.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the bundle contents are scrubbed**

Add to `electron/obs/diagnostic.test.ts`:

```ts
it('scrubs api-key patterns from log copies in the zip', async () => {
  const logsDir = join(tempBase, 'logs')
  mkdirSync(logsDir, { recursive: true })
  writeFileSync(join(logsDir, 'app-2026-05-09.log'), '{"key":"sk-proj-deadbeef0123456789"}\n')
  const zipPath = await exportDiagnosticBundle()
  const zip = await unzipper.Open.file(zipPath)
  const file = zip.files.find((f) => f.path === 'logs/app-2026-05-09.log')!
  const body = (await file.buffer()).toString('utf8')
  expect(body).not.toMatch(/sk-proj-deadbeef/)
  expect(body).toMatch(/\[REDACTED:api-key\]/)
})
```

Run: `npx vitest run electron/obs/diagnostic.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/obs/diagnostic.ts electron/obs/diagnostic.scrub.test.ts electron/obs/diagnostic.test.ts
git commit -m "feat(obs): redact api-key patterns from logs inside diagnostic zip"
```

---

<!-- openspec-task: 5.4 -->

### Task 8: Output to Downloads/ + `shell.showItemInFolder`

This task is largely covered by Task 5's `bundleFilename` and `shell.showItemInFolder` call. Add explicit IPC + verification.

**Files:**

- Modify: `electron/ipc/ops.ts` (or appropriate handler module) — add `ops.exportDiagnostic()` IPC
- Modify: `shared/ipc-contract.ts` — declare the new endpoint
- Modify: `preload/preload.ts` — re-export `ops` namespace if not already
- Modify: `src/ipc/client.ts` — wire client surface (already pattern-driven; check existing)
- Create: `electron/ipc/ops.exportDiagnostic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/ipc/ops.exportDiagnostic.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/obs/diagnostic', () => ({
  exportDiagnosticBundle: vi.fn().mockResolvedValue('/Users/me/Downloads/Acornvo-Diagnostics-x.zip')
}))

import { opsHandlers } from './ops'

describe('ops.exportDiagnostic IPC', () => {
  it('returns the produced zip path', async () => {
    const path = await opsHandlers['exportDiagnostic']()
    expect(path).toMatch(/Acornvo-Diagnostics-/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/ops.exportDiagnostic.test.ts`
Expected: FAIL — handler missing.

- [ ] **Step 3: Add the IPC handler**

In `shared/ipc-contract.ts` (locate the `ops` group; mirror existing styling):

```ts
ops: {
  // ... existing
  exportDiagnostic: () => Promise<string>
}
```

In `electron/ipc/ops.ts`:

```ts
import { exportDiagnosticBundle } from '@/obs/diagnostic'

export const opsHandlers: IpcContract['ops'] = {
  // ... existing
  async exportDiagnostic() {
    return exportDiagnosticBundle()
  }
}
```

In `preload/preload.ts` (search for existing `ops` exposure pattern; if a thin pass-through, no change needed beyond contract). Verify with the existing preload test.

In `src/ipc/client.ts`: the typed client wrapper should auto-flow via the contract; verify a usage line `ipc.ops.exportDiagnostic()` type-checks.

- [ ] **Step 4: Run the test**

Run: `npx vitest run electron/ipc/ops.exportDiagnostic.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/ops.ts electron/ipc/ops.exportDiagnostic.test.ts preload/preload.ts src/ipc/client.ts
git commit -m "feat(ipc): ops.exportDiagnostic → triggers bundle + opens Finder/Explorer"
```

---

<!-- openspec-task: 6.1 -->

### Task 9: ObservabilityTab skeleton (3 panels + footer button)

**Files:**

- Create: `src/components/settings/ObservabilityTab.tsx`
- Create: `src/components/settings/ObservabilityTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/settings/ObservabilityTab.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { ObservabilityTab } from './ObservabilityTab'

vi.mock('@/ipc/client', () => ({
  ipc: {
    ai: {
      'usage.summary': vi
        .fn()
        .mockResolvedValue({ totals: {}, byProfile: [], byTool: [], byDay: [] })
    },
    queue: {
      health: vi.fn().mockResolvedValue({ pending: 0, running: 0, failed: 0 }),
      recent: vi.fn().mockResolvedValue({ failed: [], opsLog: [] })
    },
    perf: { aggregates: vi.fn().mockResolvedValue([]) },
    ops: { exportDiagnostic: vi.fn() }
  }
}))

describe('ObservabilityTab', () => {
  it('renders three tab triggers and an export button', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ObservabilityTab />
      </I18nextProvider>
    )
    expect(await screen.findByTestId('obs-tab-ai')).toBeInTheDocument()
    expect(screen.getByTestId('obs-tab-queue')).toBeInTheDocument()
    expect(screen.getByTestId('obs-tab-perf')).toBeInTheDocument()
    expect(screen.getByTestId('obs-export-diagnostic')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/ObservabilityTab.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the skeleton**

```tsx
// src/components/settings/ObservabilityTab.tsx
import type { JSX } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'

type Panel = 'ai' | 'queue' | 'perf'

export function ObservabilityTab(): JSX.Element {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<Panel>('ai')
  const [exporting, setExporting] = useState(false)

  async function onExport(): Promise<void> {
    setExporting(true)
    try {
      await ipc.ops.exportDiagnostic()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div data-testid="settings-tab-observability" className="flex h-full flex-col">
      <h3 className="text-lg font-medium">{t('obs.title')}</h3>

      <div role="tablist" className="mt-4 flex gap-2 border-b">
        <button
          role="tab"
          aria-selected={panel === 'ai'}
          data-testid="obs-tab-ai"
          className={`px-3 py-2 text-sm ${panel === 'ai' ? 'border-b-2 border-primary' : ''}`}
          onClick={() => setPanel('ai')}
        >
          {t('obs.tabs.ai')}
        </button>
        <button
          role="tab"
          aria-selected={panel === 'queue'}
          data-testid="obs-tab-queue"
          className={`px-3 py-2 text-sm ${panel === 'queue' ? 'border-b-2 border-primary' : ''}`}
          onClick={() => setPanel('queue')}
        >
          {t('obs.tabs.queue')}
        </button>
        <button
          role="tab"
          aria-selected={panel === 'perf'}
          data-testid="obs-tab-perf"
          className={`px-3 py-2 text-sm ${panel === 'perf' ? 'border-b-2 border-primary' : ''}`}
          onClick={() => setPanel('perf')}
        >
          {t('obs.tabs.perf')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {panel === 'ai' && <ObservabilityAiPanel />}
        {panel === 'queue' && <ObservabilityQueuePanel />}
        {panel === 'perf' && <ObservabilityPerfPanel />}
      </div>

      <footer className="mt-4 border-t pt-4">
        <button
          data-testid="obs-export-diagnostic"
          disabled={exporting}
          className="rounded border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          onClick={() => {
            void onExport()
          }}
        >
          {exporting ? t('obs.export.diagnosticBusy') : t('obs.export.diagnostic')}
        </button>
      </footer>
    </div>
  )
}

function ObservabilityAiPanel(): JSX.Element {
  return <div data-testid="obs-panel-ai" />
}
function ObservabilityQueuePanel(): JSX.Element {
  return <div data-testid="obs-panel-queue" />
}
function ObservabilityPerfPanel(): JSX.Element {
  return <div data-testid="obs-panel-perf" />
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/settings/ObservabilityTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ObservabilityTab.tsx src/components/settings/ObservabilityTab.test.tsx
git commit -m "feat(ui): observability tab skeleton (AI/queue/perf panels + export button)"
```

---

<!-- openspec-task: 6.2 -->

### Task 10: AI usage panel — windows / numbers / profile bar / tools / line chart

**Files:**

- Modify: `src/components/settings/ObservabilityTab.tsx` (`ObservabilityAiPanel`)
- Create: `src/components/settings/ObservabilityAi.test.tsx`

- [ ] **Step 1: Extend the existing IPC mock for the test**

```tsx
// src/components/settings/ObservabilityAi.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { ObservabilityTab } from './ObservabilityTab'

vi.mock('@/ipc/client', () => ({
  ipc: {
    ai: {
      'usage.summary': vi.fn().mockResolvedValue({
        totals: { requests: 12, tokens: 345, costUSD: 0.07 },
        byProfile: [{ profileId: 'p1', requests: 7, tokens: 200 }],
        byTool: [{ tool: 'search_files', count: 3 }],
        byDay: [
          { day: '2026-05-08', tokens: 100 },
          { day: '2026-05-09', tokens: 245 }
        ]
      })
    },
    queue: {
      health: vi.fn().mockResolvedValue({}),
      recent: vi.fn().mockResolvedValue({ failed: [], opsLog: [] })
    },
    perf: { aggregates: vi.fn().mockResolvedValue([]) },
    ops: { exportDiagnostic: vi.fn() }
  }
}))

describe('Observability AI panel', () => {
  it('shows totals and switches windows', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ObservabilityTab />
      </I18nextProvider>
    )
    expect(await screen.findByTestId('obs-ai-total-requests')).toHaveTextContent('12')
    fireEvent.click(screen.getByTestId('obs-ai-window-7d'))
    await waitFor(() => expect(screen.getByTestId('obs-ai-total-requests')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/ObservabilityAi.test.tsx`
Expected: FAIL — `obs-ai-total-requests` not rendered.

- [ ] **Step 3: Implement `ObservabilityAiPanel`**

Replace the placeholder in `ObservabilityTab.tsx`:

```tsx
import { useEffect } from 'react'

type Window = '24h' | '7d' | '30d'

function windowToMs(w: Window): number {
  return w === '24h' ? 86400_000 : w === '7d' ? 7 * 86400_000 : 30 * 86400_000
}

function ObservabilityAiPanel(): JSX.Element {
  const { t } = useTranslation()
  const [windowSel, setWindowSel] = useState<Window>('24h')
  const [data, setData] = useState<Awaited<ReturnType<(typeof ipc.ai)['usage.summary']>> | null>(
    null
  )

  useEffect(() => {
    let cancelled = false
    void ipc.ai['usage.summary']({ sinceMs: windowToMs(windowSel) }).then((d) => {
      if (!cancelled) setData(d)
    })
    return () => {
      cancelled = true
    }
  }, [windowSel])

  return (
    <div data-testid="obs-panel-ai" className="space-y-4">
      <div className="flex gap-2 text-sm">
        {(['24h', '7d', '30d'] as Window[]).map((w) => (
          <button
            key={w}
            data-testid={`obs-ai-window-${w}`}
            aria-pressed={w === windowSel}
            className={`rounded border px-2 py-1 ${w === windowSel ? 'bg-accent' : ''}`}
            onClick={() => setWindowSel(w)}
          >
            {t(`obs.window.${w}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <NumberCard
          testId="obs-ai-total-requests"
          label={t('obs.ai.totalRequests')}
          value={data?.totals.requests ?? 0}
        />
        <NumberCard
          testId="obs-ai-total-tokens"
          label={t('obs.ai.totalTokens')}
          value={data?.totals.tokens ?? 0}
        />
        <NumberCard
          testId="obs-ai-cost"
          label={t('obs.ai.estimatedCost')}
          value={`$${(data?.totals.costUSD ?? 0).toFixed(2)}`}
        />
      </div>

      <ProfileBars data={data?.byProfile ?? []} />
      <ToolList data={data?.byTool ?? []} />
      <DayLine data={data?.byDay ?? []} />
    </div>
  )
}

function NumberCard({
  testId,
  label,
  value
}: {
  testId: string
  label: string
  value: number | string
}): JSX.Element {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-testid={testId} className="text-xl font-semibold">
        {value}
      </div>
    </div>
  )
}

function ProfileBars({
  data
}: {
  data: { profileId: string; requests: number; tokens: number }[]
}): JSX.Element {
  const max = Math.max(1, ...data.map((d) => d.tokens))
  return (
    <ul data-testid="obs-ai-profile-bars" className="space-y-1">
      {data.map((d) => (
        <li key={d.profileId} className="flex items-center gap-2 text-sm">
          <span className="w-32 truncate">{d.profileId}</span>
          <div className="h-2 flex-1 rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ width: `${(d.tokens / max) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right tabular-nums">{d.tokens}</span>
        </li>
      ))}
    </ul>
  )
}

function ToolList({ data }: { data: { tool: string; count: number }[] }): JSX.Element {
  return (
    <ul data-testid="obs-ai-tools" className="space-y-1 text-sm">
      {data.map((d) => (
        <li key={d.tool} className="flex justify-between border-b py-1">
          <span>{d.tool}</span>
          <span className="tabular-nums">{d.count}</span>
        </li>
      ))}
    </ul>
  )
}

function DayLine({ data }: { data: { day: string; tokens: number }[] }): JSX.Element {
  // Simple inline SVG sparkline; production may swap to a chart lib later.
  if (data.length === 0) return <div data-testid="obs-ai-line-empty" />
  const max = Math.max(1, ...data.map((d) => d.tokens))
  const w = 320
  const h = 60
  const step = data.length > 1 ? w / (data.length - 1) : 0
  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (d.tokens / max) * h}`)
    .join(' ')
  return (
    <svg data-testid="obs-ai-line" width={w} height={h} className="text-primary">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/settings/ObservabilityAi.test.tsx`
Expected: PASS.

- [ ] **Step 5: Note for IPC contract**

If `ipc.ai['usage.summary']` does not yet support `{ sinceMs }` and a richer return shape, add the keys in `shared/ipc-contract.ts` and have `electron/ai/usage.ts` compute them. Use existing aggregation patterns; the additional grouping (`byTool`, `byDay`) reads `tool_calls` (Phase 16) and `ai_usage` (Phase 15) tables.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/ObservabilityTab.tsx src/components/settings/ObservabilityAi.test.tsx shared/ipc-contract.ts electron/ai/usage.ts
git commit -m "feat(ui): observability AI panel — totals/profile/tool/day"
```

---

<!-- openspec-task: 6.3 -->

### Task 11: Queue panel — counts / recent failures + retry/discard / ops_log / 5s polling

**Files:**

- Modify: `src/components/settings/ObservabilityTab.tsx` (`ObservabilityQueuePanel`)
- Modify: `electron/ipc/jobs.ts` and `shared/ipc-contract.ts` — add `queue.health`, `queue.recent`, `queue.retry(id)`, `queue.discard(id)`
- Create: `src/components/settings/ObservabilityQueue.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/settings/ObservabilityQueue.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { ObservabilityTab } from './ObservabilityTab'

const retry = vi.fn()
vi.mock('@/ipc/client', () => ({
  ipc: {
    ai: {
      'usage.summary': vi
        .fn()
        .mockResolvedValue({ totals: {}, byProfile: [], byTool: [], byDay: [] })
    },
    queue: {
      health: vi.fn().mockResolvedValue({ pending: 1, running: 0, failed: 1 }),
      recent: vi.fn().mockResolvedValue({
        failed: [
          { id: 'j1', kind: 'ai-review-clip', last_error: 'boom', updated_at: '2026-05-09' }
        ],
        opsLog: [{ ts: '2026-05-09', area: 'queue', message: 'started' }]
      }),
      retry,
      discard: vi.fn()
    },
    perf: { aggregates: vi.fn().mockResolvedValue([]) },
    ops: { exportDiagnostic: vi.fn() }
  }
}))

describe('Observability Queue panel', () => {
  it('shows counts and lets the user retry a failed job', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ObservabilityTab />
      </I18nextProvider>
    )
    fireEvent.click(await screen.findByTestId('obs-tab-queue'))
    expect(await screen.findByTestId('obs-queue-pending')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('obs-queue-retry-j1'))
    await waitFor(() => expect(retry).toHaveBeenCalledWith('j1'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/ObservabilityQueue.test.tsx`
Expected: FAIL — panel not implemented.

- [ ] **Step 3: Add IPC endpoints**

In `shared/ipc-contract.ts`:

```ts
queue: {
  health: () => Promise<{ pending: number; running: number; failed: number }>
  recent: () =>
    Promise<{
      failed: { id: string; kind: string; last_error: string; updated_at: string }[]
      opsLog: { ts: string; area: string; message: string }[]
    }>
  retry: (id: string) => Promise<void>
  discard: (id: string) => Promise<void>
}
```

In `electron/ipc/jobs.ts` add the implementation, leveraging the existing queue store (Phase 14) for counts and `ops_log` (Phase 3/14) for the recent log slice. Use raw SQL bound queries; do NOT add cross-cutting helpers.

- [ ] **Step 4: Implement `ObservabilityQueuePanel` with 5s polling**

Replace the placeholder:

```tsx
function ObservabilityQueuePanel(): JSX.Element {
  const { t } = useTranslation()
  const [health, setHealth] = useState({ pending: 0, running: 0, failed: 0 })
  const [recent, setRecent] = useState<{
    failed: { id: string; kind: string; last_error: string; updated_at: string }[]
    opsLog: { ts: string; area: string; message: string }[]
  }>({ failed: [], opsLog: [] })

  useEffect(() => {
    let cancelled = false
    async function tick() {
      const [h, r] = await Promise.all([ipc.queue.health(), ipc.queue.recent()])
      if (!cancelled) {
        setHealth(h)
        setRecent(r)
      }
    }
    void tick()
    const id = setInterval(() => {
      void tick()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div data-testid="obs-panel-queue" className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.pending')}</div>
          <div data-testid="obs-queue-pending" className="text-xl font-semibold">
            {health.pending}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.running')}</div>
          <div data-testid="obs-queue-running" className="text-xl font-semibold">
            {health.running}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.failed')}</div>
          <div data-testid="obs-queue-failed" className="text-xl font-semibold">
            {health.failed}
          </div>
        </div>
      </div>

      <ul className="space-y-1 text-sm">
        {recent.failed.slice(0, 20).map((f) => (
          <li key={f.id} className="flex items-center gap-2 border-b py-1">
            <span className="w-32 truncate">{f.kind}</span>
            <span className="flex-1 truncate text-muted-foreground">{f.last_error}</span>
            <button
              data-testid={`obs-queue-retry-${f.id}`}
              className="rounded border px-2 py-0.5"
              onClick={() => {
                void ipc.queue.retry(f.id)
              }}
            >
              {t('obs.queue.retry')}
            </button>
            <button
              data-testid={`obs-queue-discard-${f.id}`}
              className="rounded border px-2 py-0.5"
              onClick={() => {
                void ipc.queue.discard(f.id)
              }}
            >
              {t('obs.queue.discard')}
            </button>
          </li>
        ))}
      </ul>

      <ul data-testid="obs-queue-opslog" className="space-y-1 text-xs text-muted-foreground">
        {recent.opsLog.slice(0, 20).map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="tabular-nums">{r.ts}</span>
            <span>{r.area}</span>
            <span className="flex-1 truncate">{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/settings/ObservabilityQueue.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/jobs.ts src/components/settings/ObservabilityTab.tsx src/components/settings/ObservabilityQueue.test.tsx
git commit -m "feat(ui): observability queue panel (counts/failed/retry/discard/opslog/5s polling)"
```

---

<!-- openspec-task: 6.4 -->

### Task 12: Perf panel — per-area P50/P95/successRate + threshold red

**Files:**

- Modify: `src/components/settings/ObservabilityTab.tsx` (`ObservabilityPerfPanel`)
- Modify: `electron/ipc/jobs.ts` (or new `electron/ipc/perf.ts`) + `shared/ipc-contract.ts` — add `perf.aggregates(area, windowMs)` returning `{ count, p50, p95, successRate }`
- Create: `src/components/settings/ObservabilityPerf.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/settings/ObservabilityPerf.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { ObservabilityTab } from './ObservabilityTab'

vi.mock('@/ipc/client', () => ({
  ipc: {
    ai: {
      'usage.summary': vi
        .fn()
        .mockResolvedValue({ totals: {}, byProfile: [], byTool: [], byDay: [] })
    },
    queue: {
      health: vi.fn().mockResolvedValue({}),
      recent: vi.fn().mockResolvedValue({ failed: [], opsLog: [] })
    },
    perf: {
      aggregates: vi
        .fn()
        .mockResolvedValueOnce({ count: 100, p50: 200, p95: 600, successRate: 0.97 }) // search.query exceeds threshold
        .mockResolvedValue({ count: 10, p50: 100, p95: 200, successRate: 1 })
    },
    ops: { exportDiagnostic: vi.fn() }
  }
}))

describe('Observability Perf panel', () => {
  it('marks rows that exceed the threshold red', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ObservabilityTab />
      </I18nextProvider>
    )
    fireEvent.click(await screen.findByTestId('obs-tab-perf'))
    const row = await screen.findByTestId('obs-perf-row-search.query')
    expect(row).toHaveAttribute('data-threshold', 'over')
  })
})
```

- [ ] **Step 2: Add IPC endpoint**

In `shared/ipc-contract.ts`:

```ts
perf: {
  aggregates: (area: string, windowMs: number) =>
    Promise<{ count: number; p50: number; p95: number; successRate: number }>
}
```

In `electron/ipc/perf.ts`:

```ts
import { getAggregates } from '@/obs/perf'
import { getDb } from '@/services/db' // adjust to actual db handle export

export const perfHandlers = {
  async aggregates(area: string, windowMs: number) {
    return getAggregates({ db: getDb(), area, windowMs })
  }
}
```

Register the handlers in `electron/ipc/router.ts` following the existing pattern.

- [ ] **Step 3: Implement the panel**

Replace `ObservabilityPerfPanel`:

```tsx
const PERF_AREAS = [
  'search.query',
  'agent.step',
  'clipper.save',
  'clipper.ai-review',
  'indexer.scan',
  'indexer.update',
  'project.open'
] as const

const THRESHOLDS_MS: Record<(typeof PERF_AREAS)[number], number> = {
  'search.query': 500,
  'agent.step': 30_000,
  'clipper.save': 10_000,
  'clipper.ai-review': 30_000,
  'indexer.scan': 5_000,
  'indexer.update': 1_000,
  'project.open': 5_000
}

function ObservabilityPerfPanel(): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<
    { area: string; count: number; p50: number; p95: number; successRate: number }[]
  >([])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      PERF_AREAS.map((a) => ipc.perf.aggregates(a, 86400_000).then((agg) => ({ area: a, ...agg })))
    ).then((r) => {
      if (!cancelled) setRows(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <table data-testid="obs-panel-perf" className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th>{t('obs.perf.area')}</th>
          <th className="text-right">{t('obs.perf.count')}</th>
          <th className="text-right">{t('obs.perf.p50')}</th>
          <th className="text-right">{t('obs.perf.p95')}</th>
          <th className="text-right">{t('obs.perf.successRate')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const over = r.p95 > THRESHOLDS_MS[r.area as keyof typeof THRESHOLDS_MS]
          return (
            <tr
              key={r.area}
              data-testid={`obs-perf-row-${r.area}`}
              data-threshold={over ? 'over' : 'ok'}
              className={over ? 'text-red-600' : ''}
            >
              <td>{r.area}</td>
              <td className="text-right tabular-nums">{r.count}</td>
              <td className="text-right tabular-nums">{r.p50}</td>
              <td className="text-right tabular-nums">{r.p95}</td>
              <td className="text-right tabular-nums">{(r.successRate * 100).toFixed(0)}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/settings/ObservabilityPerf.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/perf.ts electron/ipc/router.ts src/components/settings/ObservabilityTab.tsx src/components/settings/ObservabilityPerf.test.tsx
git commit -m "feat(ui): observability perf panel with red-threshold indicators"
```

---

<!-- openspec-task: 6.5 -->

### Task 13: Add `Observability` tab + `/settings/observability` route

**Files:**

- Modify: `src/components/settings/SettingsLayout.tsx` (add NavLink entry)
- Modify: `src/pages/Settings.tsx` (add Route)
- Modify: `src/i18n/locales/zh-CN.json` and `en-US.json` — add `settings.tab.observability` (just this key here; full obs.\* namespace lives with Plan 4 i18n step)

- [ ] **Step 1: Add the route**

Edit `src/pages/Settings.tsx`:

```tsx
import { ObservabilityTab } from '@/components/settings/ObservabilityTab'
// ...
;<Route path="observability" element={<ObservabilityTab />} />
```

- [ ] **Step 2: Add the sidebar link**

Edit `src/components/settings/SettingsLayout.tsx`:

```tsx
const TABS: TabDef[] = [
  { to: '/settings/general', labelKey: 'settings.tab.general', testId: 'settings-rail-general' },
  {
    to: '/settings/appearance',
    labelKey: 'settings.tab.appearance',
    testId: 'settings-rail-appearance'
  },
  { to: '/settings/ai', labelKey: 'settings.tab.ai', testId: 'settings-rail-ai' },
  { to: '/settings/browser', labelKey: 'settings.tab.browser', testId: 'settings-rail-browser' },
  {
    to: '/settings/observability',
    labelKey: 'settings.tab.observability',
    testId: 'settings-rail-observability'
  }
]
```

- [ ] **Step 3: Add the i18n key**

In `src/i18n/locales/zh-CN.json`, add `"settings.tab.observability": "可观测"`.
In `src/i18n/locales/en-US.json`, add `"settings.tab.observability": "Observability"`.

(Other `obs.*` keys are added in Plan 4, Task 12.1.)

- [ ] **Step 4: Verify navigation**

Run: `npm run dev`
Manual: click "可观测/Observability" in the settings sidebar; URL becomes `/settings/observability`; the page renders the three-tab layout.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsLayout.tsx src/pages/Settings.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(ui): wire /settings/observability route + sidebar tab"
```

---

## Self-Review Checklist

- [ ] All 13 OpenSpec labels (4.1–4.4, 5.1–5.4, 6.1–6.5) appear as `<!-- openspec-task: N.M -->` annotations on the line directly preceding their `### Task N:` headings.
- [ ] No "TBD" / "TODO" placeholders.
- [ ] Test names cover the success scenarios; threshold logic for perf has both `over` and `ok` branches.
- [ ] IPC contract additions are listed in every task that adds them (sections 6.2–6.4 are explicit).
- [ ] `archiver` and `unzipper` (test-only) deps are added at Task 5.
