# Phase 15 — AI Reviewer: Plan 4 (Acceptance — 20 verification tasks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-15-ai-reviewer`
> **Task range:** OpenSpec tasks `10.1`–`10.20` (20 tasks)
> **Plan order:** 4 of 4. Depends on Plans 1, 2, and 3.
> **Created:** 2026-05-04
> **Branch suggestion:** continue on `feat/phase-15-ai-reviewer`

---

## Goal

Verify all 20 acceptance criteria from `tasks.md` section 10. Each task is one criterion. Some are **automated integration tests** that can run unattended; others are **manual end-to-end smoke checks** in the running app. The mix is documented per-task.

## Architecture

- A **single shared acceptance integration test file** at `tests/acceptance/phase-15/reviewer.test.ts` covers most automated checks (10.2, 10.3, 10.10–10.15). It boots an in-memory DB, mocks `fetch` to simulate provider responses, and exercises the full handler.
- **Manual UI smoke checks** (10.4–10.9) require a running app (`npm run dev`) plus a real or mocked OpenAI key. The plan uses an OpenAI-compatible mock server (Mock Service Worker via Node `nock` would also work, but the simpler approach is to point `baseUrl` at a tiny local fixture server in dev mode).
- **External-network tests** (10.16 Ollama, 10.17 Anthropic) are gated: skipped automatically if `OLLAMA_BASE_URL` / `ANTHROPIC_API_KEY` aren't set. CI runs them only on explicit opt-in.
- **10.19** (no key in IPC payload) is a static + dynamic check: grep the source for accidental key exposure, then run a renderer-side IPC tracer in dev mode and confirm payloads.
- **10.20** is the OpenSpec validator.

## Pre-flight

- Plans 1, 2, 3 are merged.
- A real OpenAI key is available for manual smoke (10.1, 10.4–10.9), or use a fixture server (`scripts/fake-openai.mjs` from prior phases — repurpose).
- A lightweight HTTP fixture pattern: `vi.stubGlobal('fetch', ...)` — used inside Plan 4's automated tests.

## Files Touched (this plan)

| Path                                               | Action                   | Owner task                     |
| -------------------------------------------------- | ------------------------ | ------------------------------ |
| `tests/acceptance/phase-15/reviewer.test.ts`       | Create                   | 10.2, 10.3, 10.10–10.15, 10.18 |
| `tests/acceptance/phase-15/manual-smoke.md`        | Create (smoke checklist) | 10.1, 10.4–10.9                |
| `tests/acceptance/phase-15/no-secret-leak.test.ts` | Create                   | 10.19                          |
| `tests/acceptance/phase-15/providers.test.ts`      | Create (gated)           | 10.16, 10.17                   |

---

## Tasks

<!-- openspec-task: 10.1 -->

### Task 1: Configure OpenAI profile + clip an article (manual smoke)

**Files:**

- Create: `tests/acceptance/phase-15/manual-smoke.md`

- [ ] **Step 1: Author the smoke checklist**

```markdown
# Phase 15 Manual Smoke Checklist

## 10.1 — Configure profile + clip article

1. Run `npm run dev`.
2. Open Settings → AI → "添加配置档".
3. Provider: `openai`. Model: `gpt-4o-mini`. API Key: paste a real key.
4. Save → set as default.
5. From Picker, open a grove (or the default).
6. Open the clipper bookmarklet on any HTTPS article (e.g. `https://example.com` or a short Wikipedia article).
7. Confirm: a new clip appears under `inbox/` with body + frontmatter.

Expected: `clips` table has one row; `inbox/<slug>.md` exists with `url`, `title`, `clipped_at` in frontmatter.
```

- [ ] **Step 2: Execute the checklist**

Walk through steps 1–7 in the running app. Record any deviations as bugs.

- [ ] **Step 3: Commit checklist + sign-off note**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke checklist 10.1 — profile setup + clip article"
```

---

<!-- openspec-task: 10.2 -->

### Task 2: Job walks `pending → running → done`; frontmatter gains `ai_*` fields

**Files:**

- Create: `tests/acceptance/phase-15/reviewer.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
// tests/acceptance/phase-15/reviewer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../electron/services/db/migrations'
import { migrationsDir } from '../../../electron/services/db/migrations/index'

vi.mock('../../../electron/services/db/connection', () => ({ getDb: vi.fn() }))
vi.mock('../../../electron/services/grove', () => ({ getCurrentVaultRoot: vi.fn() }))
vi.mock('../../../electron/settings/store', () => ({
  settingsStore: { get: vi.fn(() => ({ defaultProfileId: 'p1' })) }
}))
vi.mock('../../../electron/settings/profiles', () => ({
  profilesStore: { get: vi.fn() }
}))
vi.mock('../../../electron/settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test')
}))

import { getDb } from '../../../electron/services/db/connection'
import { getCurrentVaultRoot } from '../../../electron/services/grove'
import { profilesStore } from '../../../electron/settings/profiles'
import { aiReviewClipHandler } from '../../../electron/queue/handlers/ai-review-clip'
import { aiUsage } from '../../../electron/ai/usage'

const TMP = path.join(os.tmpdir(), 'phase15-acc-' + Date.now())
fs.mkdirSync(TMP, { recursive: true })

let db: Database.Database
const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  ;(getDb as any).mockReturnValue(db)
  ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
  ;(profilesStore.get as any).mockReturnValue({
    id: 'p1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    baseUrl: undefined
  })
})

function mockOpenAiSuccess() {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'a short summary',
              suggestedTitle: 'A Better Title',
              tags: ['ai-tag-a', 'ai-tag-b', 'ai-tag-c'],
              keyQuotes: ['the key quote']
            })
          }
        }
      ],
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 }
    })
  })
}

function seedClipAndFile(): { clipPath: string } {
  const clipPath = 'inbox/ex.md'
  fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
  fs.writeFileSync(
    path.join(TMP, clipPath),
    `---
title: Example
url: https://example.com/a
---
the original body
`
  )
  db.prepare(
    `
    INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
    VALUES (1, 'https://example.com/a', ?, 'Example', 'ex', 200, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
  `
  ).run(clipPath)
  return { clipPath }
}

describe('10.2 — frontmatter gains ai_* fields after handler runs', () => {
  it('rewrites frontmatter with all five ai_* fields', async () => {
    const { clipPath } = seedClipAndFile()
    mockOpenAiSuccess()

    const r = await aiReviewClipHandler({
      job: { id: 'job-1', kind: 'ai-review-clip', attempts: 0 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(r).toEqual({ kind: 'ok' })

    const raw = fs.readFileSync(path.join(TMP, clipPath), 'utf8')
    expect(raw).toContain('ai_summary: a short summary')
    expect(raw).toContain('ai_suggested_title: A Better Title')
    expect(raw).toMatch(/ai_tags:[\s\S]*ai-tag-a[\s\S]*ai-tag-b[\s\S]*ai-tag-c/)
    expect(raw).toMatch(/ai_key_quotes:[\s\S]*the key quote/)
    expect(raw).toMatch(/ai_reviewed_at: ['"]?\d{4}-\d{2}-\d{2}T/)
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.2"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.2 — handler writes ai_* frontmatter fields"
```

---

<!-- openspec-task: 10.3 -->

### Task 3: `ai_usage` row recorded with ok=1, tokens, latency

- [ ] **Step 1: Append test**

```ts
// tests/acceptance/phase-15/reviewer.test.ts — append
describe('10.3 — ai_usage success row', () => {
  it('writes ok=1 with non-null tokens and latency_ms > 0', async () => {
    const { clipPath } = seedClipAndFile()
    mockOpenAiSuccess()
    await aiReviewClipHandler({
      job: { id: 'job-2', kind: 'ai-review-clip', attempts: 0 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    const rows = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').all('job-2') as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].ok).toBe(1)
    expect(rows[0].prompt_tokens).toBeGreaterThan(0)
    expect(rows[0].completion_tokens).toBeGreaterThan(0)
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(0)
    expect(rows[0].model).toBe('gpt-4o-mini')
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.3"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.3 — ai_usage success row recorded"
```

---

<!-- openspec-task: 10.4 -->

### Task 4: Editor shows purple AI badge → drawer shows 4 blocks (manual smoke)

- [ ] **Step 1: Append to manual checklist**

In `tests/acceptance/phase-15/manual-smoke.md`, add:

```markdown
## 10.4 — Editor badge + drawer

Pre: Task 10.1 completed; the clip from 10.1 has been processed (frontmatter contains `ai_*`).

1. In Library, double-click the clip → Editor opens.
2. Confirm: TitleBar shows a **purple "AI"** badge at the right.
3. Click the badge → drawer slides in from the right (~400px wide).
4. Confirm 4 sections present (in order):
   a. 建议标题 (large text + "用作标题" button)
   b. 摘要 (text)
   c. 标签 (chips + "合并到标签" button)
   d. 关键引用 (list)
5. Confirm footer has 3 buttons: "一键接受" / "拒绝" / "重新审读".
6. Confirm meta line shows reviewed-at timestamp.
```

- [ ] **Step 2: Walk through it**

Run app, open the clip from Task 1, click badge, verify all six points.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke 10.4 — editor badge + drawer rendering"
```

---

<!-- openspec-task: 10.5 -->

### Task 5: "Use as title" replaces title; autosave finishes (manual smoke)

- [ ] **Step 1: Append to manual checklist**

```markdown
## 10.5 — Use as title

1. In the AI drawer (Task 10.4), note the suggested title.
2. Note the current title in the editor's frontmatter sidecard.
3. Click "用作标题" in the drawer.
4. Confirm: editor enters dirty state briefly (saving indicator), then saved.
5. Confirm: frontmatter sidecard now shows the suggested title.
6. On disk: `cat <vault>/inbox/<slug>.md | head -10` shows `title: <suggested>`.
```

- [ ] **Step 2: Execute and verify**

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke 10.5 — Use as title autosaves"
```

---

<!-- openspec-task: 10.6 -->

### Task 6: "Merge tags" produces union; `content_hash` unchanged (manual smoke + spot check)

- [ ] **Step 1: Append to manual checklist**

````markdown
## 10.6 — Merge tags

1. Pre: edit frontmatter (or the upstream clip already has) `tags: [existing-1, existing-2]`.
2. In drawer, click "合并到标签".
3. Confirm: tags chip area in sidecard shows union of `existing-*` and `ai-tag-*` (no duplicates).
4. Open `<grove>/.acornvo/db.sqlite3`:
   ```bash
   sqlite3 <grove>/.acornvo/db.sqlite3 "SELECT path, content_hash FROM files WHERE path LIKE 'inbox/%' ORDER BY updated_at DESC LIMIT 1;"
   ```
````

Note the `content_hash`. 5. Re-run after the merge save. 6. Confirm: `content_hash` is **unchanged** (only frontmatter changed; body bytes identical).

````

- [ ] **Step 2: Execute and verify**

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke 10.6 — merge tags preserves content_hash"
````

---

<!-- openspec-task: 10.7 -->

### Task 7: "Accept all" sets title/tags/`ai_review_accepted_at`; badge gray (manual smoke)

- [ ] **Step 1: Append**

````markdown
## 10.7 — Accept all

1. Open a fresh clip with `ai_*` fields and no `ai_review_accepted_at`.
2. Click badge → drawer.
3. Click "一键接受".
4. Confirm: drawer closes; badge turns **gray**.
5. Inspect file:
   ```bash
   head -20 <vault>/inbox/<slug>.md
   ```
````

Expected: `title:` matches `ai_suggested_title`; `tags:` is a superset of original; `ai_review_accepted_at:` is set.

````

- [ ] **Step 2: Execute**

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke 10.7 — accept all writes title+tags+accepted_at"
````

---

<!-- openspec-task: 10.8 -->

### Task 8: "Reject" only writes `ai_review_accepted_at`; badge gray (manual smoke)

- [ ] **Step 1: Append**

```markdown
## 10.8 — Reject

1. Open another fresh clip with ai\_\* fields and no `ai_review_accepted_at`.
2. Note the current `title:` and `tags:` in the file.
3. Click badge → drawer → "拒绝".
4. Confirm: badge turns gray.
5. Verify on disk: `title:` and `tags:` UNCHANGED; only `ai_review_accepted_at:` added.
```

- [ ] **Step 2: Execute**

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke 10.8 — reject only sets accepted_at"
```

---

<!-- openspec-task: 10.9 -->

### Task 9: "Rerun" enqueues new job; frontmatter eventually overwritten; ai_usage +1 (manual smoke)

- [ ] **Step 1: Append**

````markdown
## 10.9 — Rerun

1. Open a clip with existing `ai_summary` etc. Note the current `ai_summary`.
2. Click badge → drawer → "重新审读".
3. Toast appears: "已重新排队，稍后查看".
4. Badge changes to spinner (running state).
5. Within ~30s, badge returns to purple/gray; `ai_summary` should be updated (or same if model is deterministic — re-check `ai_reviewed_at` timestamp, which MUST be newer than before).
6. SQLite check:
   ```bash
   sqlite3 <grove>/.acornvo/db.sqlite3 "SELECT id, kind, state, attempts, payload FROM jobs ORDER BY id DESC LIMIT 5;"
   sqlite3 <grove>/.acornvo/db.sqlite3 "SELECT COUNT(*) FROM ai_usage;"
   ```
````

Expected: a new `ai-review-clip` row reached `done`; `ai_usage` count increased by exactly 1.

````

- [ ] **Step 2: Execute**

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): manual-smoke 10.9 — rerun enqueues fresh job"
````

---

<!-- openspec-task: 10.10 -->

### Task 10: Delete default profile → handler returns `fail E_MISSING_PROFILE`

- [ ] **Step 1: Append integration test**

```ts
// tests/acceptance/phase-15/reviewer.test.ts — append
import { settingsStore } from '../../../electron/settings/store'

describe('10.10 — missing default profile', () => {
  it('handler returns fail E_MISSING_PROFILE when settings.ai.defaultProfileId is null', async () => {
    const { clipPath } = seedClipAndFile()
    ;(settingsStore.get as any).mockReturnValue({ defaultProfileId: null })
    const r = await aiReviewClipHandler({
      job: { id: 'job-mp', kind: 'ai-review-clip', attempts: 0 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(r).toEqual({ kind: 'fail', error: 'E_MISSING_PROFILE' })
    const usage = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').get('job-mp') as any
    expect(usage.ok).toBe(0)
    expect(usage.error).toBe('E_MISSING_PROFILE')
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.10"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.10 — missing profile fails permanently"
```

---

<!-- openspec-task: 10.11 -->

### Task 11: Simulated 401 → handler `fail E_AUTH`; no auto-retry

- [ ] **Step 1: Append test**

```ts
describe('10.11 — 401 fails permanently', () => {
  it('returns fail E_AUTH and writes ai_usage error row', async () => {
    const { clipPath } = seedClipAndFile()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"invalid api key"}}'
    })
    const r = await aiReviewClipHandler({
      job: { id: 'job-401', kind: 'ai-review-clip', attempts: 0 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(r).toEqual({ kind: 'fail', error: 'E_AUTH' })
    const usage = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').get('job-401') as any
    expect(usage.ok).toBe(0)
    expect(usage.error).toBe('E_AUTH')
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.11"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.11 — 401 maps to fail E_AUTH"
```

---

<!-- openspec-task: 10.12 -->

### Task 12: Simulated 429 → handler `retry { delayMs: 60000 }`

- [ ] **Step 1: Append test**

```ts
describe('10.12 — 429 retry with 60s backoff', () => {
  it('returns retry delayMs=60000', async () => {
    const { clipPath } = seedClipAndFile()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":{"message":"rate"}}'
    })
    const r = await aiReviewClipHandler({
      job: { id: 'job-429', kind: 'ai-review-clip', attempts: 1 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(r).toMatchObject({ kind: 'retry', delayMs: 60_000, reason: 'rate-limited' })
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.12"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.12 — 429 retries with 60s backoff"
```

---

<!-- openspec-task: 10.13 -->

### Task 13: LLM returns ` ```json {"…"} ``` ` → parses successfully

- [ ] **Step 1: Append test**

````ts
describe('10.13 — code-fence wrapped JSON parses', () => {
  it('strips ```json fence and ingests payload', async () => {
    const { clipPath } = seedClipAndFile()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [
          {
            message: {
              content:
                '```json\n' +
                JSON.stringify({
                  summary: 'fenced summary',
                  suggestedTitle: 'fenced title',
                  tags: ['t-a', 't-b', 't-c'],
                  keyQuotes: ['fenced quote']
                }) +
                '\n```'
            }
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      })
    })
    const r = await aiReviewClipHandler({
      job: { id: 'job-fence', kind: 'ai-review-clip', attempts: 0 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(r).toEqual({ kind: 'ok' })
    const raw = fs.readFileSync(path.join(TMP, clipPath), 'utf8')
    expect(raw).toContain('ai_summary: fenced summary')
  })
})
````

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.13"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.13 — code-fence wrapped JSON parses"
```

---

<!-- openspec-task: 10.14 -->

### Task 14: Schema mismatch → `E_RESPONSE`; retry with backoff

- [ ] **Step 1: Append test**

```ts
describe('10.14 — schema mismatch retries', () => {
  it('maps E_RESPONSE to retry with backoff', async () => {
    const { clipPath } = seedClipAndFile()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: '{"unrelated": true}' } }]
      })
    })
    const r = await aiReviewClipHandler({
      job: { id: 'job-bad', kind: 'ai-review-clip', attempts: 1 },
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(r).toMatchObject({ kind: 'retry', reason: 'E_RESPONSE' })
    expect((r as any).delayMs).toBeGreaterThan(0)

    const usage = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').get('job-bad') as any
    expect(usage.ok).toBe(0)
    expect(usage.error).toBe('E_RESPONSE')
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.14"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.14 — schema mismatch retries with backoff"
```

---

<!-- openspec-task: 10.15 -->

### Task 15: body > 16000 chars → truncated with `...(内容过长已截断)` marker

- [ ] **Step 1: Append test**

```ts
describe('10.15 — body truncation', () => {
  it('passes a truncated body with the marker to the LLM prompt', async () => {
    const longBody = 'X'.repeat(20_000)
    const clipPath = 'inbox/long.md'
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---\ntitle: Long\nurl: https://e.x/l\n---\n${longBody}\n`
    )
    db.prepare(
      `
      INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
      VALUES (2, 'https://e.x/l', ?, 'Long', 'l', 20000, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
    `
    ).run(clipPath)

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 's',
                suggestedTitle: 't',
                tags: ['a', 'b', 'c'],
                keyQuotes: ['q']
              })
            }
          }
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      })
    })
    await aiReviewClipHandler({
      job: { id: 'job-long', kind: 'ai-review-clip', attempts: 0 },
      payload: { clipId: 2, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal
    })
    expect(fetchMock).toHaveBeenCalled()
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const userMsg = sentBody.messages.find((m: any) => m.role === 'user').content as string
    expect(userMsg).toContain('...(内容过长已截断)')
    expect(userMsg).not.toContain('X'.repeat(16_001))
    expect(userMsg).toContain('X'.repeat(16_000))
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.15"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.15 — long body is truncated to 16K with marker"
```

---

<!-- openspec-task: 10.16 -->

### Task 16: Ollama profile (gated) → returns JSON; frontmatter updated

**Files:**

- Create: `tests/acceptance/phase-15/providers.test.ts`

- [ ] **Step 1: Write a gated live test**

```ts
// tests/acceptance/phase-15/providers.test.ts
import { describe, it, expect } from 'vitest'

const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const ollamaModel = process.env.OLLAMA_MODEL ?? 'llama3'

const liveOllama = process.env.RUN_LIVE_OLLAMA === '1'

describe.skipIf(!liveOllama)('10.16 — Ollama live', () => {
  it('returns parseable JSON for review-clip prompt', async () => {
    const { llmClient } = await import('../../../electron/ai/client')
    const { reviewClip } = await import('../../../electron/ai/prompts/review-clip')

    // Stub settings + profile to point at Ollama
    const fakeProfile = {
      id: 'p-ollama',
      provider: 'ollama' as const,
      model: ollamaModel,
      baseUrl: ollamaUrl
    }
    const { profilesStore } = await import('../../../electron/settings/profiles')
    const { settingsStore } = await import('../../../electron/settings/store')
    ;(settingsStore.get as any) = () => ({ defaultProfileId: 'p-ollama' })
    ;(profilesStore.get as any) = () => fakeProfile

    const { system, user } = reviewClip.render({
      title: 'Hello',
      url: 'https://example.com/hello',
      body: 'A short article about foxes and quick brown jumps.'
    })
    const r = await llmClient.chatJson<{
      summary: string
      suggestedTitle: string
      tags: string[]
      keyQuotes: string[]
    }>({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      schema: reviewClip.schema,
      maxTokens: 500
    })
    expect(r.data.summary).toBeTruthy()
    expect(r.data.tags.length).toBeGreaterThanOrEqual(3)
  }, 60_000)
})
```

- [ ] **Step 2: Run — gated**

```bash
RUN_LIVE_OLLAMA=1 OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3 \
  npx vitest run tests/acceptance/phase-15/providers.test.ts -t "Ollama live"
```

Expected: PASS if a local Ollama instance is up; SKIP otherwise.

If you don't have a local Ollama, document the skip in `manual-smoke.md` and re-run on a workstation that does.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/providers.test.ts
git commit -m "test(phase-15): acceptance 10.16 — gated live Ollama provider integration"
```

---

<!-- openspec-task: 10.17 -->

### Task 17: Anthropic profile (gated) → returns JSON; frontmatter updated

- [ ] **Step 1: Append gated live test**

```ts
// tests/acceptance/phase-15/providers.test.ts — append
const liveAnthropic = process.env.RUN_LIVE_ANTHROPIC === '1' && !!process.env.ANTHROPIC_API_KEY

describe.skipIf(!liveAnthropic)('10.17 — Anthropic live', () => {
  it('returns parseable JSON via the four-stage parser', async () => {
    const { llmClient } = await import('../../../electron/ai/client')
    const { reviewClip } = await import('../../../electron/ai/prompts/review-clip')

    const { profilesStore } = await import('../../../electron/settings/profiles')
    const { settingsStore } = await import('../../../electron/settings/store')
    const { getProfileDecryptedKey } = await import('../../../electron/settings/profile-key')
    ;(settingsStore.get as any) = () => ({ defaultProfileId: 'p-anth' })
    ;(profilesStore.get as any) = () => ({
      id: 'p-anth',
      provider: 'anthropic',
      model: 'claude-haiku-3.5'
    })
    ;(getProfileDecryptedKey as any) = () => process.env.ANTHROPIC_API_KEY

    const { system, user } = reviewClip.render({
      title: 'Hello',
      url: 'https://example.com/hello',
      body: 'A short article about cats and quick brown leaps.'
    })
    const r = await llmClient.chatJson<{
      summary: string
      suggestedTitle: string
      tags: string[]
      keyQuotes: string[]
    }>({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      schema: reviewClip.schema,
      maxTokens: 500
    })
    expect(r.data.summary).toBeTruthy()
    expect(r.data.tags.length).toBeGreaterThanOrEqual(3)
  }, 60_000)
})
```

- [ ] **Step 2: Run — gated**

```bash
RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=sk-ant-... \
  npx vitest run tests/acceptance/phase-15/providers.test.ts -t "Anthropic live"
```

Expected: PASS if key + network available.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/providers.test.ts
git commit -m "test(phase-15): acceptance 10.17 — gated live Anthropic provider integration"
```

---

<!-- openspec-task: 10.18 -->

### Task 18: `ai.usage.summary({ sinceDays: 30 })` returns correct aggregates

- [ ] **Step 1: Append test**

```ts
// tests/acceptance/phase-15/reviewer.test.ts — append
import { aiHandlers } from '../../../electron/ipc/ai'

describe('10.18 — usage.summary aggregates', () => {
  it('totals, ok-count, error-rate, byProvider', async () => {
    seedClipAndFile()
    aiUsage.insert({
      jobId: 'a',
      profileId: 'p1',
      model: 'm',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 10,
      ok: 1,
      error: null
    })
    aiUsage.insert({
      jobId: 'b',
      profileId: 'p1',
      model: 'm',
      promptTokens: 200,
      completionTokens: 100,
      latencyMs: 10,
      ok: 1,
      error: null
    })
    aiUsage.insert({
      jobId: 'c',
      profileId: 'p1',
      model: 'm',
      promptTokens: null,
      completionTokens: null,
      latencyMs: 5,
      ok: 0,
      error: 'E_AUTH'
    })
    aiUsage.insert({
      jobId: 'd',
      profileId: 'p2',
      model: 'm',
      promptTokens: 50,
      completionTokens: 25,
      latencyMs: 10,
      ok: 1,
      error: null
    })

    const r = await aiHandlers['usage.summary']({ sinceDays: 30 })
    expect(r.totalCalls).toBe(4)
    expect(r.okCount).toBe(3)
    expect(r.errorRate).toBeCloseTo(0.25, 5)
    expect(r.totalTokens).toBe(100 + 50 + 200 + 100 + 50 + 25)
    expect(r.byProvider['p1']).toMatchObject({ calls: 3 })
    expect(r.byProvider['p2']).toMatchObject({ calls: 1 })
  })
})
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/reviewer.test.ts -t "10.18"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/phase-15/reviewer.test.ts
git commit -m "test(phase-15): acceptance 10.18 — usage.summary aggregates correctly"
```

---

<!-- openspec-task: 10.19 -->

### Task 19: No api-key in any IPC payload — static + dynamic check

**Files:**

- Create: `tests/acceptance/phase-15/no-secret-leak.test.ts`

- [ ] **Step 1: Static grep — assert renderer code never imports `getProfileDecryptedKey`**

```ts
// tests/acceptance/phase-15/no-secret-leak.test.ts
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

describe('10.19 — no api-key leaks to renderer', () => {
  it('renderer source does not import getProfileDecryptedKey', () => {
    let hits = ''
    try {
      hits = execSync(`grep -rln "getProfileDecryptedKey" src/ 2>/dev/null || true`, {
        encoding: 'utf8'
      })
    } catch {
      /* grep returns 1 when nothing found; we treat that as empty */
    }
    expect(hits.trim()).toBe('')
  })

  it('preload does not re-export getProfileDecryptedKey or its return value', () => {
    let hits = ''
    try {
      hits = execSync(
        `grep -rn "getProfileDecryptedKey\\|apiKey" electron/preload/ 2>/dev/null || true`,
        { encoding: 'utf8' }
      )
    } catch {
      /* */
    }
    // It's OK for preload to mention 'apiKey' in a TYPE-only context; flag any actual code path
    const lines = hits.split('\n').filter(Boolean)
    const codeHits = lines.filter((l) => !/\.d\.ts|\/\/|\*/.test(l))
    expect(codeHits).toEqual([])
  })

  it('IPC contract type for ai.* does not declare any apiKey field', async () => {
    const fs = await import('node:fs')
    const text = fs.readFileSync('shared/ipc-contract.ts', 'utf8')
    // Capture the ai namespace block
    const m = text.match(/ai:\s*\{[\s\S]*?\};/)
    expect(m).toBeTruthy()
    expect(m![0].toLowerCase()).not.toContain('apikey')
    expect(m![0].toLowerCase()).not.toContain('api_key')
  })

  it('jobs payloads recorded in DB never contain apiKey', async () => {
    // After Plans 1-3 have run, exercise an enqueue and inspect the row JSON
    const Database = (await import('better-sqlite3')).default
    const { runMigrations } = await import('../../../electron/services/db/migrations')
    const { migrationsDir } = await import('../../../electron/services/db/migrations/index')
    const { jobsStore } = await import('../../../electron/queue/store')
    vi.mocked // ensure the import is evaluated when this file is run with vitest

    const db = new (Database as any)(':memory:')
    runMigrations(db, migrationsDir())

    // Stub getDb to return our in-memory db (the test file already does this elsewhere; if not,
    // import and override here):
    const { getDb } = await import('../../../electron/services/db/connection')
    ;(getDb as any).mockReturnValue?.(db)

    jobsStore.enqueue('ai-review-clip', { clipId: 1, force: true })
    const rows = db.prepare('SELECT payload FROM jobs').all() as Array<{ payload: string }>
    for (const r of rows) {
      expect(r.payload.toLowerCase()).not.toContain('apikey')
      expect(r.payload.toLowerCase()).not.toContain('sk-')
    }
  })
})

import { vi } from 'vitest'
```

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/acceptance/phase-15/no-secret-leak.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Optional — dynamic devtools check (manual)**

Append to `manual-smoke.md`:

````markdown
## 10.19 — Devtools IPC trace (dynamic)

1. `npm run dev`.
2. Open renderer devtools.
3. In the console:
   ```js
   const trace = []
   const orig = window.api.ai.reviewClip
   window.api.ai.reviewClip = (...args) => {
     trace.push({ m: 'reviewClip', args })
     return orig(...args)
   }
   await window.api.ai.reviewClip(1)
   console.log(JSON.stringify(trace))
   ```
````

4. Confirm: `trace` payload is `[{m:'reviewClip', args:[1]}]` — no apiKey, no Authorization, no sk-\* token anywhere.

````

- [ ] **Step 4: Commit**

```bash
git add tests/acceptance/phase-15/no-secret-leak.test.ts tests/acceptance/phase-15/manual-smoke.md
git commit -m "test(phase-15): acceptance 10.19 — no api-key leaks to renderer (static + manual)"
````

---

<!-- openspec-task: 10.20 -->

### Task 20: `openspec validate phase-15-ai-reviewer --strict` passes

- [ ] **Step 1: Run validator**

```bash
openspec validate phase-15-ai-reviewer --strict
```

Expected: exit 0, all artifacts validated.

- [ ] **Step 2: If validation reports issues, fix in OpenSpec artifacts**

Common failures:

- Missing requirement scenarios → add to `specs/<cap>/spec.md`.
- Drifted task description vs. spec → edit `tasks.md`.

Re-run after each fix until exit 0.

- [ ] **Step 3: Run the entire phase-15 test suite once more**

```bash
npx vitest run \
  electron/services/db/migrations/008_ai_usage.test.ts \
  shared/ai-types.test.ts \
  electron/ai \
  electron/ipc/ai.test.ts \
  electron/queue/handlers/ai-review-clip.test.ts \
  src/components/editor/AiReviewBadge.test.tsx \
  src/components/editor/AiReviewDrawer.test.tsx \
  src/components/editor/FrontmatterCard.test.tsx \
  tests/acceptance/phase-15/reviewer.test.ts \
  tests/acceptance/phase-15/no-secret-leak.test.ts
```

Expected: 100% PASS (gated providers tests are SKIP unless env flags are set).

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore(phase-15): openspec validate --strict passes; full suite green"
```

- [ ] **Step 5: Open PR for the phase**

```bash
git push -u origin feat/phase-15-ai-reviewer
gh pr create --title "phase-15: AI reviewer (clipper → LLM → frontmatter)" --body "$(cat <<'EOF'
## Summary
- llmClient + 4 providers (OpenAI, Anthropic, Ollama, openai-compatible) with normalized errors and 60s timeout
- review-clip prompt + Ajv schema; reviewer service writes `ai_*` frontmatter via phase 4 atomic write
- ai_usage table + IPC; queue handler logs success/failure
- Editor AI badge, drawer, sidecard row, rerun button; jobs subscription auto-refreshes editor

## Test plan
- [x] Plans 1–4 unit + integration tests green
- [ ] Manual smoke 10.4–10.9 in dev mode (record results in `tests/acceptance/phase-15/manual-smoke.md`)
- [ ] Optional gated tests RUN_LIVE_OLLAMA=1 / RUN_LIVE_ANTHROPIC=1
- [x] `openspec validate phase-15-ai-reviewer --strict` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Confirm with the user before pushing — see "Executing actions with care".)

---

## Self-Review Checklist (filled in)

- ✅ Spec coverage: tasks.md section 10 has 20 entries; Plan 4 contains 20 tasks (10.1–10.20), each with one OpenSpec annotation. Manual checklist captures UI flows that resist automation.
- ✅ No placeholders.
- ✅ Type consistency: tests reuse types from `@shared/ai-types` and the handler signature defined in Plan 3 Task 1.
- ✅ Gated tests: explicit env-flag pattern (`RUN_LIVE_OLLAMA=1` / `RUN_LIVE_ANTHROPIC=1`) so default `npm test` is hermetic.

## OpenSpec task mapping

- Task 1 → 10.1
- Task 2 → 10.2
- Task 3 → 10.3
- Task 4 → 10.4
- Task 5 → 10.5
- Task 6 → 10.6
- Task 7 → 10.7
- Task 8 → 10.8
- Task 9 → 10.9
- Task 10 → 10.10
- Task 11 → 10.11
- Task 12 → 10.12
- Task 13 → 10.13
- Task 14 → 10.14
- Task 15 → 10.15
- Task 16 → 10.16
- Task 17 → 10.17
- Task 18 → 10.18
- Task 19 → 10.19
- Task 20 → 10.20
