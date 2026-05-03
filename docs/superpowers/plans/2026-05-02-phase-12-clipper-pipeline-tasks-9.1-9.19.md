# Phase 12 — Clipper Pipeline: Plan 4 (Acceptance — 9.1–9.19)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-12-clipper-pipeline`
> **Task range:** OpenSpec tasks `9.1`–`9.19` (19 tasks)
> **Plan order:** 4 of 4. Final plan; depends on Plans 1–3.
> **Status:** Not started
> **Created:** 2026-05-02

---

## Goal

Cover every behaviour from the OpenSpec acceptance section. Each task is a discrete acceptance check; together they verify the merged feature end-to-end. Vitest+jsdom drives renderer-level checks (with the IPC ports stubbed); main-process flows that depend on real `WebContents` use a precise manual smoke procedure recorded in `docs/runbooks/phase-12-acceptance.md`. Final task runs `openspec validate --strict` and marks every OpenSpec task `[x]`.

## Architecture

- **Two coverage tiers** per task:
  1. **Automated** — `*.acceptance.test.tsx` Vitest + jsdom test, IPC mocked. Verifies renderer wiring, store transitions, contract compliance, and (where applicable) end-to-end stages stitched through fakes.
  2. **Manual smoke** — numbered runbook in `docs/runbooks/phase-12-acceptance.md`. Each subsequent task appends.
- **Single acceptance test file** `src/pages/Browse.clipper.acceptance.test.tsx` accumulates all renderer-level cases. Numbering follows OpenSpec exactly (9.1, 9.2, …).
- **Pipeline-only acceptance file** `electron/clipper/pipeline.acceptance.test.ts` covers main-side cases that don't need UI (slug, schemes, write+record).
- **Final task (9.19)** runs `openspec validate phase-12-clipper-pipeline --strict` and edits `openspec/changes/phase-12-clipper-pipeline/tasks.md` to mark all `[x]`.

## Tech Stack

- vitest + @testing-library/react + jsdom (existing)
- `npm run dev` for manual electron smoke
- `openspec` CLI

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/pages/Browse.clipper.acceptance.test.tsx` | Create + extend | 9.1 .. 9.18 |
| `electron/clipper/pipeline.acceptance.test.ts` | Create + extend | 9.6, 9.7, 9.8, 9.17, 9.18 |
| `docs/runbooks/phase-12-acceptance.md` | Create + extend | 9.1 .. 9.18 |
| `openspec/changes/phase-12-clipper-pipeline/tasks.md` | Modify (mark all complete) | 9.19 |

## Pre-flight

- All three prior plans merged. The implementation is feature-complete; this plan is verification.
- Verify the test environment can render `Browse` cleanly:
  ```bash
  npx vitest run src/pages/Browse.test.tsx 2>/dev/null || echo "(Browse.test.tsx may not exist; ok to skip)"
  ```
- Spin a fresh sandbox vault for manual smoke:
  ```bash
  rm -rf /tmp/acornvo-smoke && mkdir -p /tmp/acornvo-smoke/inbox
  ACORNVO_VAULT=/tmp/acornvo-smoke npm run dev
  ```

---

## Tasks

<!-- openspec-task: 9.1 -->
### Task 1: 剪藏触发 → Modal 弹出，title / body preview 正确

**Files:**
- Create: `src/pages/Browse.clipper.acceptance.test.tsx`
- Create: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Create the acceptance test scaffold + first case**

```tsx
// src/pages/Browse.clipper.acceptance.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Browse } from '@/pages/Browse'
import { useBrowserStore } from '@/stores/browser'
import { useClipperStore, _resetClipperStoreForTest } from '@/stores/clipper'
import { setClipperPort } from '@/ipc/clipper-port'
import { setClipsPort } from '@/ipc/clips-port'

const samplePreview = {
  runId: 'r1',
  title: 'Sample Article',
  url: 'https://example.com/article',
  site: 'example.com',
  body: '# Sample Article\n\nThis is the body.\n'.repeat(20),
  suggestedPath: 'inbox/202605/sample-article-abc123.md',
  tags: [] as string[],
  excerpt: 'sample excerpt',
  degraded: false
}

function setupActiveTab(url = 'https://example.com/article') {
  useBrowserStore.setState({
    activeTabId: 't1',
    tabs: [{
      id: 't1',
      url,
      title: 'tab',
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      readerMode: false,
      suspended: false,
      savedUrl: url,
      isClipped: false
    } as any]
  })
}

function defaultClipperPort() {
  return {
    clip: vi.fn(async () => ({ ok: true, data: samplePreview })),
    saveClip: vi.fn(async () => ({
      ok: true,
      data: { id: 1, path: samplePreview.suggestedPath, url: samplePreview.url, title: samplePreview.title, degraded: false }
    })),
    cancelClip: vi.fn(async () => ({ ok: true, data: undefined })),
    reextract: vi.fn(async () => ({ ok: true, data: samplePreview }))
  }
}

function defaultClipsPort() {
  return {
    create: vi.fn(),
    list: vi.fn(),
    getByUrl: vi.fn(async () => ({ ok: true, data: null })),
    getById: vi.fn(),
    delete: vi.fn()
  }
}

function renderBrowse() {
  return render(
    <MemoryRouter initialEntries={['/browser']}>
      <Browse />
    </MemoryRouter>
  )
}

beforeEach(() => {
  _resetClipperStoreForTest()
  setClipperPort(defaultClipperPort() as any)
  setClipsPort(defaultClipsPort() as any)
})

describe('OpenSpec 9.1 — clip triggers modal', () => {
  it('clicking scissors → modal opens with title and body preview', async () => {
    setupActiveTab()
    renderBrowse()
    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Sample Article')).toBeInTheDocument()
    expect(screen.getByTestId('clip-body-preview').textContent).toContain('Sample Article')
  })
})
```

- [ ] **Step 2: Create the manual runbook**

```markdown
<!-- docs/runbooks/phase-12-acceptance.md -->
# Phase 12 — Clipper Acceptance Runbook

Manual smoke procedures. Mark each step `[x]` when done.

## How to run

1. Fresh vault: `rm -rf /tmp/acornvo-smoke && mkdir -p /tmp/acornvo-smoke/inbox`
2. `ACORNVO_VAULT=/tmp/acornvo-smoke npm run dev`
3. Open `/browser`, point a tab at the URL listed in each step.

## 9.1 — clip triggers modal
- [ ] Open `https://example.com` (or a public-domain article URL).
- [ ] Click the scissors button in the AddressBar.
- [ ] Observe: ClipPreviewDialog appears within ~3 s with the correct title and a body preview (≥ a few hundred chars).
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.1 — clip triggers modal with title + body"
```

---

<!-- openspec-task: 9.2 -->
### Task 2: Modal 填 tags → 保存 → 文件出现，frontmatter 完整，clips 表新增

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append the test**

```tsx
describe('OpenSpec 9.2 — save with tags writes frontmatter + creates clip row', () => {
  it('save invokes clipper.saveClip with the tags array', async () => {
    setupActiveTab()
    const port = defaultClipperPort()
    setClipperPort(port as any)
    renderBrowse()
    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const tags = screen.getByLabelText(/tags|标签/i) as HTMLInputElement
    await userEvent.type(tags, 'ai,news')
    await userEvent.click(screen.getByRole('button', { name: /保存|save/i }))
    await waitFor(() => {
      expect(port.saveClip).toHaveBeenCalledWith({
        runId: 'r1',
        title: 'Sample Article',
        tags: ['ai', 'news'],
        excerpt: 'sample excerpt'
      })
    })
    await waitFor(() => expect(useClipperStore.getState().stage).toBe('done'))
  })
})
```

- [ ] **Step 2: Append runbook step**

Append to `docs/runbooks/phase-12-acceptance.md`:

```markdown
## 9.2 — save writes frontmatter + clip row
- [ ] Continuing from 9.1: type tags `ai,news` in the modal.
- [ ] Click 保存. Observe: toast shows 已剪藏; modal closes.
- [ ] Verify file: `cat /tmp/acornvo-smoke/inbox/202605/<slug>.md` includes a YAML block with `tags: [ai, news]`, `url:`, `site:`, `source_type: web`, `clipped_at:`.
- [ ] Verify DB: `sqlite3 /tmp/acornvo-smoke/.acornvo/db.sqlite "SELECT id, url, path FROM clips ORDER BY id DESC LIMIT 1;"` shows the new row.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.2"
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.2 — save with tags writes frontmatter + clip row"
```

---

<!-- openspec-task: 9.3 -->
### Task 3: 同一 URL 再点剪藏 → "已剪藏，是否打开？" 确认 → 打开 `/editor/:path`

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append the test**

```tsx
describe('OpenSpec 9.3 — already-clipped click opens editor', () => {
  it('clipped tab → confirm → navigate(/editor/:path)', async () => {
    setupActiveTab()
    useBrowserStore.setState((s) => ({
      tabs: s.tabs.map((t) => ({ ...t, isClipped: true }))
    }))
    setClipsPort({
      ...defaultClipsPort(),
      getByUrl: vi.fn(async () => ({ ok: true, data: { id: 9, path: 'inbox/202605/x.md' } as any }))
    } as any)

    const navigateSpy = vi.fn()
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
      return { ...actual, useNavigate: () => navigateSpy }
    })

    renderBrowse()
    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    const open = await screen.findByRole('button', { name: /打开|open/i })
    await userEvent.click(open)
    expect(navigateSpy).toHaveBeenCalledWith('/editor/inbox/202605/x.md')
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.3 — re-clip prompts open
- [ ] Reload `/browser` and re-open the same URL from 9.2.
- [ ] Click the scissors. Observe: "已剪藏" confirm modal.
- [ ] Click 打开. Observe: app navigates to `/editor/inbox/.../<slug>.md`.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.3"
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.3 — already-clipped → confirm → navigate /editor/:path"
```

---

<!-- openspec-task: 9.4 -->
### Task 4: 剪藏后切回该 tab → 按钮变实心 + 对勾

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append the test**

```tsx
describe('OpenSpec 9.4 — switching back to a clipped tab shows filled icon', () => {
  it('AddressBar reads tab.isClipped from the active tab', async () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [
        { id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: true } as any,
        { id: 't2', url: 'https://y/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://y/', isClipped: false } as any
      ]
    })
    renderBrowse()
    expect(screen.getByRole('button', { name: /clip|剪藏/i }).getAttribute('data-state')).toBe('clipped')

    useBrowserStore.setState({ activeTabId: 't2' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clip|剪藏/i }).getAttribute('data-state')).toBe('hollow')
    })
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.4 — switch tabs reflects isClipped
- [ ] In the dev session: open the previously-clipped URL in a new tab; switch back.
- [ ] Observe: scissors icon shows the filled style + small ✓.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.4"
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.4 — clipped tab shows filled scissors + check"
```

---

<!-- openspec-task: 9.5 -->
### Task 5: 剪藏后另一 tab 打开新 URL → 按钮回空心

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append the test**

```tsx
describe('OpenSpec 9.5 — new URL → hollow icon', () => {
  it('navigating an existing tab to a fresh URL flips isClipped to false', async () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://old/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://old/', isClipped: true } as any]
    })
    setClipsPort({
      ...defaultClipsPort(),
      getByUrl: vi.fn(async () => ({ ok: true, data: null }))
    } as any)
    renderBrowse()
    // Simulate did-navigate by exposing browser.ts's patch handler:
    const handler = (window as any).__browserOnPatch as (p: any) => void
    handler?.({ tabId: 't1', patch: { url: 'https://new/' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clip|剪藏/i }).getAttribute('data-state')).toBe('hollow')
    })
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.5 — new URL → hollow
- [ ] In the same tab, navigate to a brand-new URL not in clips.
- [ ] Observe: scissors icon flips to hollow within ~200 ms.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.5"
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.5 — fresh URL → hollow scissors"
```

---

<!-- openspec-task: 9.6 -->
### Task 6: 中文 slug 含 jieba 分词；英文 slug 为 slugify 结果

**Files:**
- Create: `electron/clipper/pipeline.acceptance.test.ts`

- [ ] **Step 1: Write the test**

```ts
// electron/clipper/pipeline.acceptance.test.ts
import { describe, it, expect } from 'vitest'
import { buildSlug, sha6 } from './slug'

describe('OpenSpec 9.6 — slug rules', () => {
  it('Chinese title → jieba-segmented words + sha6', () => {
    const slug = buildSlug({ title: '深度学习入门指南', url: 'https://example.com/a' })
    expect(slug).toMatch(/[一-龥]/)
    expect(slug.endsWith('-' + sha6('https://example.com/a'))).toBe(true)
  })

  it('English title → slugify result + sha6', () => {
    const slug = buildSlug({ title: 'Hello World, A Primer!', url: 'https://example.com/b' })
    expect(slug).toBe('hello-world-a-primer-' + sha6('https://example.com/b'))
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts
git add electron/clipper/pipeline.acceptance.test.ts
git commit -m "test(phase-12): acceptance 9.6 — slug rules (jieba + slugify)"
```

---

<!-- openspec-task: 9.7 -->
### Task 7: extract 超时（5.1s）→ 错误 UI + "强制保存整页" → degraded 流程成功

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `electron/clipper/pipeline.acceptance.test.ts`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append renderer test (UI presents the error + button)**

```tsx
describe('OpenSpec 9.7 — extract timeout UI', () => {
  it('shows "无法抽取正文" + "强制保存整页" when clipper.start surfaces E_EXTRACT_TIMEOUT', async () => {
    setupActiveTab()
    setClipperPort({
      ...defaultClipperPort(),
      clip: vi.fn(async () => ({
        ok: false,
        error: { code: 'E_EXTRACT_TIMEOUT', message: 'timeout' }
      }))
    } as any)
    renderBrowse()
    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    expect(await screen.findByText(/无法抽取正文|cannot extract/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /强制保存整页|force save/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Append pipeline test (timeout returns the right code)**

In `pipeline.acceptance.test.ts`:

```ts
import { createPipeline } from './pipeline'
import { vi } from 'vitest'

describe('OpenSpec 9.7 — extract timeout returns E_EXTRACT_TIMEOUT', () => {
  it('returns the typed error envelope', async () => {
    const p = createPipeline({
      extract: vi.fn(async () => ({ ok: false, error: 'E_EXTRACT_TIMEOUT' })),
      transform: vi.fn(),
      dedupe: { findExisting: vi.fn(async () => null) },
      writeAtomic: vi.fn(),
      indexUpsert: vi.fn(),
      clipsDao: { create: vi.fn(), getByUrl: vi.fn(async () => null) },
      opsLog: { append: vi.fn() },
      clipQueue: { enqueue: vi.fn() },
      nowIso: () => '2026-05-02T10:00:00+08:00',
      nowDate: () => new Date('2026-05-02T02:00:00Z'),
      extractTimeoutMs: 5000
    } as any)
    const r = await p.clip({ isDestroyed: () => false, getURL: () => 'https://x/', getTitle: () => 't' } as any)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EXTRACT_TIMEOUT')
  })
})
```

- [ ] **Step 3: Append runbook step**

```markdown
## 9.7 — extract timeout
- [ ] Open a contrived slow page (e.g. a local script that does `while(true){}`) in a tab.
- [ ] Click scissors. Observe: after ~5 s the "无法抽取正文" toast appears with "强制保存整页" button.
- [ ] Click 强制保存整页. Observe: file written under inbox with `degraded: true` in the clips row.
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.7" electron/clipper/pipeline.acceptance.test.ts
git add src/pages/Browse.clipper.acceptance.test.tsx electron/clipper/pipeline.acceptance.test.ts docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.7 — extract timeout UI + pipeline error code"
```

---

<!-- openspec-task: 9.8 -->
### Task 8: Readability null → degraded=true; clips.degraded=1; UI 提示

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append renderer test (degraded notice in modal)**

```tsx
describe('OpenSpec 9.8 — degraded preview shows notice', () => {
  it('preview.degraded=true renders "部分抽取" notice', async () => {
    setupActiveTab()
    setClipperPort({
      ...defaultClipperPort(),
      clip: vi.fn(async () => ({
        ok: true,
        data: { ...samplePreview, degraded: true, runId: 'rd' }
      }))
    } as any)
    renderBrowse()
    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText(/部分抽取|degraded/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.8 — degraded mode
- [ ] Open a low-signal page (e.g. a JSON viewer or a content-less landing page).
- [ ] Click scissors. Observe: modal opens with the "部分抽取" yellow notice.
- [ ] Save. Verify clips DB row: `degraded` column = 1.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.8"
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.8 — degraded preview shows notice"
```

---

<!-- openspec-task: 9.9 -->
### Task 9: 相对链接 `<a href="/x">` → markdown 中为绝对 URL

**Files:**
- Modify: `electron/clipper/pipeline.acceptance.test.ts`

- [ ] **Step 1: Append the test**

```ts
import { transformHtmlToMarkdown } from './transform'

describe('OpenSpec 9.9 — relative link absolutised', () => {
  it('<a href="/x"> with baseUrl=https://example.com/a/b → absolute', () => {
    const md = transformHtmlToMarkdown('<a href="/x">go</a>', 'https://example.com/a/b')
    expect(md.trim()).toBe('[go](https://example.com/x)')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts -t "9.9"
git add electron/clipper/pipeline.acceptance.test.ts
git commit -m "test(phase-12): acceptance 9.9 — relative link → absolute URL in markdown"
```

---

<!-- openspec-task: 9.10 -->
### Task 10: `<img srcset=...>` → markdown 只保留 alt + src；无 srcset

**Files:**
- Modify: `electron/clipper/pipeline.acceptance.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('OpenSpec 9.10 — img srcset stripped', () => {
  it('keeps src + alt, drops srcset', () => {
    const md = transformHtmlToMarkdown(
      '<img src="https://cdn/a.png" srcset="https://cdn/a.png 1x, https://cdn/a@2x.png 2x" alt="A">',
      'https://x/'
    )
    expect(md.trim()).toBe('![A](https://cdn/a.png)')
    expect(md).not.toMatch(/srcset/)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts -t "9.10"
git add electron/clipper/pipeline.acceptance.test.ts
git commit -m "test(phase-12): acceptance 9.10 — img srcset stripped, alt + src kept"
```

---

<!-- openspec-task: 9.11 -->
### Task 11: 代码块 `<pre><code class="language-ts">` → markdown 围栏

**Files:**
- Modify: `electron/clipper/pipeline.acceptance.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('OpenSpec 9.11 — fenced code block with language', () => {
  it('language-ts → ```ts fence', () => {
    const md = transformHtmlToMarkdown(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
      'https://x/'
    )
    expect(md).toContain('```ts')
    expect(md).toContain('const a = 1;')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts -t "9.11"
git add electron/clipper/pipeline.acceptance.test.ts
git commit -m "test(phase-12): acceptance 9.11 — code block language preserved as fence"
```

---

<!-- openspec-task: 9.12 -->
### Task 12: GFM 表格 HTML → markdown 表格保真

**Files:**
- Modify: `electron/clipper/pipeline.acceptance.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('OpenSpec 9.12 — GFM table fidelity', () => {
  it('table → pipe-style markdown', () => {
    const html =
      '<table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></tbody></table>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('| Name | Score |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| A | 1 |')
    expect(md).toContain('| B | 2 |')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts -t "9.12"
git add electron/clipper/pipeline.acceptance.test.ts
git commit -m "test(phase-12): acceptance 9.12 — GFM table fidelity"
```

---

<!-- openspec-task: 9.13 -->
### Task 13: about:blank / acorn://new-tab → 按钮 disabled；快捷键 no-op + toast

**Files:**
- Modify: `src/pages/Browse.clipper.acceptance.test.tsx`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append the tests**

```tsx
describe('OpenSpec 9.13 — non-http URL', () => {
  it('about:blank → scissors button is disabled', () => {
    setupActiveTab('about:blank')
    renderBrowse()
    expect(screen.getByRole('button', { name: /clip|剪藏/i })).toBeDisabled()
  })

  it('acorn://new-tab + Cmd+Shift+S → no clipper.start; error toast shown', async () => {
    setupActiveTab('acorn://new-tab')
    const port = defaultClipperPort()
    setClipperPort(port as any)
    renderBrowse()
    // Simulate the shortcut directly
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', metaKey: true, shiftKey: true }))
    await waitFor(() => expect(screen.getByText(/不支持剪藏|unsupported/i)).toBeInTheDocument())
    expect(port.clip).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.13 — unsupported URL
- [ ] Open a fresh new-tab page (`acorn://new-tab`).
- [ ] Observe: scissors button is greyed out / disabled.
- [ ] Press `Cmd+Shift+S`. Observe: toast "当前页面不支持剪藏" appears; no modal opens.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/pages/Browse.clipper.acceptance.test.tsx -t "9.13"
git add src/pages/Browse.clipper.acceptance.test.tsx docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.13 — unsupported URL disables button + shortcut toast"
```

---

<!-- openspec-task: 9.14 -->
### Task 14: `clips.list({ q: 'news' })` 命中 title/url/excerpt 含 news

**Files:**
- Modify: `electron/ipc/clips.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('OpenSpec 9.14 — clips.list q matches title/url/excerpt', () => {
  it('q=news returns rows where any of the three columns contains "news" (CI)', async () => {
    const db = freshDb()
    const dao = createClipsDao(db)
    await dao.create({ url: 'https://x/news/1', path: 'p1', title: 'Tech', clippedAt: '2026-05-02T00:00:00Z' })
    await dao.create({ url: 'https://x/2', path: 'p2', title: 'NEWS roundup', clippedAt: '2026-05-02T00:00:01Z' })
    await dao.create({ url: 'https://x/3', path: 'p3', title: 'Other', excerpt: 'today\'s news digest', clippedAt: '2026-05-02T00:00:02Z' })
    await dao.create({ url: 'https://x/4', path: 'p4', title: 'Other', excerpt: 'unrelated', clippedAt: '2026-05-02T00:00:03Z' })
    const r = (await dao.list({ q: 'news', limit: 10, offset: 0 })) as any
    expect(r.ok).toBe(true)
    expect(r.data.total).toBe(3)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/ipc/clips.test.ts -t "9.14"
git add electron/ipc/clips.test.ts
git commit -m "test(phase-12): acceptance 9.14 — clips.list q matches title/url/excerpt"
```

---

<!-- openspec-task: 9.15 -->
### Task 15: `clips.list({ site: 'example.com' })` 命中 site 行

**Files:**
- Modify: `electron/ipc/clips.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('OpenSpec 9.15 — clips.list filters by site', () => {
  it('site=example.com returns only matching rows', async () => {
    const db = freshDb()
    const dao = createClipsDao(db)
    await dao.create({ url: 'https://example.com/a', site: 'example.com', path: 'pa', clippedAt: '2026-05-02T00:00:00Z' })
    await dao.create({ url: 'https://other.com/b', site: 'other.com', path: 'pb', clippedAt: '2026-05-02T00:00:01Z' })
    await dao.create({ url: 'https://example.com/c', site: 'example.com', path: 'pc', clippedAt: '2026-05-02T00:00:02Z' })
    const r = (await dao.list({ site: 'example.com', limit: 10, offset: 0 })) as any
    expect(r.ok).toBe(true)
    expect(r.data.total).toBe(2)
    expect(r.data.items.every((c: any) => c.site === 'example.com')).toBe(true)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/ipc/clips.test.ts -t "9.15"
git add electron/ipc/clips.test.ts
git commit -m "test(phase-12): acceptance 9.15 — clips.list site filter"
```

---

<!-- openspec-task: 9.16 -->
### Task 16: `clips.delete(id)` 只删 DB 行；md 文件仍在

**Files:**
- Modify: `electron/ipc/clips.test.ts`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append the test (DB-only check; file-existence check is in the runbook)**

```ts
describe('OpenSpec 9.16 — clips.delete only removes DB row', () => {
  it('delete removes the row but does not touch the filesystem', async () => {
    const db = freshDb()
    const dao = createClipsDao(db)
    const c = (await dao.create({ url: 'https://x/', path: 'inbox/202605/x.md', clippedAt: '2026-05-02T00:00:00Z' })) as any
    const del = (await dao.delete({ id: c.data.id })) as any
    expect(del.ok).toBe(true)
    const got = (await dao.getById({ id: c.data.id })) as any
    expect(got.data).toBeNull()
    // (Filesystem check belongs to the runbook step below — DAO does not touch fs.)
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.16 — clips.delete preserves the file
- [ ] Pick a clipped row id (e.g. via the SQL above).
- [ ] In the dev console: `await window.api.clips.delete({ id: <id> })`.
- [ ] Verify: `cat /tmp/acornvo-smoke/inbox/202605/<slug>.md` still prints; the row is gone from the table.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run electron/ipc/clips.test.ts -t "9.16"
git add electron/ipc/clips.test.ts docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.16 — clips.delete removes row only"
```

---

<!-- openspec-task: 9.17 -->
### Task 17: 写入失败模拟 → clips 表无插入；pipeline 进入 error；允许重试

**Files:**
- Modify: `electron/clipper/pipeline.acceptance.test.ts`
- Modify: `docs/runbooks/phase-12-acceptance.md`

- [ ] **Step 1: Append pipeline test**

```ts
describe('OpenSpec 9.17 — write failure does not insert clip row; allows retry', () => {
  it('writeAtomic throws → no clipsDao.create call; error envelope returned', async () => {
    const writeAtomic = vi.fn(async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) })
    const create = vi.fn()
    const p = createPipeline({
      extract: vi.fn(async () => ({
        ok: true,
        title: 'X',
        content: '<p>x</p>',
        url: 'https://x/',
        excerpt: 'x'
      })),
      transform: (h: string) => h,
      dedupe: { findExisting: vi.fn(async () => null) },
      writeAtomic,
      indexUpsert: vi.fn(),
      clipsDao: { create, getByUrl: vi.fn(async () => null) },
      opsLog: { append: vi.fn() },
      clipQueue: { enqueue: vi.fn() },
      nowIso: () => '2026-05-02T10:00:00+08:00',
      nowDate: () => new Date('2026-05-02T02:00:00Z'),
      extractTimeoutMs: 5000
    } as any)
    const start = await p.clip({ isDestroyed: () => false, getURL: () => 'https://x/', getTitle: () => 'X' } as any)
    if (!start.ok) throw new Error('precondition: start should succeed')
    const r = await p.saveClip({ runId: start.preview.runId, title: 'X', tags: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_WRITE_FAILED')
    expect(create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Append runbook step**

```markdown
## 9.17 — write failure
- [ ] (manual) Set the vault dir read-only: `chmod -R 555 /tmp/acornvo-smoke/inbox`.
- [ ] Click clip on any URL → save in modal.
- [ ] Observe: error toast "保存失败" with 重试 button.
- [ ] Verify: no new row in `clips` (`SELECT COUNT(*) FROM clips`).
- [ ] Restore: `chmod -R 755 /tmp/acornvo-smoke/inbox`.
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts -t "9.17"
git add electron/clipper/pipeline.acceptance.test.ts docs/runbooks/phase-12-acceptance.md
git commit -m "test(phase-12): acceptance 9.17 — write failure → no clip row, error envelope"
```

---

<!-- openspec-task: 9.18 -->
### Task 18: 剪藏成功后 ops_log 新增 `op='clip'`；clipQueue.enqueue 被调

**Files:**
- Modify: `electron/clipper/pipeline.acceptance.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('OpenSpec 9.18 — success writes ops_log + enqueues clip', () => {
  it('saveClip success calls opsLog.append with op="clip" and clipQueue.enqueue', async () => {
    const opsAppend = vi.fn(async () => {})
    const enqueue = vi.fn()
    const p = createPipeline({
      extract: vi.fn(async () => ({
        ok: true,
        title: 'X',
        content: '<p>x</p>',
        url: 'https://x/',
        excerpt: 'x'
      })),
      transform: (h: string) => h,
      dedupe: { findExisting: vi.fn(async () => null) },
      writeAtomic: vi.fn(async () => ({ mtimeMs: 1, sha256: 'abc' })),
      indexUpsert: vi.fn(),
      clipsDao: { create: vi.fn(async () => ({ id: 7 })), getByUrl: vi.fn(async () => null) },
      opsLog: { append: opsAppend },
      clipQueue: { enqueue },
      nowIso: () => '2026-05-02T10:00:00+08:00',
      nowDate: () => new Date('2026-05-02T02:00:00Z'),
      extractTimeoutMs: 5000
    } as any)
    const start = await p.clip({ isDestroyed: () => false, getURL: () => 'https://x/', getTitle: () => 'X' } as any)
    if (!start.ok) throw new Error('precondition')
    const r = await p.saveClip({ runId: start.preview.runId, title: 'X', tags: [] })
    expect(r.ok).toBe(true)
    expect(opsAppend).toHaveBeenCalledWith(expect.objectContaining({ op: 'clip' }))
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ clipId: 7, url: 'https://x/' }))
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run electron/clipper/pipeline.acceptance.test.ts -t "9.18"
git add electron/clipper/pipeline.acceptance.test.ts
git commit -m "test(phase-12): acceptance 9.18 — success writes ops_log + enqueues clip"
```

---

<!-- openspec-task: 9.19 -->
### Task 19: `openspec validate phase-12-clipper-pipeline --strict` + mark all OpenSpec tasks complete

**Files:**
- Modify: `openspec/changes/phase-12-clipper-pipeline/tasks.md`

- [ ] **Step 1: Run the full clipper test suite once**

```bash
npx vitest run \
  electron/services/db/migrations/005_clips.test.ts \
  electron/clipper \
  electron/ipc/clipper.test.ts \
  electron/ipc/clips.test.ts \
  shared/ipc-contract.test.ts \
  src/stores/clipper.test.ts \
  src/stores/browser.test.ts \
  src/components/browser \
  src/hooks/useBrowserHotkeys.test.ts \
  src/pages/Browse.clipper.acceptance.test.tsx
```

Expected: green across the board. If any fail, **stop** and fix before continuing.

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Edit `openspec/changes/phase-12-clipper-pipeline/tasks.md` — mark all entries `[x]`**

Replace every `- [ ]` at the start of a line with `- [x]`. Quick sanity:

```bash
sed -i.bak 's/^- \[ \]/- [x]/' openspec/changes/phase-12-clipper-pipeline/tasks.md
rm openspec/changes/phase-12-clipper-pipeline/tasks.md.bak
grep -c '^- \[' openspec/changes/phase-12-clipper-pipeline/tasks.md
grep -c '^- \[x\]' openspec/changes/phase-12-clipper-pipeline/tasks.md
```

Expected: both counts equal (49). On macOS the `-i.bak` form is safe; on GNU sed `sed -i 's/^- \[ \]/- [x]/' ...` is fine.

- [ ] **Step 4: Run OpenSpec strict validation**

```bash
openspec validate phase-12-clipper-pipeline --strict
```

Expected: validation passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/phase-12-clipper-pipeline/tasks.md
git commit -m "chore(phase-12): mark all tasks complete; openspec validate passes"
```

---

## Self-Review Checklist (run after Task 19)

- [ ] Every label `9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16, 9.17, 9.18, 9.19` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-12-clipper-pipeline-tasks-9.1-9.19.md | sort -u
  ```
- [ ] All 19 tasks have a final commit step.
- [ ] Spec coverage: each acceptance scenario in `clipper-extractor` / `clipper-transformer` / `clipper-pipeline` / `clipper-ui` / `clip-store` / `browser-navigation` is covered by either an automated test (Tasks 1–18) or a runbook step (manual smokes).
- [ ] `openspec validate phase-12-clipper-pipeline --strict` exits 0 (Task 19 step 4).
- [ ] Typecheck + lint clean (Task 19 step 2).
