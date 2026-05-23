# Phase 12 — Clipper Pipeline: Plan 1 (Deps, Schema, Types, Extractor, Transformer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-12-clipper-pipeline`
> **Task range:** OpenSpec tasks `1.1`–`3.4` (12 tasks)
> **Plan order:** 1 of 4. Subsequent plans (`4.1-5.4`, `6.1-8.1`, `9.1-9.19`) build on this one.
> **Status:** Not started
> **Created:** 2026-05-02
> **Branch suggestion:** `feat/phase-12-clipper-pipeline` (branch from `main` after phase-11 lands)

---

## Goal

Land the **main-process foundation** for the in-app web clipper: dependencies, the `clips` SQLite table (migration 005), shared TypeScript types, the **Readability extractor** (`extract` + `enrich` + degraded fallback), and the **HTML→Markdown transformer** (`turndown` + GFM + clean-up rules). After this plan, main-process modules can take a `WebContents` and return a clean Markdown body + enriched frontmatter inputs — but nothing is wired to the UI or pipeline orchestrator yet.

## Architecture

- **Extraction runs in the tab's renderer** via `webContents.executeJavaScript(readabilityBundle)` so we get Readability's DOM-aware parse without a Node-side `jsdom`. The bundle is the prebuilt `@mozilla/readability` UMD source, inlined as a string at module load.
- **Transformation runs in main-process Node** via `turndown` + `turndown-plugin-gfm`. The transformer takes the article HTML + `articleUrl` (for absolute-URL rewriting) and returns Markdown body. Frontmatter is built by enrich + pipeline (Plan 2), not here.
- **Enrichment** is a pure function over `ExtractResult`. It cleans tracking params, normalises `site`/`author`/`published_at`/`lang`, and computes the 160-char `excerpt`. Pure means easy to unit test without an Electron runtime.
- **Types live in `shared/`** so renderer and preload can import them too. We split into two files: `clipper-types.ts` (extract/transform/pipeline shapes) and `clip-types.ts` (DB row model). This split mirrors phase-11's `browser-types.ts` style.
- **Migration 005** follows the established convention: pure SQL file consumed by the existing runner in `electron/services/db/migrations/index.ts`. The runner sets `user_version`; the file does NOT.
- **No IPC, no pipeline, no UI** in this plan. Files compile and unit-test in isolation. Plan 2 owns pipeline + IPC; Plan 3 owns renderer; Plan 4 is acceptance.

## Tech Stack

- `@mozilla/readability` (NEW) — DOM-side article extraction, single UMD file
- `turndown` (NEW) + `turndown-plugin-gfm` (NEW) — HTML → Markdown
- `slugify` (NEW) — used in Plan 2 task 4.2; install now to keep deps in one PR
- `@node-rs/jieba` (existing) — Chinese segmentation for slug rule (used in Plan 2)
- `better-sqlite3@^12` (existing) — migration runner
- `vitest@^2` (existing) — unit tests
- Node 22+, Electron 39 (existing)

## Files Touched (this plan)

| Path                                                | Action                  | Owner task         |
| --------------------------------------------------- | ----------------------- | ------------------ |
| `package.json`                                      | Modify (add deps)       | 1.1                |
| `electron/services/db/migrations/005_clips.sql`     | Create                  | 1.2                |
| `electron/services/db/migrations/005_clips.test.ts` | Create                  | 1.2                |
| `shared/clipper-types.ts`                           | Create                  | 1.3                |
| `shared/clip-types.ts`                              | Create                  | 1.4                |
| `electron/clipper/readability-bundle.ts`            | Create                  | 2.1                |
| `electron/clipper/readability-bundle.test.ts`       | Create                  | 2.1                |
| `electron/clipper/extract.ts`                       | Create stub → implement | 2.2, 2.3           |
| `electron/clipper/extract.test.ts`                  | Create                  | 2.2, 2.3           |
| `electron/clipper/enrich.ts`                        | Create                  | 2.4                |
| `electron/clipper/enrich.test.ts`                   | Create                  | 2.4                |
| `electron/clipper/transform.ts`                     | Create stub → implement | 3.1, 3.2, 3.3, 3.4 |
| `electron/clipper/transform.test.ts`                | Create                  | 3.1, 3.2, 3.3, 3.4 |

## Pre-flight

- Phase-11 deliverables (`electron/browser/manager.ts`, `src/stores/browser.ts`, AddressBar with clip placeholder) must be merged. Verify:
  ```bash
  test -f electron/browser/manager.ts && test -f src/components/browser/AddressBar.tsx && echo "phase-11 ok"
  ```
  Expected: `phase-11 ok`. If missing, **stop** and rebase on phase-11 main.
- Verify migration head:
  ```bash
  ls electron/services/db/migrations | sort | tail -3
  ```
  Expected: `003_file_columns.sql 004_bookmarks.sql index.ts` (or similar — `004_bookmarks.sql` is phase-11). If `005_*.sql` already exists, **stop and reconcile**.
- Verify Readability ships a single UMD file:
  ```bash
  npm view @mozilla/readability dist
  ```
  Expected: lists `Readability.js` or similar single-file entry.
- Verify Turndown is ESM-or-CJS importable from main:
  ```bash
  node -e "const TurndownService = require('turndown'); console.log(typeof TurndownService)"
  ```
  Expected: `function`.

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Add npm dependencies

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install --save \
  @mozilla/readability@^0.5.0 \
  turndown@^7.2.0 \
  turndown-plugin-gfm@^1.0.2 \
  slugify@^1.6.6
```

- [ ] **Step 2: Install dev type deps**

```bash
npm install --save-dev @types/turndown@^5.0.5
```

(`@mozilla/readability`, `turndown-plugin-gfm`, and `slugify` ship their own types or have built-ins; only `turndown` needs an external type package.)

- [ ] **Step 3: Verify the four packages resolve**

```bash
node -e "console.log(require('@mozilla/readability/package.json').version, require('turndown/package.json').version, require('turndown-plugin-gfm/package.json').version, require('slugify/package.json').version)"
```

Expected: four version strings, no `MODULE_NOT_FOUND`.

- [ ] **Step 4: Typecheck unchanged**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-12): add @mozilla/readability, turndown, turndown-plugin-gfm, slugify"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Migration 005 — `clips` table

**Files:**

- Create: `electron/services/db/migrations/005_clips.sql`
- Create: `electron/services/db/migrations/005_clips.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
// electron/services/db/migrations/005_clips.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { applyMigrations } from '../migrations'

const MIGRATIONS_DIR = join(__dirname)

describe('migration 005_clips', () => {
  it('creates clips table with correct schema and bumps user_version to 5', () => {
    const db = new Database(':memory:')
    applyMigrations(db, MIGRATIONS_DIR)

    expect(db.pragma('user_version', { simple: true })).toBe(5)

    const cols = db.prepare(`PRAGMA table_info(clips)`).all() as {
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }[]
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

    expect(byName.id).toMatchObject({ type: 'INTEGER', pk: 1 })
    expect(byName.url).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.path).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.title?.type).toBe('TEXT')
    expect(byName.site?.type).toBe('TEXT')
    expect(byName.author?.type).toBe('TEXT')
    expect(byName.published_at?.type).toBe('TEXT')
    expect(byName.clipped_at).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(byName.excerpt?.type).toBe('TEXT')
    expect(byName.content_length?.type).toBe('INTEGER')
    expect(byName.degraded).toMatchObject({ type: 'INTEGER', dflt_value: '0' })
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 })
  })

  it('UNIQUE(url) rejects duplicates', () => {
    const db = new Database(':memory:')
    applyMigrations(db, MIGRATIONS_DIR)

    const insert = db.prepare(
      `INSERT INTO clips(url, path, clipped_at, created_at)
       VALUES (?, ?, ?, ?)`
    )
    insert.run(
      'https://example.com/a',
      'inbox/202605/a.md',
      '2026-05-02T00:00:00Z',
      '2026-05-02T00:00:00Z'
    )
    expect(() =>
      insert.run(
        'https://example.com/a',
        'inbox/202605/a-dup.md',
        '2026-05-02T00:00:01Z',
        '2026-05-02T00:00:01Z'
      )
    ).toThrow(/UNIQUE/)
  })

  it('idx_clips_clipped_at and idx_clips_site exist', () => {
    const db = new Database(':memory:')
    applyMigrations(db, MIGRATIONS_DIR)

    const idx = db.prepare(`PRAGMA index_list(clips)`).all() as { name: string }[]
    const names = idx.map((i) => i.name)
    expect(names).toContain('idx_clips_clipped_at')
    expect(names).toContain('idx_clips_site')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run electron/services/db/migrations/005_clips.test.ts
```

Expected: FAIL — `005_clips.sql` not found OR `clips` table missing.

- [ ] **Step 3: Create the migration SQL**

```sql
-- electron/services/db/migrations/005_clips.sql
-- migration: 005_clips
-- Adds the `clips` table for phase-12 web clipper.
-- The runner sets PRAGMA user_version = 5 after applying this file.

CREATE TABLE clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  site TEXT,
  author TEXT,
  published_at TEXT,
  clipped_at TEXT NOT NULL,
  excerpt TEXT,
  content_length INTEGER,
  degraded INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_clips_clipped_at ON clips(clipped_at DESC);
CREATE INDEX idx_clips_site ON clips(site);
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run electron/services/db/migrations/005_clips.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Run the full migrations suite for no regression**

```bash
npx vitest run electron/services/db
```

Expected: all migration tests green (001/002/003/004/005).

- [ ] **Step 6: Verify dev runner copies the new SQL**

```bash
node scripts/copy-sql-migrations.mjs
test -f out/main/migrations/005_clips.sql && echo "copied"
```

Expected: `copied`. If `out/main/migrations/` does not yet exist (no prior dev build), skip the test and just confirm the script lists `005_clips.sql` in its log.

- [ ] **Step 7: Commit**

```bash
git add electron/services/db/migrations/005_clips.sql electron/services/db/migrations/005_clips.test.ts
git commit -m "feat(phase-12): migration 005 — clips table + indices"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Shared clipper types (`shared/clipper-types.ts`)

**Files:**

- Create: `shared/clipper-types.ts`

- [ ] **Step 1: Create the types file**

```ts
// shared/clipper-types.ts
// Types shared between main, preload, and renderer for the phase-12 web clipper.
// Pipeline state names mirror those used by `src/stores/clipper.ts` (Plan 3 task 6.1).

export type ClipRunId = string

/**
 * Result of the Readability extraction pass that runs inside the tab WebContents.
 * Returned from main-side `extract(webContents)`.
 */
export interface ExtractResult {
  ok: boolean
  /** When ok=false this carries the cause; otherwise omitted. */
  error?: ClipErrorCode
  /** True when fallback path used (Readability returned null). */
  degraded?: boolean
  /** Article title; falls back to `document.title` when Readability is empty. */
  title?: string
  /** Raw byline string from Readability ("By X" prefix not yet stripped). */
  byline?: string
  /** Article HTML body (or `document.body.innerHTML` when degraded). */
  content?: string
  /** Plain-text rendition (Readability.textContent). */
  textContent?: string
  /** Plain-text length in characters. */
  length?: number
  /** Readability-suggested excerpt. */
  excerpt?: string
  /** Site name from `<meta property="og:site_name">` etc. */
  siteName?: string
  /** Article language (lang attribute). */
  lang?: string
  /** ISO 8601 publishedTime when the page exposes it. */
  publishedTime?: string
  /** location.href of the tab at extraction time. */
  url?: string
}

/**
 * Output of enrich(extractResult). Pure function; no IO.
 * Keys may be omitted when the source had nothing usable.
 */
export interface EnrichedResult {
  url: string
  site: string
  title?: string
  author?: string
  publishedTime?: string
  lang?: string
  excerpt?: string
  /** True iff the upstream extract was degraded. */
  degraded: boolean
  /** The article HTML body to feed into the transformer. */
  content: string
  /** Plain-text length (if known). */
  length?: number
}

/**
 * Error codes returned by the clipper subsystem. Carried inside the standard
 * IPC envelope (`ok: false, error: { code, message }`). Distinct from the
 * generic IpcErrorCode set in shared/ipc-contract.ts to keep the union readable.
 */
export type ClipErrorCode =
  | 'E_UNSUPPORTED_SCHEME'
  | 'E_ALREADY_CLIPPED'
  | 'E_EXTRACT_TIMEOUT'
  | 'E_EXTRACT_EMPTY'
  | 'E_TRANSFORM_FAILED'
  | 'E_WRITE_FAILED'
  | 'E_INDEX_FAILED'
  | 'E_DUPLICATE'

/**
 * What the renderer sends to `clipper.saveClip` after editing the preview.
 */
export interface ClipInput {
  /** Pipeline run id that produced the preview; main correlates back to its in-flight state. */
  runId: ClipRunId
  /** Final, possibly edited title. */
  title: string
  /** Final, possibly edited tags (frontmatter `tags: []`). */
  tags: string[]
  /** Final, possibly edited excerpt. */
  excerpt?: string
}

/**
 * Successful clip outcome. Returned to renderer after the save+index+record stage.
 */
export interface ClipResult {
  id: number
  /** Relative-to-vault path of the written markdown file. */
  path: string
  url: string
  title: string
  degraded: boolean
}

/**
 * Pipeline stage names. Used both for IPC error.stage and for the renderer
 * Zustand state machine (Plan 3 task 6.1).
 */
export type ClipStage =
  | 'idle'
  | 'precheck'
  | 'extracting'
  | 'transforming'
  | 'previewing'
  | 'saving'
  | 'indexing'
  | 'done'
  | 'error'
  | 'canceled'

/**
 * Error envelope used inside `{ ok:false, error: { code, message, stage, details? } }`.
 */
export interface ClipErrorEnvelope {
  code: ClipErrorCode
  message: string
  stage: ClipStage
  /** When code='E_ALREADY_CLIPPED', this carries the existing clip pointer. */
  existingId?: number
  existingPath?: string
}

/**
 * What the preview modal receives when extract+transform succeed. Plan 2 task 4.3
 * builds it; this type lives in shared/ so renderer can import.
 */
export interface ClipPreview {
  runId: ClipRunId
  title: string
  url: string
  site: string
  author?: string
  publishedTime?: string
  lang?: string
  excerpt?: string
  /** Markdown body, full length. Renderer truncates to 2000 chars for preview pane. */
  body: string
  /** Suggested target path relative to vault. */
  suggestedPath: string
  /** Default frontmatter tags (always [] at this stage). */
  tags: string[]
  degraded: boolean
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add shared/clipper-types.ts
git commit -m "feat(phase-12): shared clipper types — ExtractResult / ClipInput / ClipResult / errors"
```

---

<!-- openspec-task: 1.4 -->

### Task 4: Shared clip row type (`shared/clip-types.ts`)

**Files:**

- Create: `shared/clip-types.ts`

- [ ] **Step 1: Create the row-model file**

```ts
// shared/clip-types.ts
// Row model + DAO inputs/outputs for the phase-12 `clips` table.

export interface Clip {
  id: number
  url: string
  /** Relative-to-vault path. */
  path: string
  title: string | null
  site: string | null
  author: string | null
  publishedAt: string | null
  /** ISO 8601 with offset, e.g. "2026-05-02T10:23:11+08:00". */
  clippedAt: string
  excerpt: string | null
  contentLength: number | null
  /** Readability fell back to body.innerHTML when true. */
  degraded: boolean
  createdAt: string
}

export interface ClipCreateInput {
  url: string
  path: string
  title?: string | null
  site?: string | null
  author?: string | null
  publishedAt?: string | null
  /** Caller supplies clipped_at; created_at is set inside the DAO. */
  clippedAt: string
  excerpt?: string | null
  contentLength?: number | null
  degraded?: boolean
}

export type ClipsListOrderBy = 'clipped_at' | 'title'

export interface ClipsListOpts {
  q?: string
  site?: string
  limit: number
  offset: number
  orderBy?: ClipsListOrderBy
}

export interface ClipsListResult {
  items: Clip[]
  total: number
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add shared/clip-types.ts
git commit -m "feat(phase-12): shared Clip row model + DAO input/output types"
```

---

<!-- openspec-task: 2.1 -->

### Task 5: `readability-bundle.ts` — inline Readability source

`@mozilla/readability` ships a single UMD file (`Readability.js`) safe to inject via `webContents.executeJavaScript`. We read it at module load (synchronously, since it's a few KB and only runs at startup) and export the source string + a runtime check.

**Files:**

- Create: `electron/clipper/readability-bundle.ts`
- Create: `electron/clipper/readability-bundle.test.ts`

- [ ] **Step 1: Identify the bundle path**

```bash
node -e "console.log(require.resolve('@mozilla/readability'))"
```

Expected output ends with `node_modules/@mozilla/readability/index.js` or `Readability.js`. Note this path; we resolve at runtime.

- [ ] **Step 2: Write failing test**

```ts
// electron/clipper/readability-bundle.test.ts
import { describe, it, expect } from 'vitest'
import { readabilityBundleSource, READABILITY_INJECT_MARKER } from './readability-bundle'

describe('readability-bundle', () => {
  it('exports a non-empty source string', () => {
    expect(typeof readabilityBundleSource).toBe('string')
    expect(readabilityBundleSource.length).toBeGreaterThan(1000)
  })

  it('source defines `Readability` as a global symbol after evaluation', () => {
    expect(readabilityBundleSource).toMatch(/Readability/)
  })

  it('READABILITY_INJECT_MARKER is a unique string suitable for skip-when-already-injected', () => {
    expect(READABILITY_INJECT_MARKER).toMatch(/^__acornvo_readability/)
  })
})
```

- [ ] **Step 3: Confirm fails**

```bash
npx vitest run electron/clipper/readability-bundle.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the module**

```ts
// electron/clipper/readability-bundle.ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Marker we install on `window` after injection so a second call to
 * `extract()` on the same WebContents skips re-injection. Exported because
 * extract.ts references it.
 */
export const READABILITY_INJECT_MARKER = '__acornvo_readability_injected__'

/**
 * Locate the Readability UMD source. We use `require.resolve` to find the
 * package root and then pick the file Mozilla publishes for browser use.
 *
 * Mozilla publishes `Readability.js` as a standalone UMD bundle; the package's
 * `main` entry (`index.js`) re-exports it. We prefer the standalone file when
 * present because evaluating it on `window` defines `Readability` as a global.
 */
function locateBundlePath(): string {
  const pkgPath = require.resolve('@mozilla/readability/package.json')
  const root = dirname(pkgPath)
  // Prefer the standalone UMD file
  return join(root, 'Readability.js')
}

let cached: string | null = null

function loadSource(): string {
  if (cached !== null) return cached
  const path = locateBundlePath()
  const raw = readFileSync(path, 'utf8')
  // Wrap with the injection marker so we can detect double-injection in extract.ts.
  cached = `;(function(){
  if (window['${READABILITY_INJECT_MARKER}']) return;
  ${raw}
  window['${READABILITY_INJECT_MARKER}'] = true;
})();`
  return cached
}

/**
 * The full JS source to evaluate inside a tab WebContents. After evaluation
 * `window.Readability` is defined and a marker prevents re-evaluation.
 */
export const readabilityBundleSource: string = loadSource()
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run electron/clipper/readability-bundle.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/clipper/readability-bundle.ts electron/clipper/readability-bundle.test.ts
git commit -m "feat(phase-12): inline @mozilla/readability bundle for executeJavaScript injection"
```

---

<!-- openspec-task: 2.2 -->

### Task 6: `extract.ts` — `extract(webContents)` with 5s timeout

Pure orchestration: inject the bundle, run the extraction snippet, surface a typed result. We split into `createExtractor(deps)` for testability and a thin singleton convenience.

**Files:**

- Create: `electron/clipper/extract.ts`
- Create: `electron/clipper/extract.test.ts`

- [ ] **Step 1: Write failing tests (skeleton + happy path + timeout)**

```ts
// electron/clipper/extract.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createExtractor } from './extract'

function makeWebContents(opts: {
  injectImpl?: () => Promise<unknown>
  parseImpl?: () => Promise<unknown>
  isDestroyed?: () => boolean
}) {
  const calls: string[] = []
  return {
    isDestroyed: opts.isDestroyed ?? (() => false),
    executeJavaScript: vi.fn(async (code: string) => {
      // First call is the injection bundle; second call is the parse snippet.
      if (code.includes('__acornvo_readability_injected__')) {
        calls.push('inject')
        if (opts.injectImpl) return opts.injectImpl()
        return undefined
      }
      calls.push('parse')
      if (opts.parseImpl) return opts.parseImpl()
      return undefined
    }),
    __calls: calls
  } as any
}

describe('extract', () => {
  it('returns ok=true with extracted fields on the happy path', async () => {
    const wc = makeWebContents({
      parseImpl: async () => ({
        ok: true,
        title: 'Hello',
        byline: 'By Jane',
        content: '<p>Hi</p>',
        textContent: 'Hi',
        length: 2,
        excerpt: 'Hi excerpt',
        siteName: 'Example',
        lang: 'en',
        publishedTime: '2026-04-19T00:00:00Z',
        url: 'https://example.com/a'
      })
    })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(true)
    expect(r.title).toBe('Hello')
    expect(r.byline).toBe('By Jane')
    expect(r.content).toBe('<p>Hi</p>')
    expect(r.url).toBe('https://example.com/a')
    expect(wc.__calls).toEqual(['inject', 'parse'])
  })

  it('returns E_EXTRACT_TIMEOUT when executeJavaScript exceeds timeoutMs', async () => {
    const wc = makeWebContents({
      parseImpl: () => new Promise(() => {}) // never resolves
    })
    const e = createExtractor({ timeoutMs: 50 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('E_EXTRACT_TIMEOUT')
  })

  it('returns E_EXTRACT_EMPTY when the in-page snippet reports ok=false', async () => {
    const wc = makeWebContents({
      parseImpl: async () => ({ ok: false, error: 'snippet boom' })
    })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('E_EXTRACT_EMPTY')
  })

  it('returns E_EXTRACT_EMPTY when WebContents is destroyed before call', async () => {
    const wc = makeWebContents({ isDestroyed: () => true })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('E_EXTRACT_EMPTY')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/extract.test.ts
```

Expected: FAIL — `createExtractor` not exported.

- [ ] **Step 3: Implement `extract.ts`**

```ts
// electron/clipper/extract.ts
import type { WebContents } from 'electron'
import type { ExtractResult } from '@shared/clipper-types'
import { readabilityBundleSource } from './readability-bundle'

export interface ExtractorDeps {
  /** Per-call timeout for both injection and parse. */
  timeoutMs: number
}

export interface Extractor {
  extract(webContents: WebContents): Promise<ExtractResult>
}

/**
 * The snippet evaluated inside the tab. Calls `Readability(...).parse()`.
 * When `parse()` returns null we surface ok:false so the caller can decide
 * whether to fall back to body.innerHTML (handled in task 2.3).
 */
const PARSE_SNIPPET = `
(function(){
  try {
    if (typeof Readability !== 'function') {
      return { ok: false, error: 'no_readability' };
    }
    const docClone = document.cloneNode(true);
    const reader = new Readability(docClone);
    const article = reader.parse();
    if (!article) {
      return { ok: false, error: 'no_article' };
    }
    return {
      ok: true,
      title: article.title || document.title || '',
      byline: article.byline || '',
      content: article.content || '',
      textContent: article.textContent || '',
      length: article.length || 0,
      excerpt: article.excerpt || '',
      siteName: article.siteName || '',
      lang: article.lang || document.documentElement.lang || '',
      publishedTime: article.publishedTime || '',
      url: location.href
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})();
`

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | { __timeout: true }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ __timeout: true } as const), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        // Treat thrown errors as timeout/empty for the caller; extract is best-effort.
        resolve({ __timeout: true } as const)
      }
    )
  })
}

export function createExtractor(deps: ExtractorDeps): Extractor {
  return {
    async extract(webContents) {
      if (webContents.isDestroyed()) {
        return { ok: false, error: 'E_EXTRACT_EMPTY' }
      }

      // Inject the bundle. If the marker already exists, the IIFE early-returns.
      const injected = await withTimeout(
        webContents.executeJavaScript(readabilityBundleSource, true),
        deps.timeoutMs
      )
      if (typeof injected === 'object' && injected !== null && '__timeout' in injected) {
        return { ok: false, error: 'E_EXTRACT_TIMEOUT' }
      }
      if (webContents.isDestroyed()) {
        return { ok: false, error: 'E_EXTRACT_EMPTY' }
      }

      const parsed = await withTimeout(
        webContents.executeJavaScript(PARSE_SNIPPET, true),
        deps.timeoutMs
      )
      if (typeof parsed === 'object' && parsed !== null && '__timeout' in parsed) {
        return { ok: false, error: 'E_EXTRACT_TIMEOUT' }
      }

      const r = parsed as { ok?: boolean; error?: string; [k: string]: unknown }
      if (!r || r.ok !== true) {
        return { ok: false, error: 'E_EXTRACT_EMPTY' }
      }

      return {
        ok: true,
        title: (r.title as string) || undefined,
        byline: (r.byline as string) || undefined,
        content: (r.content as string) || undefined,
        textContent: (r.textContent as string) || undefined,
        length: (r.length as number) || undefined,
        excerpt: (r.excerpt as string) || undefined,
        siteName: (r.siteName as string) || undefined,
        lang: (r.lang as string) || undefined,
        publishedTime: (r.publishedTime as string) || undefined,
        url: (r.url as string) || undefined
      }
    }
  }
}

// --- singleton convenience ---
let singleton: Extractor | null = null
export function getExtractor(): Extractor {
  if (!singleton) singleton = createExtractor({ timeoutMs: 5000 })
  return singleton
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/extract.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/clipper/extract.ts electron/clipper/extract.test.ts
git commit -m "feat(phase-12): extract — Readability injection + parse + 5s timeout"
```

---

<!-- openspec-task: 2.3 -->

### Task 7: `extract.ts` — degraded fallback (`article=null` → `body.innerHTML`)

When Readability returns null, the spec says we fall back to `document.body.innerHTML` and mark the result `degraded: true`. We extend the in-page snippet to do that — it's cheaper than a second round-trip.

**Files:**

- Modify: `electron/clipper/extract.ts`
- Modify: `electron/clipper/extract.test.ts`

- [ ] **Step 1: Add failing tests for the fallback path**

Append to `electron/clipper/extract.test.ts`:

```ts
describe('extract — degraded fallback', () => {
  it('returns ok=true degraded=true when Readability parse returns null', async () => {
    const wc = makeWebContents({
      parseImpl: async () => ({
        ok: true,
        degraded: true,
        title: 'Doc Title',
        content: '<body><p>raw</p></body>',
        textContent: 'raw',
        length: 3,
        url: 'https://example.com/x',
        lang: 'en'
      })
    })
    const e = createExtractor({ timeoutMs: 5000 })
    const r = await e.extract(wc)
    expect(r.ok).toBe(true)
    expect(r.degraded).toBe(true)
    expect(r.title).toBe('Doc Title')
    expect(r.content).toBe('<body><p>raw</p></body>')
  })
})
```

- [ ] **Step 2: Confirm new test fails**

```bash
npx vitest run electron/clipper/extract.test.ts -t "degraded"
```

Expected: FAIL — `degraded` not propagated.

- [ ] **Step 3: Update the in-page snippet to fall back**

In `electron/clipper/extract.ts`, replace the `PARSE_SNIPPET` constant body with:

```ts
const PARSE_SNIPPET = `
(function(){
  try {
    if (typeof Readability !== 'function') {
      return { ok: false, error: 'no_readability' };
    }
    const docClone = document.cloneNode(true);
    const reader = new Readability(docClone);
    const article = reader.parse();
    if (article) {
      return {
        ok: true,
        degraded: false,
        title: article.title || document.title || '',
        byline: article.byline || '',
        content: article.content || '',
        textContent: article.textContent || '',
        length: article.length || 0,
        excerpt: article.excerpt || '',
        siteName: article.siteName || '',
        lang: article.lang || document.documentElement.lang || '',
        publishedTime: article.publishedTime || '',
        url: location.href
      };
    }
    // Fallback: Readability could not extract an article. Capture full body.
    const bodyHtml = document.body ? document.body.innerHTML : '';
    if (!bodyHtml) {
      return { ok: false, error: 'no_article_no_body' };
    }
    const text = (document.body && document.body.innerText) ? document.body.innerText : '';
    return {
      ok: true,
      degraded: true,
      title: document.title || '',
      byline: '',
      content: bodyHtml,
      textContent: text,
      length: text.length,
      excerpt: text.slice(0, 160),
      siteName: '',
      lang: document.documentElement.lang || '',
      publishedTime: '',
      url: location.href
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})();
`
```

Then update the result-mapping block in `extract()` to propagate `degraded`:

```ts
return {
  ok: true,
  degraded: r.degraded === true ? true : undefined,
  title: (r.title as string) || undefined,
  byline: (r.byline as string) || undefined,
  content: (r.content as string) || undefined,
  textContent: (r.textContent as string) || undefined,
  length: (r.length as number) || undefined,
  excerpt: (r.excerpt as string) || undefined,
  siteName: (r.siteName as string) || undefined,
  lang: (r.lang as string) || undefined,
  publishedTime: (r.publishedTime as string) || undefined,
  url: (r.url as string) || undefined
}
```

- [ ] **Step 4: Run all extract tests**

```bash
npx vitest run electron/clipper/extract.test.ts
```

Expected: all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add electron/clipper/extract.ts electron/clipper/extract.test.ts
git commit -m "feat(phase-12): extract — fallback to body.innerHTML; mark degraded=true"
```

---

<!-- openspec-task: 2.4 -->

### Task 8: `enrich.ts` — URL clean, site, author, published_at, lang, excerpt

Pure function. No webContents access; takes an `ExtractResult`, returns `EnrichedResult`. This makes pipeline composable and unit-testable.

**Files:**

- Create: `electron/clipper/enrich.ts`
- Create: `electron/clipper/enrich.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/clipper/enrich.test.ts
import { describe, it, expect } from 'vitest'
import { enrich, cleanUrl } from './enrich'
import type { ExtractResult } from '@shared/clipper-types'

function ex(over: Partial<ExtractResult>): ExtractResult {
  return {
    ok: true,
    title: 'T',
    content: '<p>x</p>',
    url: 'https://www.example.com/a',
    ...over
  }
}

describe('cleanUrl', () => {
  it('strips hash and known tracking params', () => {
    expect(cleanUrl('https://www.example.com/a?utm_source=x&id=1#section')).toBe(
      'https://www.example.com/a?id=1'
    )
  })
  it('removes utm_*, fbclid, gclid, ref', () => {
    expect(cleanUrl('https://x.com/p?utm_medium=m&fbclid=abc&gclid=xy&ref=foo&q=1')).toBe(
      'https://x.com/p?q=1'
    )
  })
  it('keeps the URL unchanged when no tracking params', () => {
    expect(cleanUrl('https://x.com/p?id=1')).toBe('https://x.com/p?id=1')
  })
  it('returns input on parse failure', () => {
    expect(cleanUrl('not a url')).toBe('not a url')
  })
})

describe('enrich', () => {
  it('site = hostname without leading www.', () => {
    const r = enrich(ex({ url: 'https://www.example.com/a' }))
    expect(r.site).toBe('example.com')
  })

  it('site keeps non-www subdomains', () => {
    const r = enrich(ex({ url: 'https://blog.example.com/a' }))
    expect(r.site).toBe('blog.example.com')
  })

  it('author strips "By " prefix and trims', () => {
    const r = enrich(ex({ byline: '  By  Jane Doe  ' }))
    expect(r.author).toBe('Jane Doe')
  })

  it('author handles "by" lowercase prefix', () => {
    const r = enrich(ex({ byline: 'by John' }))
    expect(r.author).toBe('John')
  })

  it('author omitted when byline empty/whitespace', () => {
    const r = enrich(ex({ byline: '   ' }))
    expect(r.author).toBeUndefined()
  })

  it('publishedTime forwarded when present', () => {
    const r = enrich(ex({ publishedTime: '2026-04-19T00:00:00Z' }))
    expect(r.publishedTime).toBe('2026-04-19T00:00:00Z')
  })

  it('publishedTime omitted when extract did not provide one', () => {
    const r = enrich(ex({}))
    expect(r.publishedTime).toBeUndefined()
  })

  it('lang forwarded; omitted when empty', () => {
    expect(enrich(ex({ lang: 'zh' })).lang).toBe('zh')
    expect(enrich(ex({})).lang).toBeUndefined()
  })

  it('excerpt = Readability excerpt truncated to 160 chars', () => {
    const long = 'x'.repeat(500)
    const r = enrich(ex({ excerpt: long }))
    expect(r.excerpt?.length).toBe(160)
  })

  it('excerpt falls back to textContent when Readability excerpt is empty', () => {
    const r = enrich(ex({ excerpt: '', textContent: 'plain body text' }))
    expect(r.excerpt).toBe('plain body text')
  })

  it('excerpt omitted when both sources empty', () => {
    const r = enrich(ex({ excerpt: '', textContent: '' }))
    expect(r.excerpt).toBeUndefined()
  })

  it('degraded propagated through', () => {
    expect(enrich(ex({ degraded: true })).degraded).toBe(true)
    expect(enrich(ex({})).degraded).toBe(false)
  })

  it('title preferred from extract; missing → undefined (pipeline will fallback to webContents.getTitle)', () => {
    expect(enrich(ex({ title: 'A' })).title).toBe('A')
    expect(enrich(ex({ title: '' })).title).toBeUndefined()
  })

  it('content forwarded as-is', () => {
    const r = enrich(ex({ content: '<article>hi</article>' }))
    expect(r.content).toBe('<article>hi</article>')
  })

  it('throws when extract has no url (pipeline pre-condition broken)', () => {
    expect(() => enrich({ ok: true, content: '<p>x</p>' } as any)).toThrow(/url/i)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/enrich.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `enrich.ts`**

```ts
// electron/clipper/enrich.ts
import type { EnrichedResult, ExtractResult } from '@shared/clipper-types'

const TRACKING_PARAM_PREFIXES = ['utm_'] as const
const TRACKING_PARAM_NAMES = new Set(['fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid', 'igshid'])

/**
 * Strip tracking params and the URL hash. Leaves the remainder unchanged.
 * Pure helper; exported because pipeline + dedupe both call it.
 */
export function cleanUrl(input: string): string {
  let u: URL
  try {
    u = new URL(input)
  } catch {
    return input
  }
  // Drop the hash entirely.
  u.hash = ''
  const params = u.searchParams
  const drop: string[] = []
  for (const [k] of params) {
    const lk = k.toLowerCase()
    if (TRACKING_PARAM_NAMES.has(lk)) {
      drop.push(k)
      continue
    }
    if (TRACKING_PARAM_PREFIXES.some((pref) => lk.startsWith(pref))) {
      drop.push(k)
    }
  }
  for (const k of drop) params.delete(k)
  // URL.toString() preserves trailing `?` only if there are still params; remove if empty.
  let out = u.toString()
  if (out.endsWith('?')) out = out.slice(0, -1)
  return out
}

function siteFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return ''
  }
}

function cleanAuthor(byline: string | undefined): string | undefined {
  if (!byline) return undefined
  const trimmed = byline.replace(/^\s*[Bb]y\s+/, '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function pickExcerpt(extract: ExtractResult): string | undefined {
  const candidate =
    (extract.excerpt && extract.excerpt.trim()) ||
    (extract.textContent && extract.textContent.trim()) ||
    ''
  if (!candidate) return undefined
  return candidate.length > 160 ? candidate.slice(0, 160) : candidate
}

/**
 * Pure: turn the raw ExtractResult into an EnrichedResult. URL is cleaned,
 * site is derived from hostname, author is byline-stripped, excerpt is capped
 * at 160 chars, and degraded propagates.
 *
 * @throws when extract.url is missing — pipeline must catch this before save.
 */
export function enrich(extract: ExtractResult): EnrichedResult {
  if (!extract.url) {
    throw new Error('enrich: extract.url is required')
  }
  const url = cleanUrl(extract.url)
  return {
    url,
    site: siteFromUrl(url),
    title: extract.title && extract.title.trim().length > 0 ? extract.title : undefined,
    author: cleanAuthor(extract.byline),
    publishedTime:
      extract.publishedTime && extract.publishedTime.trim().length > 0
        ? extract.publishedTime
        : undefined,
    lang: extract.lang && extract.lang.trim().length > 0 ? extract.lang : undefined,
    excerpt: pickExcerpt(extract),
    degraded: extract.degraded === true,
    content: extract.content ?? '',
    length: extract.length
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/enrich.test.ts
```

Expected: 17 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/clipper/enrich.ts electron/clipper/enrich.test.ts
git commit -m "feat(phase-12): enrich — cleanUrl + site/author/excerpt/lang/degraded"
```

---

<!-- openspec-task: 3.1 -->

### Task 9: `transform.ts` — Turndown instance + GFM plugin + base options

Plain TDD: a single `transformHtmlToMarkdown(html, baseUrl)` entry point. We accept `baseUrl` so tasks 3.3 (relative→absolute) and the renderer-preview pane have a single signature to call.

**Files:**

- Create: `electron/clipper/transform.ts`
- Create: `electron/clipper/transform.test.ts`

- [ ] **Step 1: Write failing tests for the base options**

````ts
// electron/clipper/transform.test.ts
import { describe, it, expect } from 'vitest'
import { transformHtmlToMarkdown } from './transform'

describe('transform — base options', () => {
  it('headings use atx style (#)', () => {
    expect(transformHtmlToMarkdown('<h1>A</h1>', 'https://x/').trim()).toBe('# A')
    expect(transformHtmlToMarkdown('<h3>B</h3>', 'https://x/').trim()).toBe('### B')
  })

  it('strong = ** , em = *', () => {
    expect(transformHtmlToMarkdown('<p><strong>x</strong></p>', 'https://x/').trim()).toBe('**x**')
    expect(transformHtmlToMarkdown('<p><em>y</em></p>', 'https://x/').trim()).toBe('*y*')
  })

  it('bullet list uses - marker', () => {
    const md = transformHtmlToMarkdown('<ul><li>a</li><li>b</li></ul>', 'https://x/')
    expect(md.trim()).toBe('- a\n- b')
  })

  it('horizontal rule renders as ---', () => {
    expect(transformHtmlToMarkdown('<hr/>', 'https://x/').trim()).toBe('---')
  })

  it('fenced code block keeps language class', () => {
    const md = transformHtmlToMarkdown(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
      'https://x/'
    )
    expect(md).toContain('```ts')
    expect(md).toContain('const a = 1;')
    expect(md).toContain('```')
  })

  it('GFM tables produce markdown tables', () => {
    const html =
      '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('| h1 | h2 |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| a | b |')
  })

  it('inline links use [text](url) form', () => {
    expect(
      transformHtmlToMarkdown('<a href="https://x.com/y">go</a>', 'https://x.com/').trim()
    ).toBe('[go](https://x.com/y)')
  })

  it('image with alt + title round-trips', () => {
    expect(
      transformHtmlToMarkdown(
        '<img src="https://cdn/x.png" alt="figure" title="t">',
        'https://x/'
      ).trim()
    ).toBe('![figure](https://cdn/x.png "t")')
  })
})
````

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/transform.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `transform.ts` (base, no cleanup yet)**

````ts
// electron/clipper/transform.ts
import TurndownService from 'turndown'
// turndown-plugin-gfm exposes a `gfm` named export plus standalone helpers.
import { gfm } from 'turndown-plugin-gfm'

let cachedService: TurndownService | null = null

function makeService(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    bulletListMarker: '-',
    linkStyle: 'inlined',
    hr: '---',
    fence: '```'
  })
  td.use(gfm)
  return td
}

function getService(): TurndownService {
  if (!cachedService) cachedService = makeService()
  return cachedService
}

/**
 * Transform an HTML body to Markdown.
 *
 * @param html article HTML (without `<html>` / `<head>` wrappers)
 * @param baseUrl absolute URL of the source page; used in task 3.3 to
 *   resolve relative href/src. Stored on the function signature now to keep
 *   the public API stable.
 */
export function transformHtmlToMarkdown(html: string, baseUrl: string): string {
  // baseUrl is intentionally unused at this stage; tasks 3.2/3.3/3.4 wire it in.
  void baseUrl
  return getService().turndown(html)
}
````

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/transform.test.ts
```

Expected: 8 passed. (If "fenced code with language class" fails, Turndown's default doesn't honour `class="language-*"` automatically — we'll fix it via a custom rule in step 5.)

- [ ] **Step 5: Add custom rule for `class="language-*"` if step 4 flagged it**

If the language-class test failed, append inside `makeService()` before returning:

````ts
td.addRule('fencedCodeWithLanguage', {
  filter: function (node) {
    return node.nodeName === 'PRE' && node.firstChild != null && node.firstChild.nodeName === 'CODE'
  },
  replacement: function (_content, node) {
    const code = (node as HTMLElement).firstChild as HTMLElement
    const cls = code.getAttribute('class') || ''
    const m = /language-([\w+-]+)/.exec(cls)
    const lang = m ? m[1] : ''
    const text = code.textContent || ''
    return '\n\n```' + lang + '\n' + text + '\n```\n\n'
  }
})
````

Re-run tests; expected green.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/clipper/transform.ts electron/clipper/transform.test.ts
git commit -m "feat(phase-12): transform — turndown + gfm + atx/fenced/code-language options"
```

---

<!-- openspec-task: 3.2 -->

### Task 10: `transform.ts` — HTML pre-clean (script/style/comments + attribute strip)

Add a sanitisation pass via Turndown remove-rules + a regex-driven attribute-strip on the input string. We avoid a full DOM parser to keep main lean.

**Files:**

- Modify: `electron/clipper/transform.ts`
- Modify: `electron/clipper/transform.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `transform.test.ts`:

````ts
describe('transform — HTML pre-clean', () => {
  it('removes <script>/<style>/<noscript>', () => {
    const html =
      '<script>alert(1)</script><style>p{}</style><noscript>fallback</noscript><p>hello</p>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md.trim()).toBe('hello')
  })

  it('removes HTML comments', () => {
    const html = '<!-- hi --><p>only</p><!-- bye -->'
    expect(transformHtmlToMarkdown(html, 'https://x/').trim()).toBe('only')
  })

  it('strips class / id / data-* / style / srcset from output', () => {
    const html =
      '<p class="x" id="y" data-track="1" style="color:red"><img src="https://cdn/a.png" srcset="https://cdn/a.png 1x" alt="a">hello</p>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).not.toMatch(/class=/)
    expect(md).not.toMatch(/data-/)
    expect(md).not.toMatch(/srcset/)
    expect(md).toContain('hello')
    expect(md).toContain('![a](https://cdn/a.png)')
  })

  it('keeps href / src / alt / title / language-* class on code', () => {
    const html =
      '<a href="https://x/y" title="t">go</a><pre><code class="language-py">a=1</code></pre>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('[go](https://x/y "t")')
    expect(md).toContain('```py')
  })
})
````

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/transform.test.ts -t "pre-clean"
```

Expected: FAIL.

- [ ] **Step 3: Add the cleanup pass to `transform.ts`**

In `transform.ts`, register removal rules inside `makeService()` (after the language-fence rule):

```ts
td.addRule('removeScriptStyleNoscript', {
  filter: ['script', 'style', 'noscript'] as TurndownService.Filter,
  replacement: () => ''
})
td.addRule('removeComments', {
  filter: function (node) {
    return node.nodeType === 8 // COMMENT_NODE
  },
  replacement: () => ''
})
```

Then add a pre-pass that strips dangerous/cluttering attributes from the **string** before Turndown sees it. Replace the body of `transformHtmlToMarkdown` with:

```ts
export function transformHtmlToMarkdown(html: string, baseUrl: string): string {
  void baseUrl // task 3.3 wires this in
  const cleaned = stripUnwantedAttributes(html)
  return getService().turndown(cleaned)
}

/**
 * Cheap regex sweep: remove `class`, `id`, `data-*`, `style`, `srcset`
 * attributes from any tag. Preserves `class="language-*"` on `<code>` so the
 * fenced-code rule can read the language. Naïve but adequate for Readability
 * output, which is already simplified.
 */
function stripUnwantedAttributes(html: string): string {
  // Preserve language-* class on <code> by temporarily renaming it.
  const PROTECT = '__acornvo_keep_lang__'
  let s = html.replace(/<code\s+class="(language-[\w+-]+)"/gi, (_m, lang) => {
    return `<code ${PROTECT}="${lang}"`
  })
  // Drop class="..." entirely.
  s = s.replace(/\sclass="[^"]*"/gi, '')
  // Drop id="..."
  s = s.replace(/\sid="[^"]*"/gi, '')
  // Drop any data-foo="..."
  s = s.replace(/\sdata-[a-z0-9-]+="[^"]*"/gi, '')
  // Drop style="..."
  s = s.replace(/\sstyle="[^"]*"/gi, '')
  // Drop srcset="..."
  s = s.replace(/\ssrcset="[^"]*"/gi, '')
  // Restore language-* class on <code>.
  s = s.replace(new RegExp(`${PROTECT}="(language-[\\w+-]+)"`, 'gi'), 'class="$1"')
  return s
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/transform.test.ts
```

Expected: all green (12+).

- [ ] **Step 5: Commit**

```bash
git add electron/clipper/transform.ts electron/clipper/transform.test.ts
git commit -m "feat(phase-12): transform — strip script/style/noscript/comments + cleanup attrs"
```

---

<!-- openspec-task: 3.3 -->

### Task 11: `transform.ts` — relative href/src → absolute via baseUrl

Add an `absolutiseUrls(html, baseUrl)` pre-pass that rewrites `href="..."` and `src="..."` to absolute. This lets the markdown body open links/images standalone.

**Files:**

- Modify: `electron/clipper/transform.ts`
- Modify: `electron/clipper/transform.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe('transform — absolute URLs', () => {
  it('rewrites <a href="/x"> to absolute', () => {
    const html = '<a href="/x">go</a>'
    const md = transformHtmlToMarkdown(html, 'https://example.com/a/b')
    expect(md.trim()).toBe('[go](https://example.com/x)')
  })

  it('rewrites <img src="../img.png"> to absolute', () => {
    const html = '<img src="../img.png" alt="i">'
    const md = transformHtmlToMarkdown(html, 'https://example.com/a/b/c')
    expect(md.trim()).toBe('![i](https://example.com/a/img.png)')
  })

  it('keeps absolute URLs unchanged', () => {
    const html = '<a href="https://other.com/x">go</a>'
    const md = transformHtmlToMarkdown(html, 'https://example.com/')
    expect(md.trim()).toBe('[go](https://other.com/x)')
  })

  it('keeps mailto / tel / javascript untouched', () => {
    expect(transformHtmlToMarkdown('<a href="mailto:a@b.c">e</a>', 'https://x/').trim()).toBe(
      '[e](mailto:a@b.c)'
    )
    expect(transformHtmlToMarkdown('<a href="tel:+1-555">t</a>', 'https://x/').trim()).toBe(
      '[t](tel:+1-555)'
    )
  })

  it('skips when baseUrl is invalid', () => {
    const md = transformHtmlToMarkdown('<a href="/x">go</a>', 'not a url')
    // no rewrite — link stays relative; turndown emits it as-is
    expect(md).toContain('/x')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/transform.test.ts -t "absolute URLs"
```

Expected: FAIL.

- [ ] **Step 3: Implement `absolutiseUrls` and call it before strip-attributes**

In `transform.ts`:

```ts
const NON_HTTP_SCHEMES = /^(mailto:|tel:|javascript:|data:|#)/i

function absolutiseUrls(html: string, baseUrl: string): string {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return html
  }
  function rewrite(value: string): string {
    if (!value || NON_HTTP_SCHEMES.test(value)) return value
    try {
      return new URL(value, base).href
    } catch {
      return value
    }
  }
  // href="..."
  let s = html.replace(/(\shref=")([^"]*)(")/gi, (_m, p1, v, p3) => `${p1}${rewrite(v)}${p3}`)
  // src="..."
  s = s.replace(/(\ssrc=")([^"]*)(")/gi, (_m, p1, v, p3) => `${p1}${rewrite(v)}${p3}`)
  return s
}

export function transformHtmlToMarkdown(html: string, baseUrl: string): string {
  const absolutised = absolutiseUrls(html, baseUrl)
  const cleaned = stripUnwantedAttributes(absolutised)
  return getService().turndown(cleaned)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/transform.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add electron/clipper/transform.ts electron/clipper/transform.test.ts
git commit -m "feat(phase-12): transform — rewrite relative href/src to absolute via baseUrl"
```

---

<!-- openspec-task: 3.4 -->

### Task 12: `transform.ts` — collapse empty wrapper nodes

Readability's output sometimes contains empty `<p>`, `<span>`, `<div>` shells (whitespace only). Without cleanup these turn into stray blank lines in the output. Add a final compaction pass.

**Files:**

- Modify: `electron/clipper/transform.ts`
- Modify: `electron/clipper/transform.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe('transform — empty-shell compaction', () => {
  it('removes empty <p></p>', () => {
    const md = transformHtmlToMarkdown('<p></p><p>hello</p><p>  </p>', 'https://x/')
    expect(md.trim()).toBe('hello')
  })

  it('unwraps <span></span> with whitespace only', () => {
    const md = transformHtmlToMarkdown('<p>a<span>  </span>b</p>', 'https://x/')
    expect(md.trim()).toBe('ab')
  })

  it('removes empty <div></div>', () => {
    const md = transformHtmlToMarkdown('<div>   </div><p>kept</p>', 'https://x/')
    expect(md.trim()).toBe('kept')
  })

  it('does not collapse <p> that contains an image', () => {
    const md = transformHtmlToMarkdown('<p><img src="https://x/y.png" alt="i"></p>', 'https://x/')
    expect(md.trim()).toBe('![i](https://x/y.png)')
  })

  it('does not eat genuine whitespace between words inside non-empty blocks', () => {
    const md = transformHtmlToMarkdown('<p>foo bar baz</p>', 'https://x/')
    expect(md.trim()).toBe('foo bar baz')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/transform.test.ts -t "empty-shell"
```

Expected: FAIL — empty `<p>` survives.

- [ ] **Step 3: Add `compactEmptyShells` and chain it after attribute strip**

In `transform.ts`:

```ts
/**
 * Drop `<p>`, `<span>`, `<div>` elements whose content is whitespace only.
 * Conservative regex — does not handle nested cases on first pass; we run the
 * pass twice to catch `<div><p></p></div>` style artifacts.
 */
function compactEmptyShells(html: string): string {
  const re = /<(p|span|div)(\s[^>]*)?>(\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi
  let prev: string
  let cur = html
  do {
    prev = cur
    cur = cur.replace(re, '')
  } while (cur !== prev)
  return cur
}

export function transformHtmlToMarkdown(html: string, baseUrl: string): string {
  const absolutised = absolutiseUrls(html, baseUrl)
  const cleaned = stripUnwantedAttributes(absolutised)
  const compact = compactEmptyShells(cleaned)
  return getService().turndown(compact)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/transform.test.ts
```

Expected: all green (24+ tests).

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add electron/clipper/transform.ts electron/clipper/transform.test.ts
git commit -m "feat(phase-12): transform — collapse empty p/span/div shells"
```

---

## Self-Review Checklist (run after Task 12)

- [ ] Every label `1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-12-clipper-pipeline-tasks-1.1-3.4.md | sort -u
  ```
  Expected: 12 distinct labels.
- [ ] All 12 tasks have a final commit step. Spot-check `git log --oneline | head -15` after running through.
- [ ] No `TODO` / `TBD` / "fill in" / "appropriate error handling" placeholders.
- [ ] Run all unit tests added in this plan:
  ```bash
  npx vitest run \
    electron/services/db/migrations/005_clips.test.ts \
    electron/clipper
  ```
  Expected: ~37 tests green (3 migration + 3 readability-bundle + 5 extract + 17 enrich + 24+ transform).
- [ ] Spec coverage:
  - `clip-store §"clips 表 schema"` → Task 2
  - `clipper-extractor §"Readability 注入与调用"` → Tasks 5, 6
  - `clipper-extractor §"degraded 模式标记"` → Task 7
  - `clipper-extractor §"URL 与元信息增强（enrich）"` → Task 8
  - `clipper-transformer §"HTML → Markdown 转换"` → Task 9
  - `clipper-transformer §"HTML 清洗规则"` → Tasks 10, 11
  - `clipper-transformer §"图片处理"` → Task 9 (alt + remote URL retained)
- [ ] Typecheck + lint clean:
  ```bash
  npm run typecheck && npm run lint
  ```
  Expected: both exit 0.
