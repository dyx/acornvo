# Phase 20 · Chat UI Ant Design X — Tasks 8.1–8.10 (Verification)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-20-chat-ui-ant-design-x` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final gate before archive. Run automated tests + typecheck + lint, exercise the manual PRD §13 parity checklist (15 behaviors), drill specifically into attachments and collapse-mode edge cases, sanity-check bundle size, run `openspec validate`, and finish with a dark-mode × i18n combined smoke pass. Nothing in this plan writes code (except minor fixups if a smoke test reveals a real bug). If a real bug surfaces, file the patch as a `fix:` commit and re-run the affected gate.

**Architecture:** None — this plan is a verification rollup. Each task either runs a command, performs a manual UI test, or runs `openspec validate`. All failures here either (a) point back to a Plan 1–5 task that's incomplete and must be retraced, or (b) reveal a real bug introduced during migration that needs a focused fix.

**Tech Stack:** vitest, tsc, eslint, openspec CLI, Electron dev mode, dev tools window-resize, npm build outputs.

**Repo conventions:** Use the existing scripts in `package.json` — do NOT add new ones. Document manual results in commit messages.

---

<!-- openspec-task: 8.1 -->

### Task 1: Run chat-acceptance test in isolation

**Files:**

- Run only: `src/__acceptance__/chat-acceptance.test.tsx`

- [x] **Step 1: Execute**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/__acceptance__/chat-acceptance.test.tsx --reporter=verbose`

Expected: 100% PASS. Plan 5 Task 7 rewrote the file's selectors and mkSlot; this is the canonical gate.

- [x] **Step 2: If RED, root-cause**

For each failure:

- Read the error message + the failing assertion in the test file
- Trace to which capability spec it covers (the `chat-message-list`, `chat-input`, etc. scenarios)
- Check whether the corresponding Plan 2/3/4/5 task fully implemented that capability
- If a Plan task is incomplete, return to that plan and finish it; do NOT mutate the test to make it green

Common patterns:

- "Cannot find role 'button' with name 'Approve'" → likely the i18n key path is wrong in `ApprovalInlineActions`, or the antd Locale is not loaded; check Plan 1 Task 5 (`pickAntdLocale`).
- "Expected status 'streaming' got 'idle'" → `__setChatTokenBatching(false)` is not being called in `beforeEach`; ensure Plan 5 Task 7 Step 5 is in place.
- "Cannot read property 'streamingBuffer'" → Plan 4 didn't fully purge the field; revisit Plan 4 Task 11.

- [x] **Step 3: Commit confirmation**

```bash
git commit --allow-empty -m "chore(phase-20): chat-acceptance.test.tsx — all green"
```

---

<!-- openspec-task: 8.2 -->

### Task 2: Run full vitest suite

**Files:**

- Run: entire test suite

- [x] **Step 1: Execute**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run`
Expected: 100% PASS across all test files (chat + non-chat).

- [x] **Step 2: Inspect non-chat suite specifically**

If any non-chat test fails:

- Library / Browse / Editor / History / Search / Settings tests have nothing to do with chat changes. A failure here is a regression introduced by Plan 1 (XProvider wrapping) or Plan 5 (Radix package removal).
- Read the error carefully. If a Radix component test fails, Plan 5 Task 6 was wrong about non-chat usage of that package. Restore it.

- [x] **Step 3: Commit confirmation**

```bash
git commit --allow-empty -m "chore(phase-20): full vitest suite — all green"
```

---

<!-- openspec-task: 8.3 -->

### Task 3: Run typecheck

**Files:**

- Run: `tsc --noEmit` (both projects)

- [x] **Step 1: Execute**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck`
Expected: 0 errors in both `tsconfig.node.json` and `tsconfig.web.json` passes.

- [x] **Step 2: Read errors closely if any**

Common late-stage errors:

- `Property 'status' does not exist on type 'ChatMessage'` → Plan 4 Task 2 not committed
- `Cannot find module './SessionList'` → Plan 5 Task 4 deleted a file still imported elsewhere
- antd type mismatches around `ConfigProvider.theme.token` → tighten the import path in Plan 1's `theme.ts`

- [x] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore(phase-20): typecheck — 0 errors"
```

---

<!-- openspec-task: 8.4 -->

### Task 4: Run lint

**Files:**

- Run: ESLint

- [x] **Step 1: Execute**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run lint`
Expected: 0 errors. Warnings are tolerable but fix obvious unused-import warnings.

- [x] **Step 2: Common eslint complaints to handle proactively**

- Unused imports from deleted modules — remove
- React hook deps array missing values — add them or wrap with `useEvent` pattern
- `@typescript-eslint/no-explicit-any` on the `as any` casts in Plan 3 Bubble.List `roles` and Plan 2 Sender `ref` — add an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a one-line reason

- [x] **Step 3: Commit**

```bash
git add -A 2>/dev/null
git commit -m "fix(chat): lint cleanups after antd migration" || \
git commit --allow-empty -m "chore(phase-20): lint — 0 errors"
```

---

<!-- openspec-task: 8.5 -->

### Task 5: Manual PRD §13 — 15-item behavior parity walkthrough

**Files:**

- No code. Manual UI exercise in `npm run dev`.

- [ ] **Step 1: Start dev**

Run: `npm run dev` (background). Open the Electron app window.

- [ ] **Step 2: Walk through each item; record result**

For each of the 15 items below, perform the action, observe the result, and tick the box. If any item fails, file a `fix:` commit before moving on.

- [ ] **Item 1 — Empty state**: open a brand-new session → Welcome heading + 4 Prompts cards render → clicking a card fills Sender and focuses it (no auto-send).

- [ ] **Item 2 — Plain text chat**: type "hello" + Cmd+Enter → user bubble appears at end → assistant streams response → Bubble.streaming animation visible during stream → markdown formatting renders correctly on completion.

- [ ] **Item 3 — Long conversation scroll**: scroll up past 80px in the message list → "新消息 ↓" floating button appears → click button → smooth-scrolls to bottom → button hides → new tokens autoscroll once you're at bottom.

- [ ] **Item 4 — Tool call display**: trigger a session that uses tools → ThoughtChain renders inside the assistant bubble → each step shows tool name + collapsible args + collapsible result + status icon (success/error/loading).

- [ ] **Item 5 — Awaiting approval**: an `update_frontmatter` or `write_file` tool call triggers approval → inline Actions (Approve / Reject / Edit) render in the ThoughtChain step → no right-side panel.

- [ ] **Item 6 — Edit args before approve**: click Edit → ApprovalDrawer slides in from right (width=520) → for `update_frontmatter` shows FrontmatterDiff; for other tools shows JsonArgsEditor → edit JSON → click "确认并同意" → approveTool called with edited args → Drawer closes → inline Actions disappear.

- [ ] **Item 7 — Cancel mid-stream**: send a long message, then press Esc → Sender cancel button fires → stream stops → status returns to idle.

- [ ] **Item 8 — Switch session**: click another session in left Conversations → activeSessionId updates → Bubble.List re-renders that session's messages → Sender clears.

- [ ] **Item 9 — Delete session**: right-click (or hover-menu) → "删除" → Modal.confirm opens → click OK → session removed from list → active switches to next.

- [ ] **Item 10 — Profile toggle**: click ProfileFooter chip / topbar chip → antd Dropdown lists profiles → click one → session's profileId updates → footer reflects new profile + model.

- [ ] **Item 11 — Attachments**: click paperclip in Sender prefix → file picker opens → select 3 files → AttachmentsAdapter renders 3 chips in Sender.Header → click one item's close icon → that chip removes → send message → all chips clear + Sender.Header unmounts.

- [ ] **Item 12 — Dark mode**: toggle dark mode (Settings or OS) → Bubble / ConversationsAdapter / Sender / Drawer backgrounds & text use the dark CSS variables → derived hover tints may not perfectly match (known trade-off, see Plan 1 Task 11).

- [ ] **Item 13 — Shortcuts dialog**: click `?` button in top right → antd Modal opens with hotkey list → press Esc → Modal closes.

- [ ] **Item 14 — Delete session confirm dialog**: same as Item 9 but explicitly: clicking Cancel in the confirm dialog does NOT delete; clicking outside the modal closes it without deleting.

- [ ] **Item 15 — Error banner**: simulate an error (e.g. unplug network during a stream) → `error` event fires → antd Alert error banner renders at the top of the right column → close (X) hides it.

- [ ] **Step 3: Commit walkthrough result**

```bash
git commit --allow-empty -m "chore(phase-20): PRD §13 15-item parity walkthrough — all pass (notes: <if any item revealed minor issue, summarize and link to fix commit>)"
```

---

<!-- openspec-task: 8.6 -->

### Task 6: Manual attachments add/remove/send full-chain test

**Files:**

- No code. Manual.

- [ ] **Step 1: Multi-file add**

Click paperclip → select 3 files (e.g. `a.md`, `b.md`, `c.md`). Verify 3 chips render in `Sender.Header` in **selection order** (not alphabetical).

- [ ] **Step 2: Single remove**

Click the close icon on chip 2 (`b.md`). Verify only it disappears; `a.md` and `c.md` remain.

- [ ] **Step 3: Send clears**

Send a message. Verify:

- The attachments are included in the outgoing message (check user bubble shows chips or shows the attachment list)
- `Sender.Header` unmounts (no longer takes vertical space)
- `pendingAttachments` in store reads `[]`

- [ ] **Step 4: Edge case — close last attachment**

Add 1 file, then click its close. Verify `Sender.Header` unmounts immediately.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore(phase-20): manual attachments add/remove/send full-chain — pass"
```

---

<!-- openspec-task: 8.7 -->

### Task 7: Manual window-resize collapse-mode test

**Files:**

- No code. Manual.

- [ ] **Step 1: Wide → Narrow**

Start with the dev window at ≥1100px wide. Verify ConversationsAdapter shows full session titles + group headers. Drag the window narrower until <960px. Verify:

- Group headers ("今日" / "本周" / "更早") become hidden or compressed
- Each session row shows only an icon + truncated title (≤8 chars)
- "新建" button is still visible (probably as an icon-only button)

- [ ] **Step 2: Narrow → Wide**

Drag back to ≥1100px. Verify full mode returns: titles expand, group headers reappear.

- [ ] **Step 3: Click works in both modes**

In narrow mode, click a session — activeSessionId updates → right column re-renders that session. Same in wide mode.

- [ ] **Step 4: Edge case — exact 960px boundary**

Slowly drag across the 960px threshold. The transition should be visually clean (no flash, no broken layout).

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore(phase-20): manual collapse-mode (≥960 / <960) — pass"
```

---

<!-- openspec-task: 8.8 -->

### Task 8: Check bundle-size baseline impact

**Files:**

- Run: `npm run build`; inspect `dist/`.

- [x] **Step 1: Baseline current main build**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run build`
Expected: build completes. Note: `prebuild` regenerates licenses; `typecheck` is a precondition (Task 3 already validated).

- [x] **Step 2: Measure bundle outputs**

After build, run:

```bash
du -sh /Users/aaa/develop/workspace-ai/acornvo/out/renderer/assets/*.js 2>/dev/null | sort -h
```

Capture the totals. Compare to the pre-Phase-20 baseline (use `git log --all --grep="phase-19" --oneline | head -1` to find the last phase-19 commit, then `git stash; git checkout <commit>; npm run build; du -sh ...; git checkout main; git stash pop` — OR refer to a pre-recorded baseline note in `docs/`).

- [x] **Step 3: Compare**

If total renderer JS grew by > 200KB gzipped (rule of thumb: antd + antd-x adds ~150–200KB gzipped), evaluate tree-shaking:

- Check `vite.config.ts` / `electron.vite.config.ts` — confirm Vite's default tree-shaking is on (it is).
- Confirm imports from `antd` use the named import form (`import { Drawer } from 'antd'`) rather than default-import — they should.
- Consider adding `babel-plugin-import` only if growth exceeds 400KB gzipped.

For Phase-20 the expected delta is ~150–250KB gzipped (antd + x-markdown + icons). Anything beyond 300KB warrants investigation.

- [x] **Step 4: Commit findings**

```bash
git commit --allow-empty -m "chore(phase-20): bundle size delta after antd migration: <before> → <after> renderer JS (gzipped <delta>) — within expected range / requires optimization (see Step 3)"
```

---

<!-- openspec-task: 8.9 -->

### Task 9: Run openspec validate phase-20

**Files:**

- Run: `openspec validate`

- [x] **Step 1: Execute**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && openspec validate phase-20-chat-ui-ant-design-x`
Expected: validation passes with no errors. Warnings about completed tasks should be informational.

- [x] **Step 2: If errors appear**

Most likely error: spec scenario language mismatched implementation. The fix path:

- If a scenario references a behavior we did NOT implement (e.g. "Conversations.creation icon = Plus"), patch the implementation to match
- If a scenario language is stale (referring to `streamingBuffer`), correct the spec file in `openspec/changes/phase-20-chat-ui-ant-design-x/specs/*.md`

Do NOT modify any spec file unless the spec itself is wrong. Generally implementation drift, not spec drift.

- [x] **Step 3: Re-run validate and commit**

Run: `openspec validate phase-20-chat-ui-ant-design-x` again until clean.

```bash
git commit --allow-empty -m "chore(phase-20): openspec validate — clean"
```

---

<!-- openspec-task: 8.10 -->

### Task 10: Dark mode × i18n combined smoke (run §8.5 twice)

**Files:**

- No code. Manual.

- [ ] **Step 1: Light mode + zh-CN — run §8.5 walkthrough (Items 1–15)**

Set Settings → Language → 简体中文. Confirm light mode. Run all 15 items from Task 5 quickly. Note any visual issue (truncation, untranslated string, broken layout).

- [ ] **Step 2: Light mode + en-US — run §8.5 walkthrough**

Switch to English. Confirm light mode. Repeat all 15 items. Watch for:

- English Modal "OK" / "Cancel" buttons (antd locale en_US)
- All chat strings localized correctly (Welcome heading, Prompts, ApprovalDrawer title etc.)
- No mixed Chinese/English in antd internals

- [ ] **Step 3: Dark mode + zh-CN — run §8.5 walkthrough**

Switch back to 中文. Toggle dark mode. Run all 15 items. Watch for:

- Bubble / Drawer / Modal / Alert backgrounds use dark CSS variables
- Text contrast acceptable
- Note any case where derived hover color looks "stuck" on light (Plan 1 known trade-off)

- [ ] **Step 4: Dark mode + en-US — run §8.5 walkthrough**

Final round. Watch for any combination-only issues.

- [ ] **Step 5: Document findings + commit**

```bash
git commit --allow-empty -m "chore(phase-20): dark × i18n combined smoke (zh-light / en-light / zh-dark / en-dark) — all behaviors green; known trade-off: antd derived hover tints don't track dark mode (B-Th1)"
```

---

## Plan completion checklist

After all 10 tasks pass, phase-20 is ready to archive:

- [ ] `npx vitest run src/__acceptance__/chat-acceptance.test.tsx` — PASS
- [ ] `npx vitest run` — PASS overall
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] PRD §13 15-item parity manual checklist — all confirmed
- [ ] Attachments full-chain manual — confirmed
- [ ] Collapse-mode (≥960 / <960) manual — confirmed
- [ ] Bundle size delta within expected range (~150–250KB gzipped) — measured
- [ ] `openspec validate phase-20-chat-ui-ant-design-x` — clean
- [ ] Dark × i18n 4-way smoke — confirmed

Run `/opsx:archive phase-20-chat-ui-ant-design-x` (after this plan's `executing-plans` syncs tasks.md) when all the above are green.
