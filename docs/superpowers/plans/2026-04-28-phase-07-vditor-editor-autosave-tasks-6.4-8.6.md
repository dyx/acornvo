# Phase 07 — Vditor Editor + Autosave: Plan 4 (Library finish + i18n + acceptance batch 1)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-07-vditor-editor-autosave`
> **Task range:** OpenSpec tasks `6.4`–`8.6` (8 tasks)
> **Plan order:** 4 of 5. Builds on plans 1, 2, and 3. Plan 5 (`tasks-8.7-8.14`) is the remaining acceptance + validation gate.
> **Status:** Not started
> **Created:** 2026-04-28
> **Branch suggestion:** continue on `feat/phase-07-vditor-editor-autosave`

---

## Goal

Tidy up the Library wiring (remove the `/editor-placeholder` route if phase-06 introduced one), audit the i18n bundle for any editor strings still missing, then run acceptance scenarios 8.1–8.6: open-editor flow + load latency, end-to-end input → disk write, debounce coalescing IPC count, manual `Cmd+S` save, route-leave-and-return content integrity, and `visibilitychange` hide → flush.

The "acceptance" tasks here are not new code — they are **verification scripts** the engineer must execute once the prior plans are merged. We codify the test scripts so they are reproducible.

## Architecture

- **Acceptance tasks (8.x) run against a real `npm run dev` instance**, not in vitest. Each task lists exact commands or click-paths plus what to inspect (file diff, IPC count via DevTools, etc.).
- **Library cleanup is mechanical** — task 6.4 removes a route that may or may not exist and removes any helper component that referenced it. We guard with conditional `grep` before delete.
- **i18n is a final pass** — plan 2 task 3 already added the `editor.*` keys; this plan checks all referenced keys are wired and the JSON parses.

## Tech Stack

- Manual / DevTools-driven verification for 8.x scenarios
- `git diff` for the byte-equality check in 8.x

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/App.tsx` | Modify (remove `/editor-placeholder` if present) | 6.4 |
| `src/pages/EditorPlaceholder.tsx` (or similar) | Delete (if exists) | 6.4 |
| `src/i18n/locales/zh-CN.json` | Modify (final audit) | 7.1 |
| `docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md` | Create — reproducible script | 8.1–8.6 |

## Pre-flight

Plans 1–3 must be merged. The `/editor/<encoded>` route is live, the editor renders, autosave fires on the four triggers, the IPC `file.openExternal` exists, and Library entry points navigate correctly.

To prove the prerequisites are satisfied before starting acceptance:

```bash
npm run typecheck && npm test && npm run lint
```

All three must PASS. If any fails, fix in the relevant earlier plan before continuing.

---

## Tasks

<!-- openspec-task: 6.4 -->
### Task 1: Remove `/editor-placeholder` route (if it exists)

**Files:**
- Modify: `src/App.tsx`
- Possibly delete: `src/pages/EditorPlaceholder.tsx` or similar

Phase-06 might have introduced a placeholder route used by Library buttons before phase-07. Now that the real `/editor/:encodedPath` is live, we remove the placeholder.

- [ ] **Step 1: Look for the placeholder**

Run:
```bash
grep -rn 'editor-placeholder\|EditorPlaceholder' src/ shared/ electron/ 2>/dev/null
```

- **If no results**: the placeholder never existed in this codebase. Skip to Step 4 and commit a no-op marker (`git commit --allow-empty -m "chore(phase-07): no editor-placeholder to remove"`). Move on to task 2.
- **If results exist**: continue to Step 2.

- [ ] **Step 2: Remove the route from `src/App.tsx`**

Find the line:
```tsx
<Route path="/editor-placeholder" element={...} />
```
…and delete it. Also remove the corresponding `import { EditorPlaceholder } from './pages/EditorPlaceholder'` line.

- [ ] **Step 3: Delete the placeholder component file**

If `src/pages/EditorPlaceholder.tsx` exists:
```bash
git rm src/pages/EditorPlaceholder.tsx
```

If a placeholder test exists, delete it too.

- [ ] **Step 4: Verify type-check + tests + grep is clean**

```bash
npm run typecheck && npm test
grep -rn 'editor-placeholder\|EditorPlaceholder' src/ shared/ electron/ 2>/dev/null
```

Expected: PASS, and grep returns no matches.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
# Plus the deletion if applicable
git commit -m "chore(phase-07): remove /editor-placeholder route now that /editor/:encodedPath is live"
```

---

<!-- openspec-task: 7.1 -->
### Task 2: i18n strings — final audit

**Files:**
- Modify: `src/i18n/locales/zh-CN.json` (only if drift)

Plan 2 task 3 step 3 added the `editor.*` namespace. This task confirms every i18n key referenced by any `t('editor.…')` call in the new editor code exists in the JSON, and the JSON parses cleanly.

- [ ] **Step 1: Enumerate every `t('editor.…')` reference**

Run:
```bash
grep -rn "t(['\"]editor\." src/components/editor src/pages/Editor.tsx src/components/library 2>/dev/null | sed -E "s/.*t\(['\"]([^'\"]+)['\"].*/\1/" | sort -u
```

This prints every key string used in the editor/library code. Compare against the JSON keys.

- [ ] **Step 2: Read the JSON keys**

Run:
```bash
node -e "const j=require('./src/i18n/locales/zh-CN.json'); function walk(o,p=''){for(const k of Object.keys(o)){const np=p?p+'.'+k:k;if(typeof o[k]==='object'&&o[k]!==null&&!Array.isArray(o[k]))walk(o[k],np);else console.log(np)}};walk(j)" | grep '^editor\.'
```

This prints every `editor.*` leaf key in the JSON.

- [ ] **Step 3: Diff and fill gaps**

Manually compare the two lists. Add any missing keys to `src/i18n/locales/zh-CN.json` under `editor`. The expected complete set per OpenSpec task `7.1`:

- `editor.back`
- `editor.saving`
- `editor.saved`
- `editor.dirty`
- `editor.error.not_found`
- `editor.error.encoding`
- `editor.error.conflict`
- `editor.error.save_failed`
- `editor.paste_image_unsupported`
- `editor.open_external`

Plus the helper keys plan 2 added: `editor.loading`, `editor.shortcut_save`, `editor.shortcut_save_win`, `editor.no_frontmatter`, `editor.error.title`, `editor.error.save_failed_persistent`, `editor.error.open_logs`.

- [ ] **Step 4: Verify JSON parses + tests pass**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('src/i18n/locales/zh-CN.json','utf8')); console.log('json ok')"
npm test
```

Expected: `json ok` and tests PASS. If `t('editor.X')` is referenced but `X` is missing, react-i18next falls back to the key itself — not crashing, but the UI will display the literal "editor.X" string. The grep + JSON-walk diff above catches this before users see it.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "i18n(phase-07): final audit of editor.* namespace coverage"
```

(If no changes, skip the commit — the audit was a verification pass.)

---

<!-- openspec-task: 8.1 -->
### Task 3: Acceptance — Library "open editor" navigates and loads in <300ms

**Files:**
- Create: `docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md`

Spec scenario: from Library, click "打开编辑器" → route changes to `/editor/<encoded>` → page enters `ready` state in <300ms (warm cache).

- [ ] **Step 1: Create the manual-acceptance doc**

Create `docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md`:

```markdown
# Phase 07 — Acceptance Batch 1 (tasks 8.1–8.6)

Run `npm run dev` and execute each scenario. Each step has an explicit pass criterion.

## 8.1 Library → Editor navigation latency

1. Open a grove with at least one .md file (e.g. `inbox/sample.md`).
2. Open Chromium DevTools → Performance tab → start recording.
3. In Library, click "打开编辑器" on a file row.
4. Wait for the editor's Vditor host to appear; stop recording.

**Pass:**
- URL changes to `/editor/<encoded>`.
- Vditor host (`[data-testid=vditor-host]`) is visible within 300ms of the click (read off the Performance flame chart's "Frames" track).
- No 4xx/5xx in DevTools Network tab.

## 8.2 Type "hello" → debounce → disk

1. With a known file `inbox/sample.md` open in editor, note its current content.
2. Type the literal characters `hello` at the end of the body.
3. Stop typing for ≥1.5 seconds.
4. In a terminal:
   ```bash
   tail -c 200 path/to/grove/inbox/sample.md
   ```

**Pass:**
- The file's body ends with `hello\n`.
- The dirty dot disappears in the TitleBar after the save lands.
- `stat -f %m path/to/grove/inbox/sample.md` reports a newer mtime than before the edit.

## 8.3 20 keystrokes < 1s coalesce

1. With a file open, place the cursor at the end of the body.
2. Quickly type 20 distinct characters within ~800ms (e.g. `abcdefghijklmnopqrst`).
3. Stop typing.
4. In Chromium DevTools → Network tab, filter by "ipc" or expand the renderer-side log.

**Pass:**
- After ~1s of stillness, exactly **one** `file.writeParsed` IPC call fires (not 20).
- Final disk content contains all 20 characters in order.
- (Optional) If the renderer-side log is harder to read, instrument the test by temporarily wrapping `ipc.file.writeParsed` to console.log; revert after.

## 8.4 Cmd+S immediately flushes

1. Type 5 characters but stop just under 1s (do not let debounce fire).
2. Hit `Cmd+S` (mac) / `Ctrl+S` (win/linux).

**Pass:**
- Within ~50ms the saving pulse appears, then the dirty dot disappears.
- File on disk reflects the 5 new characters.
- The browser's default "save page" dialog does NOT appear.

## 8.5 Route round-trip preserves content

1. With a file open in editor, type 3 characters.
2. Wait for the save (dirty dot clears).
3. Click "← 返回果仓" to navigate back to Library.
4. Click "打开编辑器" on the SAME file again.

**Pass:**
- Editor reopens with the 3 characters present in the body (verifies round-trip read after write).
- DevTools "Memory" tab → "Detached DOM" count does NOT show the previous Vditor instance leaking (snapshot before/after).
- Manual side-check: open a file, route away, route back ten times — RAM usage in Activity Monitor stays flat (no GC leak).

## 8.6 Window hide via macOS Cmd+H persists last input

1. Type 2 characters in editor body.
2. Press `Cmd+H` (mac) before debounce fires (within 1s of typing).
3. Inspect file on disk via `tail -c 100 …`.

**Pass:**
- Even though debounce did NOT fire, the file already reflects the 2 characters because `visibilitychange=hidden` triggered `flushSave()`.
- (On linux/win: minimise the window or switch desktop — same expectation.)
```

- [ ] **Step 2: Run scenario 8.1**

Execute the steps in the doc. Record the actual measured latency in a comment on the doc:

```markdown
**Result (run on YYYY-MM-DD, machine: ...):** 187ms — PASS
```

- [ ] **Step 3: Commit the doc**

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md
git commit -m "test(phase-07): manual acceptance script for 8.1–8.6 + 8.1 result"
```

---

<!-- openspec-task: 8.2 -->
### Task 4: Acceptance — input → debounce → disk

- [ ] **Step 1: Run scenario 8.2 from the doc**

Execute step-by-step. Record the result.

- [ ] **Step 2: Append the result**

Append to `docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md` under the `## 8.2` section:

```markdown
**Result (run on YYYY-MM-DD):** body ends with `hello\n`, mtime advanced. PASS.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md
git commit -m "test(phase-07): acceptance 8.2 input→debounce→disk passed"
```

> If the result FAILS: do not commit a passing result. Instead, debug. Common causes: the `file.writeParsed` IPC failed silently (check toast); the dirty flag never flipped (verify `setBody` was called by the Vditor `input` callback). Fix and re-run.

---

<!-- openspec-task: 8.3 -->
### Task 5: Acceptance — 20 keystrokes < 1s coalesce to one IPC

- [ ] **Step 1: Instrument** (temporarily)

Modify `src/ipc/client.ts` — wrap `ipc.file.writeParsed` with a counter (revert before commit):

```ts
const _origWriteParsed = (window.api as any).file.writeParsed
;(window.api as any).file.writeParsed = (...args: unknown[]) => {
  console.count('writeParsed')
  return _origWriteParsed(...args)
}
```

Reload the dev app.

- [ ] **Step 2: Run scenario 8.3**

Execute. Expect `writeParsed: 1` in the console after typing 20 characters quickly + 1s stillness.

- [ ] **Step 3: Revert the instrumentation**

`git checkout -- src/ipc/client.ts` (the instrumentation was a debug aid, not committed).

- [ ] **Step 4: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD):** 20 keystrokes in ~700ms → 1 writeParsed call. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md
git commit -m "test(phase-07): acceptance 8.3 keystroke coalescing passed"
```

---

<!-- openspec-task: 8.4 -->
### Task 6: Acceptance — `Cmd+S` immediately saves

- [ ] **Step 1: Run scenario 8.4**

Type 5 chars, hit Cmd+S well under 1s. Confirm:
- saving pulse appears
- dirty dot clears
- file on disk has the 5 chars
- browser save dialog does NOT appear

- [ ] **Step 2: Append + commit**

```markdown
**Result (run on YYYY-MM-DD):** Cmd+S < 50ms latency to save kick-off; default save dialog suppressed; file on disk correct. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md
git commit -m "test(phase-07): acceptance 8.4 Cmd+S manual save passed"
```

---

<!-- openspec-task: 8.5 -->
### Task 7: Acceptance — route round-trip preserves content + no Vditor leak

- [ ] **Step 1: Run scenario 8.5**

Make 10 round-trips. Inspect:
1. Body content survives the round-trip (always).
2. Memory tab: snapshot before round-trips, snapshot after — Vditor instance count is stable. Look for retained `Vditor` constructor instances.

- [ ] **Step 2: If memory grows**

The likely cause is `vditor.destroy()` not being called. Verify the cleanup in `src/components/editor/VditorEditor.tsx` runs (instrument with `console.log('destroy')`). If `destroy()` doesn't fire, ensure the `useEffect` cleanup is correctly returned.

- [ ] **Step 3: Append + commit**

```markdown
**Result (run on YYYY-MM-DD):** 10 round-trips, content preserved each time, Vditor instance count stable at 1 in heap snapshot. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md
git commit -m "test(phase-07): acceptance 8.5 route round-trip + no leak passed"
```

---

<!-- openspec-task: 8.6 -->
### Task 8: Acceptance — window hide flushes last input

- [ ] **Step 1: Run scenario 8.6 (mac)**

Type 2 chars, hit Cmd+H within 1s. Wait 2s. Show window again. Inspect file on disk.

- [ ] **Step 2: Run on linux/win**

Repeat with "minimise window" or "switch to another app desktop" to trigger `visibilitychange=hidden`. The flush should still fire.

- [ ] **Step 3: Append + commit**

```markdown
**Result (run on YYYY-MM-DD):** Cmd+H within 200ms of last keystroke → on-disk content includes the 2 chars without waiting for debounce. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md
git commit -m "test(phase-07): acceptance 8.6 visibilitychange=hidden flush passed"
```

---

## Plan-4 Acceptance

After all 8 tasks complete:
- [ ] `/editor-placeholder` is gone (no grep matches anywhere in the repo)
- [ ] All `t('editor.…')` keys exist in `src/i18n/locales/zh-CN.json`
- [ ] `docs/superpowers/plans/manual-acceptance-phase-07-batch-1.md` exists and includes a recorded "PASS" result for each of 8.1–8.6
- [ ] `npm run typecheck`, `npm test`, `npm run lint` PASS
- [ ] `git log --oneline` shows eight commits, each scoped to one OpenSpec task (one of which may be the empty placeholder-removal commit if there was nothing to delete)
