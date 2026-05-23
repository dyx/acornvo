# Phase 20 · Chat UI Ant Design X — Tasks 0.1–1.8 (Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-20-chat-ui-ant-design-x` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify phase-19 K1 `callId` extension landed, add antd / @ant-design/x-markdown / @ant-design/icons / dayjs as deps, wire `XProvider` into `App.tsx` with a CSS-variable→token bridge (`src/lib/theme.ts`), and connect antd locale to `i18n.language`. After this plan: the app boots with XProvider at the root, chat page still renders the legacy components, and non-chat pages have zero visual regressions.

**Architecture:** A single `themeTokens` object maps the existing "squirrel" CSS variables (`--color-paper`, `--color-line`, `--color-ink`, `--color-paper-2`, `--color-ink-3`) to antd `ConfigProvider` tokens (`colorBgContainer`, `colorBorder`, `colorText`, `colorBgLayout`, `colorTextSecondary`). `App.tsx` wraps its root tree in `<XProvider theme={...} locale={antdLocale}>`. `antdLocale` is derived from `i18n.language` (zh\* → `zhCN`, else → `enUS`); `useTranslation()` triggers re-renders on language switch so the prop stays in sync. CSS variables and light/dark switching logic stay untouched.

**Tech Stack:** TypeScript 5, React 18, Electron, `antd` (latest 5.x), `@ant-design/x` (^2.7.0, already in repo), `@ant-design/x-markdown`, `@ant-design/icons`, `dayjs`, `react-i18next`, `vitest`, `@testing-library/react`.

**Ant Design X reference:** When wiring `XProvider`, theme tokens, or `XComponentsConfig` slots, consult the `x-components` skill (covers Bubble / Sender / Conversations / ThoughtChain / Welcome / Prompts / Actions / Attachments / Sources / Suggestion / Think / FileCard / CodeHighlighter / Mermaid / Folder / **XProvider** / Notification). When unsure about a token, prop, or slot name, invoke the skill before guessing.

**Repo conventions to follow:**

- Imports use the path alias `@/*` for `src/*` and `@shared/*` for `shared/*`.
- Tests use `vitest` + `@testing-library/react`; co-located with source files as `<name>.test.ts(x)`.
- Commit style: Conventional Commits (`feat:`, `chore:`, `test:`, `refactor:`, `fix:`).
- Do NOT modify CSS variable definitions in `src/index.css` — token mapping reads them as strings.

---

<!-- openspec-task: 0.1 -->

### Task 1: Verify phase-19 K1 callId extension on tool events

**Files:**

- Inspect (no edit): `shared/agent-types.ts`

- [x] **Step 1: Locate `tool.start` and `tool.result` event definitions**

Run: `grep -n "tool.start\|tool.result\|tool.approval-needed" /Users/aaa/develop/workspace-ai/acornvo/shared/agent-types.ts`

Expected: each event variant must show an OPTIONAL `callId?: string` field, e.g.:

```ts
| { type: 'tool.start'; callId?: string; tool: string; args: unknown }
| { type: 'tool.result'; callId?: string; tool: string; result: ToolResult }
```

- [x] **Step 2: If callId is missing on either variant, STOP**

If the grep output shows `{ type: 'tool.start'; tool: string; args: unknown }` (no `callId?`) or the result variant lacks `callId?`, phase-19 K1 has NOT merged. Halt execution and announce to the user: "phase-19 K1 callId extension not yet on main; phase-20 is blocked. Please verify phase-19 archive status."

- [x] **Step 3: Record verification in plan log**

If both fields are present, mark this task complete. No code change in this task; this is a pre-flight gate.

- [x] **Step 4: Commit (no-op marker)**

```bash
git commit --allow-empty -m "chore(phase-20): verify phase-19 K1 callId extension present on tool events"
```

---

<!-- openspec-task: 0.2 -->

### Task 2: Verify stream-translator passes LangGraph tool_call_id through to events

**Files:**

- Inspect (no edit): `electron/agent/stream-translator.ts`

- [x] **Step 1: Inspect stream-translator for tool_call_id propagation**

Run: `grep -n "tool_call_id\|callId" /Users/aaa/develop/workspace-ai/acornvo/electron/agent/stream-translator.ts`

Expected: the translator reads LangGraph `tool_call_id` and writes it to `event.callId` for both `tool.start` and `tool.result`. Look for code like:

```ts
emit({ type: 'tool.start', callId: chunk.tool_call_id, tool: ..., args: ... })
emit({ type: 'tool.result', callId: chunk.tool_call_id, tool: ..., result: ... })
```

- [x] **Step 2: If callId is not propagated, STOP**

If grep returns no matches or the translator omits `callId` on emit, phase-19 stream-translator is incomplete. Halt execution and announce: "phase-19 stream-translator does not propagate tool_call_id → tool.start/result.callId. phase-20 is blocked. File a fix-up in phase-19."

- [x] **Step 3: Record verification**

If callId is propagated, mark task complete.

- [x] **Step 4: Commit (no-op marker)**

```bash
git commit --allow-empty -m "chore(phase-20): verify stream-translator propagates tool_call_id → event.callId"
```

---

<!-- openspec-task: 0.3 -->

### Task 3: Grep existing react-markdown / remark-gfm / radix dialog+dropdown usage

**Files:**

- Output: capture grep results in scratch notes (no file edits)

- [x] **Step 1: List all imports of `react-markdown` and `remark-gfm`**

Run: `grep -rn "from 'react-markdown'\|from 'remark-gfm'" /Users/aaa/develop/workspace-ai/acornvo/src 2>/dev/null`

- [x] **Step 2: List all imports of `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu`**

Run: `grep -rn "from '@radix-ui/react-dialog'\|from '@radix-ui/react-dropdown-menu'" /Users/aaa/develop/workspace-ai/acornvo/src 2>/dev/null`

- [x] **Step 3: Classify hits as chat-domain vs non-chat-domain**

A path under `src/components/chat/` or `src/pages/Chat.tsx` counts as chat-domain. Others (e.g. `src/components/TitleBar.tsx`, `src/components/StatusBar.tsx`, `src/components/search/QuickSwitcher.tsx`, `src/pages/Settings.tsx`) count as non-chat.

Record the answer to this question for Plan 5 (Cleanup) Task 6 (`tasks 7.6`):

> Are `react-markdown` / `remark-gfm` / `@radix-ui/react-dialog` / `@radix-ui/react-dropdown-menu` used outside chat? If YES, keep the package in `package.json` after chat-domain imports are deleted. If NO, remove the package.

- [x] **Step 4: Write findings to commit message**

```bash
git commit --allow-empty -m "chore(phase-20): inventory react-markdown/remark-gfm/radix-dialog/radix-dropdown usage

react-markdown chat-domain hits: <count> (<file list>)
react-markdown non-chat hits: <count> (<file list>)
remark-gfm chat-domain hits: <count>
remark-gfm non-chat hits: <count>
@radix-ui/react-dialog chat-domain hits: <count>
@radix-ui/react-dialog non-chat hits: <count>
@radix-ui/react-dropdown-menu chat-domain hits: <count>
@radix-ui/react-dropdown-menu non-chat hits: <count>"
```

(Fill in counts and file lists from steps 1–2.)

---

<!-- openspec-task: 1.1 -->

### Task 4: Add antd / @ant-design/x-markdown / @ant-design/icons / dayjs to package.json

**Files:**

- Modify: `package.json`

- [x] **Step 1: Verify @ant-design/x is already present**

Run: `grep '"@ant-design/x"' /Users/aaa/develop/workspace-ai/acornvo/package.json`
Expected: `"@ant-design/x": "^2.7.0",`

- [x] **Step 2: Edit dependencies block alphabetically**

Add these four entries to the `dependencies` block of `package.json` (between existing alphabetical neighbors):

```jsonc
"@ant-design/icons": "^5.5.2",
"@ant-design/x-markdown": "^0.1.0",
"antd": "^5.22.0",
"dayjs": "^1.11.13",
```

Place them in correct alphabetical order:

- `"@ant-design/icons"` — between `"@ant-design/x"` and `"@electron-toolkit/preload"`
- `"@ant-design/x-markdown"` — between `"@ant-design/icons"` and `"@electron-toolkit/preload"` (after `icons`)
- `"antd"` — between `"ajv-formats"` and `"archiver"`
- `"dayjs"` — between `"clsx"` and `"diff"` (or wherever fits alphabetically)

Lock versions: do NOT use `latest` or unbounded ranges.

- [x] **Step 3: Commit dependency additions (no install yet)**

```bash
git add package.json
git commit -m "chore(deps): add antd + @ant-design/x-markdown + @ant-design/icons + dayjs for phase-20"
```

---

<!-- openspec-task: 1.2 -->

### Task 5: Run npm install and verify Electron dev + build:unpack still work

**Files:**

- Modify: `package-lock.json` (generated)

- [x] **Step 1: Install dependencies**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm install`
Expected: install completes; `package-lock.json` updates with antd / @ant-design/x-markdown / @ant-design/icons / dayjs.

- [x] **Step 2: Verify dev server starts**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run dev` (in another shell or as background task).
Expected: Vite + Electron main both start without compile errors. App window opens. Look for the standard "vite ready" and "main started" log lines.

Once verified, kill the dev process.

- [x] **Step 3: Verify production build packs**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run build:unpack`
Expected: `electron-builder --dir` completes; `dist/mac-arm64/` (or platform-specific) contains the unpacked app. No native module errors (especially `better-sqlite3`).

- [x] **Step 4: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore(deps): npm install — antd / x-markdown / icons / dayjs"
```

---

<!-- openspec-task: 1.3 -->

### Task 6: Write failing test for src/lib/theme.ts themeTokens mapping

**Files:**

- Create: `src/lib/theme.test.ts`

- [x] **Step 1: Write the failing test**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/lib/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { themeTokens } from './theme'

describe('themeTokens', () => {
  it('maps colorBgContainer to --color-paper CSS variable', () => {
    expect(themeTokens.colorBgContainer).toBe('var(--color-paper)')
  })

  it('maps colorBgLayout to --color-paper-2 CSS variable', () => {
    expect(themeTokens.colorBgLayout).toBe('var(--color-paper-2)')
  })

  it('maps colorBorder to --color-line CSS variable', () => {
    expect(themeTokens.colorBorder).toBe('var(--color-line)')
  })

  it('maps colorText to --color-ink CSS variable', () => {
    expect(themeTokens.colorText).toBe('var(--color-ink)')
  })

  it('maps colorTextSecondary to --color-ink-3 CSS variable', () => {
    expect(themeTokens.colorTextSecondary).toBe('var(--color-ink-3)')
  })

  it('sets fontFamily literal "Source Han Serif SC", serif', () => {
    expect(themeTokens.fontFamily).toBe('"Source Han Serif SC", serif')
  })

  it('sets borderRadius literal number 6', () => {
    expect(themeTokens.borderRadius).toBe(6)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/lib/theme.test.ts`
Expected: FAIL with "Cannot find module './theme'" (or similar import error).

---

<!-- openspec-task: 1.3 -->

### Task 7: Create src/lib/theme.ts exporting themeTokens

**Files:**

- Create: `src/lib/theme.ts`

- [x] **Step 1: Write the minimal implementation**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/lib/theme.ts`:

```ts
import type { ThemeConfig } from 'antd'

export const themeTokens: ThemeConfig['token'] = {
  colorBgContainer: 'var(--color-paper)',
  colorBgLayout: 'var(--color-paper-2)',
  colorBorder: 'var(--color-line)',
  colorText: 'var(--color-ink)',
  colorTextSecondary: 'var(--color-ink-3)',
  fontFamily: '"Source Han Serif SC", serif',
  borderRadius: 6
}
```

- [x] **Step 2: Run theme test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/lib/theme.test.ts`
Expected: PASS (7 assertions).

- [x] **Step 3: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat(chat-theme-bridge): map CSS variables to antd theme tokens"
```

---

<!-- openspec-task: 1.4 -->
<!-- openspec-task: 1.5 -->

### Task 8: Wire XProvider into App.tsx with theme + locale bridge

**Files:**

- Modify: `src/App.tsx`

- [x] **Step 1: Add a helper to derive antd locale from i18n.language**

Inside `src/App.tsx`, add an import and a small helper at the top of the module (after the existing imports):

```ts
import { XProvider } from '@ant-design/x'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import { themeTokens } from '@/lib/theme'

function pickAntdLocale(lng: string) {
  return lng.toLowerCase().startsWith('zh') ? zhCN : enUS
}
```

- [x] **Step 2: Wrap the root tree with XProvider**

Inside the `App` component, before the `return (`, call `useTranslation()` so re-renders fire on language change:

```ts
export function App(): JSX.Element {
  const { i18n } = useTranslation()
  const antdLocale = pickAntdLocale(i18n.language)
  const { toast } = useToast()
  // ... existing hooks
```

Then change the outermost JSX wrapper from:

```tsx
return (
  <div className="flex h-full flex-col bg-[color:var(--color-paper)]">
    <TitleBar />
    {/* ... */}
    <Toaster />
  </div>
)
```

to:

```tsx
return (
  <XProvider theme={{ token: themeTokens }} locale={antdLocale}>
    <div className="flex h-full flex-col bg-[color:var(--color-paper)]">
      <TitleBar />
      {/* ... */}
      <Toaster />
    </div>
  </XProvider>
)
```

Note: keep the inner `<div>` unchanged; only the outer wrapper changes. Do NOT pass `components: { Bubble: ..., Sender: ... }` yet — token-only suffices for Plan 1; component-level theming lands when Bubble.List / Sender go live in Plan 3.

- [x] **Step 3: Run dev to verify it boots**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run dev` (background).
Expected: app window renders normally. No console errors. Visual: Library / Browse / Editor / Chat all look identical to before. Kill dev when verified.

- [x] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(chat-theme-bridge): wrap App with XProvider + antd locale bridge"
```

---

<!-- openspec-task: 1.6 -->

### Task 9: Extend theme.test.ts with antd locale bridge smoke

**Files:**

- Modify: `src/lib/theme.test.ts`

- [x] **Step 1: Extract `pickAntdLocale` helper to `src/lib/theme.ts` for testability**

Edit `src/lib/theme.ts` — add the export below the `themeTokens` const:

```ts
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import type { Locale } from 'antd/lib/locale'

export function pickAntdLocale(lng: string): Locale {
  return lng.toLowerCase().startsWith('zh') ? zhCN : enUS
}
```

And update the existing import block at the top of `src/lib/theme.ts` if needed.

- [x] **Step 2: Update App.tsx to import the helper from theme.ts**

In `src/App.tsx`, remove the inline `pickAntdLocale` helper and the `zhCN` / `enUS` imports (they live in `theme.ts` now). Replace with:

```ts
import { themeTokens, pickAntdLocale } from '@/lib/theme'
```

- [x] **Step 3: Add locale bridge assertions to the test file**

Append to `src/lib/theme.test.ts`:

```ts
import { pickAntdLocale } from './theme'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'

describe('pickAntdLocale', () => {
  it('returns zhCN for "zh-CN"', () => {
    expect(pickAntdLocale('zh-CN')).toBe(zhCN)
  })

  it('returns zhCN for "zh" (bare)', () => {
    expect(pickAntdLocale('zh')).toBe(zhCN)
  })

  it('returns zhCN for "ZH-cn" (case-insensitive)', () => {
    expect(pickAntdLocale('ZH-cn')).toBe(zhCN)
  })

  it('returns enUS for "en-US"', () => {
    expect(pickAntdLocale('en-US')).toBe(enUS)
  })

  it('returns enUS for "fr-FR" (default fallback)', () => {
    expect(pickAntdLocale('fr-FR')).toBe(enUS)
  })
})
```

- [x] **Step 4: Run tests to verify all pass**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/lib/theme.test.ts`
Expected: PASS (12 assertions total: 7 themeTokens + 5 pickAntdLocale).

- [x] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts src/App.tsx
git commit -m "test(chat-theme-bridge): cover pickAntdLocale (zh* → zhCN, else enUS)"
```

---

<!-- openspec-task: 1.7 -->

### Task 10: Smoke-test non-chat pages — no visual regression

**Files:**

- Inspect: `src/pages/Library.tsx`, `src/pages/Browse.tsx`, `src/pages/Editor.tsx`, `src/pages/History.tsx`, `src/pages/Search.tsx`, `src/pages/Settings.tsx`

- [x] **Step 1: Run full vitest suite**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run`
Expected: all existing tests pass. XProvider wrap is non-disruptive (no new failures). Library acceptance + Browse acceptance specifically must stay green.

If any non-chat test fails: investigate the cause (likely XProvider conflicting with a Tailwind / Radix setup); do NOT mask by tweaking the test. If the conflict is real, narrow XProvider's scope (wrap only the `<Outlet />` instead of the whole tree).

- [x] **Step 2: Manual smoke each non-chat page in dev**

Run: `npm run dev` (background). For each route, open and visually verify:

- `/library` — file tree, search input, list rendering unchanged
- `/browse/:id` — markdown reader unchanged
- `/editor/:id` — vditor editor opens, toolbar / preview unchanged
- `/history` — timeline unchanged
- `/search` — search results UI unchanged
- `/settings` — settings tabs unchanged

Document any visual diff in the commit message body. Expected: NO diffs.

- [x] **Step 3: Commit smoke-test confirmation**

```bash
git commit --allow-empty -m "chore(phase-20): smoke-test non-chat pages under XProvider — no regression"
```

---

<!-- openspec-task: 1.8 -->

### Task 11: Smoke-test dark mode under XProvider

**Files:**

- No code change; observe behavior in dev

- [x] **Step 1: Open dev mode and switch to dark mode**

Run: `npm run dev` (background). Open Settings → Theme → switch from light to dark (or use OS-level appearance switch if app respects `prefers-color-scheme`).

Verify:

- App backgrounds and text colors update via CSS variables.
- Chat page (still on legacy components) renders correctly in dark mode — bubble backgrounds, sidebar, input area all follow `--color-paper-2` / `--color-paper`.
- antd-aware areas (none yet since chat is still legacy; this is a baseline) show no white flashes or untinted areas.

- [x] **Step 2: Document the known derived-hover-color trade-off**

antd's hover/focus color variants are derived via HSL math on the literal color value. Because `themeTokens` passes `var(--color-paper)` etc. as opaque strings, derived hover/focus tints will NOT track dark-mode CSS variable changes. This is acknowledged in `design.md §B-Th1`. Note this caveat in the commit message — no fix needed in Plan 1.

- [x] **Step 3: Commit confirmation with caveat note**

```bash
git commit --allow-empty -m "chore(phase-20): smoke-test dark mode under XProvider — base palette tracks; derived hover tints don't (known trade-off, B-Th1)"
```

---

## Plan completion checklist

After all 11 tasks pass, before moving to Plan 2:

- [x] `package.json` contains `antd`, `@ant-design/x-markdown`, `@ant-design/icons`, `dayjs` with locked versions.
- [x] `src/lib/theme.ts` exports `themeTokens` and `pickAntdLocale`.
- [x] `src/App.tsx` renders `<XProvider theme={{ token: themeTokens }} locale={antdLocale}>`.
- [x] `npx vitest run src/lib/theme.test.ts` passes (12 assertions).
- [x] `npx vitest run` passes overall (no non-chat regressions).
- [x] Manual: non-chat pages visually unchanged.
- [x] Manual: dark mode base palette still works under XProvider.
- [x] Pre-flight verifications (Tasks 1–3) documented in commit history.
