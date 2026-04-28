# Phase 07 — Vditor Editor + Autosave: Plan 5 (Acceptance batch 2 + validation)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-07-vditor-editor-autosave`
> **Task range:** OpenSpec tasks `8.7`–`8.14` (8 tasks)
> **Plan order:** 5 of 5. Builds on plans 1–4. After this plan the change is ready for `/opsx:archive`.
> **Status:** Not started
> **Created:** 2026-04-28
> **Branch suggestion:** continue on `feat/phase-07-vditor-editor-autosave`

---

## Goal

Run the remaining acceptance scenarios — image-paste interception, on-disk byte-equality of unmodified `ir`-mode saves, external mtime-conflict toast, Library no-flicker during edit (selfWrites), offline Vditor-asset load, full-frontmatter rail render + open-external launch, and watcher-triggered "file removed" handling — and finally run `openspec validate phase-07-vditor-editor-autosave --strict` to seal the change.

## Architecture

- **All eight tasks are verification gates**, not new code (with one exception: 8.13 may add a tiny watcher subscription to the editor store if not already present).
- **Reproducible results** are captured into the same `docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md` file (sibling to batch 1).
- **`openspec validate --strict`** is a CI-grade gate: any spec/scenario format drift fails it.

## Tech Stack

- DevTools, file-system inspection (`diff`, `stat`, `touch`)
- The Acornvo CLI shell harness for offline reproduction
- `openspec` CLI

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md` | Create | 8.7–8.13 |
| `src/stores/editor.ts` | Modify (subscribe to watcher events for 8.13) | 8.13 |
| `src/stores/editor.test.ts` | Modify | 8.13 |
| `openspec/changes/phase-07-vditor-editor-autosave/**` | Read-only — validated by `openspec validate --strict` | 8.14 |

## Pre-flight

Plans 1–4 must be merged. The branch must compile, all unit tests pass, lint passes, and the manual-acceptance batch-1 doc has a PASS for each of 8.1–8.6.

```bash
npm run typecheck && npm test && npm run lint
```

If any FAIL: do not start the acceptance scripts. Fix in the upstream plan first.

---

## Tasks

<!-- openspec-task: 8.7 -->
### Task 1: Acceptance — paste image is intercepted with toast

- [ ] **Step 1: Create the manual-acceptance batch-2 doc**

Create `docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md`:

```markdown
# Phase 07 — Acceptance Batch 2 (tasks 8.7–8.14)

Run `npm run dev` for the interactive scenarios. Each step has an explicit pass criterion.

## 8.7 Image paste is intercepted

1. Copy any small PNG to clipboard (e.g. screenshot).
2. With a `.md` open in editor, place the cursor at the end of body and `Cmd/Ctrl+V`.

**Pass:**
- A toast appears with the text "尚未支持图片粘贴，将在拾果阶段接入".
- The body does NOT receive a `data:image/...` URL or any image markup.
- Vditor doesn't fire an upload request (DevTools Network tab → no POST).

## 8.8 ir-mode round-trip is byte-equal except trailing LF

1. Choose a representative file (with `*` italics, `_` italics, code fences, lists). Compute its hash:
   ```bash
   shasum -a 256 path/to/grove/notes/sample.md > /tmp/before.sha
   ```
2. Open it in editor.
3. Wait for `ready` state. Do NOT type anything.
4. Hit `Cmd+S` to flush.
5. Compute hash again:
   ```bash
   shasum -a 256 path/to/grove/notes/sample.md > /tmp/after.sha
   diff /tmp/before.sha /tmp/after.sha
   ```

**Pass:**
- `diff` shows the hashes are identical, OR if they differ, `git diff path/to/grove/notes/sample.md` shows ONLY trailing-LF changes (the spec allows "结尾 LF 规整").
- Mixed `*` and `_` italics survive.
- Code fences, lists, headings preserved exactly.

## 8.9 External mtime change → toast

1. Open `path/to/grove/notes/sample.md` in editor (do not type).
2. In a terminal:
   ```bash
   touch path/to/grove/notes/sample.md
   ```
   This bumps the mtime without changing content.
3. In the editor, type a single character.
4. Wait 1s for debounce + save attempt.

**Pass:**
- A toast appears: "文件在外部被修改，请先刷新".
- The dirty dot stays visible (the body was NOT overwritten on disk).
- Subsequent `cat path/to/grove/notes/sample.md` shows it does NOT contain the new character.

## 8.10 5000-row Library does not flicker during edit

1. Use a grove with ≥5000 indexed `.md` files (or temporarily pad with `for i in $(seq 1 5000); do echo "# t" > grove/x/$i.md; done` then re-index).
2. Open Library, then click "打开编辑器" on any file.
3. Type continuously in editor for 30 seconds.
4. Switch back to Library briefly (Cmd+1 or whatever shortcut).

**Pass:**
- Library list does NOT re-render or flicker during the typing.
- DevTools React Profiler shows zero re-renders of `<VirtualFileList>` rows triggered by the editor's writes (selfWrites is suppressing the watcher event).
- (If a re-render IS observed: check that `electron/services/indexer.ts` emits `index:fileChanged` and that the renderer's library store filters it. Fix in phase-05 if drifted.)

## 8.11 Offline Vditor assets load

1. Disconnect from the network (turn off Wi-Fi).
2. Quit Acornvo.
3. Relaunch.
4. Open any file in editor.

**Pass:**
- Vditor renders icons + uses CN i18n (assuming `lang: 'zh_CN'` was set or default English is acceptable).
- DevTools Network tab shows zero failed requests for `vditor` assets — every asset comes from `/vditor/...`.
- `npm run build` produces a build that includes `dist/renderer/vditor/` (run `npm run build && ls out/renderer/vditor` to confirm).

## 8.12 Full frontmatter rail + open-external

1. Open a file with rich frontmatter:
   ```yaml
   ---
   category: 技术/深度学习
   site: example.com
   title: 注意力机制全景
   rating: 4
   summary: 这是摘要
   highlights:
     - 第一点
     - 第二点
   tags:
     - ai
     - attention
   published_at: 2026-01-15
   clipped_at: 2026-04-01T12:00:00Z
   ---
   # body
   ```
2. Inspect the right rail.
3. Click the "在系统文本编辑器中打开" button.

**Pass:**
- Rail shows: `技术/深度学习` (top-left), `example.com` (top-right), title, 4 filled stars + 1 empty, summary, two highlight bullets, two tag chips, both dates.
- Click → OS opens the file in the user's default text editor (TextEdit / Notepad / etc.).

## 8.13 Watcher delete during edit → editor reflects "file removed"

(Implementation may need a small wiring change in editor store — see plan task 2.)

1. Open `notes/sample.md` in editor.
2. In a terminal: `rm path/to/grove/notes/sample.md`.
3. Wait up to 2s for the watcher to fire `index:fileChanged`.
4. Type a single character in the editor (or just wait for debounce).

**Pass:**
- The store transitions to `{ kind: 'error', error: 'E_NOT_FOUND' }` either from the watcher event or the next save attempt's `E_NOT_FOUND` reply (per spec: "本阶段可只在保存时遇到 E_NOT_FOUND 后转错误态").
- The error view appears with "文件已被移除或重命名".
```

- [ ] **Step 2: Run scenario 8.7**

Execute as documented.

- [ ] **Step 3: Record + commit**

Append the result and commit:

```markdown
**Result (run on YYYY-MM-DD):** Toast displayed, body unchanged, no upload network call. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "test(phase-07): manual acceptance batch-2 doc + 8.7 paste-image intercept passed"
```

---

<!-- openspec-task: 8.8 -->
### Task 2: Acceptance — ir-mode preserves md byte-equality (modulo trailing LF)

- [ ] **Step 1: Pick a representative source file**

Use a file with at least: `*italic*`, `_italic_`, `**bold**`, `code`, fenced blocks, ordered + unordered lists, a heading hierarchy, and (if possible) a frontmatter block.

- [ ] **Step 2: Run scenario 8.8 from the doc**

```bash
shasum -a 256 path/to/grove/notes/sample.md > /tmp/before.sha
# open editor, wait for ready, Cmd+S, no typing
shasum -a 256 path/to/grove/notes/sample.md > /tmp/after.sha
diff /tmp/before.sha /tmp/after.sha
git -C path/to/grove diff path/to/grove/notes/sample.md  # if grove is a git repo
```

- [ ] **Step 3: If hashes differ**

Inspect `git diff` byte-by-byte. If the only delta is `\n` at EOF: PASS. If anything else changes (e.g. `*` → `_` swap, blank-line collapse): FAIL — investigate Vditor's `ir` mode handling, and consider switching to `wysiwyg`-with-original-source-preservation if warranted (per design D1 backup option). Document the finding.

- [ ] **Step 4: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD):** Hashes identical (no trailing-LF normalization needed). PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "test(phase-07): acceptance 8.8 ir-mode byte-equality passed"
```

---

<!-- openspec-task: 8.9 -->
### Task 3: Acceptance — external mtime change triggers conflict toast

- [ ] **Step 1: Run scenario 8.9**

Open file. `touch` from terminal. Type a char. Wait for save.

- [ ] **Step 2: Verify**

- Toast: "文件在外部被修改，请先刷新" (or whatever the i18n string resolves to).
- File on disk still does NOT contain the typed character.
- Dirty dot remains.
- Editor store: `useEditorStore.getState().state.lastError === 'conflict'` (poke via DevTools console).

- [ ] **Step 3: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD):** Toast displayed, disk untouched, dirty preserved. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "test(phase-07): acceptance 8.9 mtime conflict toast passed"
```

---

<!-- openspec-task: 8.10 -->
### Task 4: Acceptance — Library 5000-row stability during edit (selfWrites silence)

- [ ] **Step 1: Prepare a large grove**

If no 5000-file grove is available, generate one in a scratch directory:

```bash
mkdir -p /tmp/big-grove/notes
for i in $(seq 1 5000); do echo "# t$i" > "/tmp/big-grove/notes/$(printf '%04d' $i).md"; done
```

Open this grove from the picker.

- [ ] **Step 2: Run scenario 8.10**

Open editor on any file, type for 30s, then click back to Library briefly.

- [ ] **Step 3: Profile**

In React DevTools → Profiler, record the 30s edit window. Look at `<VirtualFileList>` and its row components: their render-count should remain at the baseline established before typing started (just the editor's own re-renders should occur).

- [ ] **Step 4: If re-renders are observed**

Likely cause: phase-05 watcher's `selfWrites` filter is not applied or has expired. Check `electron/services/indexer.ts` for the `selfWrites.set(absPath, ...)` call inside `fs-atomic`'s `writeWithVerify` (or wherever the registration lives). Confirm the 3s expiry has not passed (per phase-05 design).

- [ ] **Step 5: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD):** 30s edit, zero VirtualFileList row re-renders observed (baseline 1 render). PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "test(phase-07): acceptance 8.10 5000-row library no flicker during edit"
```

---

<!-- openspec-task: 8.11 -->
### Task 5: Acceptance — offline Vditor assets

- [ ] **Step 1: Verify packaged assets**

```bash
npm run build && ls out/renderer/vditor 2>/dev/null | head
```

If the listing is empty, the renderer's `publicDir` configuration did not pick up `src/public/vditor/` during build. Inspect `electron.vite.config.ts` — for `electron-vite`'s renderer, the default Vite `publicDir` is `<root>/public` where `root` is `src/`, so `src/public/vditor/` should be copied. If it is not, add explicit `renderer.publicDir: resolve(__dirname, 'src/public')`. Re-run.

- [ ] **Step 2: Run scenario 8.11**

Disconnect Wi-Fi. Run `npm run dev`. Open editor.

- [ ] **Step 3: Verify**

DevTools Network tab — every request to `/vditor/...` resolves locally (Status 200, Initiator `vditor`, Type `script`/`stylesheet`/`image`). No requests to `cdn.jsdelivr.net` / `unpkg.com`.

- [ ] **Step 4: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD, offline):** Vditor renders normally, all assets served from /vditor/. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "test(phase-07): acceptance 8.11 offline Vditor assets passed"
```

---

<!-- openspec-task: 8.12 -->
### Task 6: Acceptance — full frontmatter rail + open-external launch

- [ ] **Step 1: Author a fixture file**

Place this file at `path/to/grove/notes/rich.md`:

```markdown
---
category: 技术/深度学习
site: example.com
title: 注意力机制全景
rating: 4
summary: 这是摘要
highlights:
  - 第一点
  - 第二点
tags:
  - ai
  - attention
published_at: 2026-01-15
clipped_at: 2026-04-01T12:00:00Z
---
# body content
```

- [ ] **Step 2: Run scenario 8.12**

Open in editor. Inspect rail. Click "在系统文本编辑器中打开".

- [ ] **Step 3: Verify**

- All eight fields render in the rail.
- Click → file opens in OS default editor (TextEdit / Notepad++ / nano).

- [ ] **Step 4: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD):** All frontmatter fields rendered correctly, system editor launched on click. PASS.
```

```bash
git add docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "test(phase-07): acceptance 8.12 frontmatter rail + open-external passed"
```

---

<!-- openspec-task: 8.13 -->
### Task 7: Acceptance — watcher-triggered "file removed" → editor error state

**Files:**
- Modify: `src/stores/editor.ts` (add subscription if missing)
- Modify: `src/stores/editor.test.ts`
- Append result to: `docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md`

Per spec scenario "删除打开中的文件 (phase 5 watcher 触发)": if the file is deleted under the editor, the next save returns `E_NOT_FOUND` and the store transitions to error. Per task 8.13's note "本阶段可只在保存时遇到 E_NOT_FOUND 后转错误态；观察即可" — implementation can be passive (rely on the next save attempt failing).

We add a passive transition: in the catch block of `_doSave`, when `code === 'E_NOT_FOUND'`, transition to `{ kind: 'error', path, error: 'E_NOT_FOUND' }`.

- [ ] **Step 1: Add the failing test**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store — file removed during edit', () => {
  it('save throwing E_NOT_FOUND transitions store to error state', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ;(ipcMock.file as any).writeParsed = vi
      .fn()
      .mockRejectedValueOnce(new IpcError('E_NOT_FOUND', 'file gone'))

    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.path).toBe('a.md')
    expect(s.error).toBe('E_NOT_FOUND')
  })
})
```

Run:
```bash
npx vitest run src/stores/editor.test.ts -t 'file removed'
```

Expected: FAIL — currently `E_NOT_FOUND` lands in the generic `else` branch which keeps `state.kind === 'ready'` and just records `lastError = 'E_NOT_FOUND'`.

- [ ] **Step 2: Specialise the catch**

In `src/stores/editor.ts` `_doSave` catch block, add an early branch above the generic non-conflict branch:

```ts
    if (err instanceof IpcError && err.code === 'E_NOT_FOUND') {
      useEditorStore.setState({
        state: { kind: 'error', path: cur.path, error: 'E_NOT_FOUND' }
      })
      return
    }
```

> The reference to `cur.path` here works because we captured `path` from `next` (rename `next` to `cur` here for safety, or capture `path = next.path` at the top of catch). Use whatever local that's already in scope from the enclosing function.

- [ ] **Step 3: Run the test**

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: PASS.

- [ ] **Step 4: Manual run scenario 8.13**

Open file in editor, `rm` it from terminal, type one character, wait 1s.

- [ ] **Step 5: Verify**

The error view appears: "文件已被移除或重命名".

- [ ] **Step 6: Append result + commit**

```markdown
**Result (run on YYYY-MM-DD):** Delete during edit → next save throws E_NOT_FOUND → editor transitions to error state with not-found copy. PASS.
```

```bash
git add src/stores/editor.ts src/stores/editor.test.ts docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md
git commit -m "feat(phase-07): editor store transitions to error on save E_NOT_FOUND + acceptance 8.13"
```

---

<!-- openspec-task: 8.14 -->
### Task 8: `openspec validate phase-07-vditor-editor-autosave --strict`

**Files:**
- (validation only — no source changes expected)

This is the gating check. The OpenSpec validator enforces format invariants (every Requirement has ≥1 Scenario, every modified spec correctly merges, etc.).

- [ ] **Step 1: Run the validator**

Run:
```bash
openspec validate phase-07-vditor-editor-autosave --strict
```

Expected: exit code 0, "OK" or equivalent. If failures appear:
- Read each error message.
- Fix the offending spec/proposal/design/tasks file inside `openspec/changes/phase-07-vditor-editor-autosave/`.
- Re-run.

Common strict-mode complaints:
- Requirement without scenario.
- Scenario without `WHEN` / `THEN`.
- A `MODIFIED` requirement that does not match an existing requirement in the base spec.
- Capitalisation drift on `MUST` / `SHALL`.

- [ ] **Step 2: Run the full project gates one last time**

```bash
npm run typecheck && npm test && npm run lint
openspec validate phase-07-vditor-editor-autosave --strict
```

Expected: all four PASS.

- [ ] **Step 3: Commit any spec fixes (if needed)**

```bash
git add openspec/changes/phase-07-vditor-editor-autosave
git commit -m "chore(phase-07): tighten OpenSpec artifacts for --strict"
```

(Skip if no fixes were required.)

- [ ] **Step 4: Tag the change as ready for archive**

The change is now ready for `/opsx:archive`. The archive command will move the artifacts under `openspec/archive/...` and update any base specs.

> Do NOT run `/opsx:archive` here — it is a separate, deliberate action. Inform the user that phase-07 is ready and stop.

---

## Plan-5 Acceptance

After all 8 tasks complete:
- [ ] Every scenario in `docs/superpowers/plans/manual-acceptance-phase-07-batch-2.md` has a recorded PASS result.
- [ ] `openspec validate phase-07-vditor-editor-autosave --strict` exits 0.
- [ ] `npm run typecheck` PASSES
- [ ] `npm test` PASSES — including the new `file removed` test in `src/stores/editor.test.ts`
- [ ] `npm run lint` PASSES
- [ ] All eight commits are scoped to a single OpenSpec task each.
- [ ] Phase-07 is ready for `/opsx:archive`.
