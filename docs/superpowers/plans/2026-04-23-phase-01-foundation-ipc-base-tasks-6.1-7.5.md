# Phase-01 Foundation IPC Base — Plan 4/5 (Tasks 6.1–7.5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the stub logger for `electron-log` with date-rotated files under `~/.acornvo/logs/`, start-up cleanup of old logs, and renderer-side aggregation. Then scaffold the React renderer: `main.tsx` with MemoryRouter + error boundary, `App.tsx` with route placeholders, Zustand root store with theme side-effects, and i18next init for `zh-CN`.

**Architecture:** `electron/services/logger.ts` becomes a thin wrapper around `electron-log` configured at module load. File rotation uses electron-log's built-in size + date transports; old-file cleanup runs once synchronously during `initLogger` (stat + unlink anything older than 14 days). Renderer side uses `window.api.log.<level>` (already wired in Plan 2) — the main-side handler in `electron/ipc/handlers.ts` already prefixes `[renderer]` and forwards to `logger`, so renderer calls end up in the same log file. React is mounted with a memory router (desktop apps have no address bar). The root Zustand store owns theme + locale; `setTheme` writes `document.documentElement.dataset.theme` and subscribes to system color-scheme changes when `theme === 'system'`.

**Tech Stack:** electron-log 5.x, node:fs/promises, node:os, React 19, react-router-dom v7, zustand 5.x, i18next 23.x, react-i18next 15.x.

---

## File Structure Map

| Path                               | Role                                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| `electron/services/logger.ts`      | Replaces stub with electron-log (this plan)                         |
| `src/main.tsx`                     | React entry — MemoryRouter + error boundary                         |
| `src/App.tsx`                      | Route table with placeholders                                       |
| `src/pages/Home.tsx`               | "Hello Acornvo" landing (this plan: empty; Plan 5 adds ping button) |
| `src/pages/Placeholder.tsx`        | Generic placeholder for unbuilt routes                              |
| `src/components/ErrorBoundary.tsx` | Global error boundary                                               |
| `src/stores/root.ts`               | Zustand root store with theme + locale                              |
| `src/i18n/index.ts`                | i18next init                                                        |
| `src/i18n/locales/zh-CN.json`      | zh-CN resource                                                      |
| `src/index.html`                   | Modify: add React mount + script                                    |
| `src/index.css`                    | Minimal base styles (theme-aware)                                   |

---

<!-- openspec-task: 6.1 -->

### Task 1: Configure electron-log file path, 10 MB limit, 14-day retention

**Files:**

- Modify: `electron/services/logger.ts` (replace stub with real config)

- [ ] **Step 1: Replace `electron/services/logger.ts` with electron-log configuration**

Replace the full contents with:

```typescript
import log from 'electron-log/main'
import { app } from 'electron'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type Logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => void
  info: (msg: string, ctx?: Record<string, unknown>) => void
  warn: (msg: string, ctx?: Record<string, unknown>) => void
  error: (msg: string, ctx?: Record<string, unknown>) => void
}

const TEN_MB = 10 * 1024 * 1024

function resolveLogDir(): string {
  const primary = join(homedir(), '.acornvo', 'logs')
  try {
    mkdirSync(primary, { recursive: true })
    return primary
  } catch (err) {
    const fallback = join(app.getPath('userData'), 'logs')
    mkdirSync(fallback, { recursive: true })
    console.warn(`logger: falling back to ${fallback} because ${primary} could not be created`, err)
    return fallback
  }
}

let initialised = false

export async function initLogger(): Promise<void> {
  if (initialised) return
  initialised = true

  const dir = resolveLogDir()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const filePath = join(dir, `main-${today}.log`)

  log.transports.file.resolvePathFn = () => filePath
  log.transports.file.maxSize = TEN_MB
  log.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

  log.initialize()
}

function withCtx(
  level: 'debug' | 'info' | 'warn' | 'error',
  msg: string,
  ctx?: Record<string, unknown>
): void {
  if (ctx && Object.keys(ctx).length > 0) {
    log[level](msg, ctx)
  } else {
    log[level](msg)
  }
}

export const logger: Logger = {
  debug: (msg, ctx) => withCtx('debug', msg, ctx),
  info: (msg, ctx) => withCtx('info', msg, ctx),
  warn: (msg, ctx) => withCtx('warn', msg, ctx),
  error: (msg, ctx) => withCtx('error', msg, ctx)
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 3: Smoke — start the app and confirm a log file is written**

Run `npm run dev`. Wait for the main window to appear. Then in a separate terminal:

```bash
ls -la ~/.acornvo/logs/
```

Expected: directory exists, contains a `main-YYYY-MM-DD.log` file.

```bash
cat ~/.acornvo/logs/main-*.log | head -20
```

Expected: at least one line from the startup log sequence (e.g. "app whenReady fired" or "app started").

Quit the app.

- [ ] **Step 4: Commit**

```bash
git add electron/services/logger.ts
git commit -m "feat(phase-01): electron-log writes to ~/.acornvo/logs/main-YYYY-MM-DD.log with 10MB rotation"
```

---

<!-- openspec-task: 6.2 -->

### Task 2: Log level follows NODE_ENV

**Files:**

- Verify: `electron/services/logger.ts` (set in Task 1)

- [ ] **Step 1: Re-read `initLogger` to confirm level selection**

Open `electron/services/logger.ts`. Confirm both `log.transports.file.level` and `log.transports.console.level` are set based on `process.env.NODE_ENV === 'development'` → `'debug'`, else `'info'`.

- [ ] **Step 2: Dev-mode smoke**

Run `npm run dev`. In DevTools console:

```javascript
await window.api.log.debug('debug-level test')
```

Expected: main-process log file contains a `[debug]` line with `[renderer] debug-level test`.

```bash
grep "debug-level test" ~/.acornvo/logs/main-*.log
```

Expected: match found.

Quit the app.

- [ ] **Step 3: Prod-mode smoke (optional, if `npm run start` works)**

Skip if Plan 3 has not yet produced a buildable app. Otherwise:

```bash
npm run build
NODE_ENV=production ./out/main/main.js   # or the packaged binary
```

Call `window.api.log.debug('should be swallowed')` from DevTools.

```bash
grep "should be swallowed" ~/.acornvo/logs/main-*.log
```

Expected: no match (debug level is swallowed in prod).

This check is a stretch goal; skip if the production packaging is not yet exercised in Plan 3.

- [ ] **Step 4: No commit required** (already covered by Task 1). If a fix was needed, commit with:

```bash
git add electron/services/logger.ts
git commit -m "fix(phase-01): respect NODE_ENV for log level selection"
```

---

<!-- openspec-task: 6.3 -->

### Task 3: Emit "app started" log line with version/platform/electron

**Files:**

- Verify: `electron/main.ts` already emits this line inside `ready-to-show` (Plan 3 Task 2).

- [ ] **Step 1: Confirm the line is still in place**

Run:

```bash
grep -A 5 "ready-to-show" electron/main.ts
```

Expected: output shows `logger.info('app started', { version, platform, electron })`. If absent, restore it:

```typescript
win.once('ready-to-show', () => {
  win.show()
  logger.info('app started', {
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron
  })
})
```

- [ ] **Step 2: Smoke — confirm the line hits the file**

Run `npm run dev`. After window is visible, quit.

```bash
grep "app started" ~/.acornvo/logs/main-*.log
```

Expected: one line containing "app started" plus the version/platform/electron fields.

- [ ] **Step 3: Commit only if a fix was needed**

```bash
git add electron/main.ts
git commit -m "fix(phase-01): ensure 'app started' log line emits with version/platform/electron"
```

---

<!-- openspec-task: 6.4 -->

### Task 4: Clean up log files older than 14 days on startup

**Files:**

- Modify: `electron/services/logger.ts` (extend `initLogger` with cleanup)

- [ ] **Step 1: Add cleanup helper and call it from `initLogger`**

In `electron/services/logger.ts`, add imports at the top:

```typescript
import { readdir, stat, unlink } from 'node:fs/promises'
```

Add a helper after `resolveLogDir`:

```typescript
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

async function cleanupOldLogs(dir: string): Promise<void> {
  const now = Date.now()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    entries.map(async (name) => {
      if (!name.endsWith('.log')) return
      const full = join(dir, name)
      try {
        const st = await stat(full)
        if (now - st.mtimeMs > FOURTEEN_DAYS_MS) {
          await unlink(full)
        }
      } catch {
        // Swallow — one file failing should not block others.
      }
    })
  )
}
```

Call it inside `initLogger` **after** resolving `dir`:

```typescript
export async function initLogger(): Promise<void> {
  if (initialised) return
  initialised = true

  const dir = resolveLogDir()
  await cleanupOldLogs(dir)

  const today = new Date().toISOString().slice(0, 10)
  const filePath = join(dir, `main-${today}.log`)
  // ... rest unchanged
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 3: Smoke — seed an old file and confirm cleanup**

Run:

```bash
touch -t 202001010000 ~/.acornvo/logs/main-2020-01-01.log
ls ~/.acornvo/logs/ | grep 2020-01-01
```

Expected: old file exists before startup.

Run `npm run dev`. Wait for window to appear. Quit.

```bash
ls ~/.acornvo/logs/ | grep 2020-01-01 || echo 'deleted'
```

Expected: output `deleted` (file is gone).

- [ ] **Step 4: Commit**

```bash
git add electron/services/logger.ts
git commit -m "feat(phase-01): cleanup log files older than 14 days on startup"
```

---

<!-- openspec-task: 6.5 -->

### Task 5: Renderer log handler forwards with `[renderer]` prefix

**Files:**

- Verify: `electron/ipc/handlers.ts` (already does this — Plan 2 Task 4)

- [ ] **Step 1: Confirm the handler still prefixes `[renderer]`**

Run:

```bash
grep -A 2 "log:" electron/ipc/handlers.ts | grep '\[renderer\]'
```

Expected: four matches (debug/info/warn/error all prefix `[renderer]`). If fewer, re-apply the shape from Plan 2 Task 4 Step 1.

- [ ] **Step 2: Smoke — renderer log arrives in the file with prefix**

Run `npm run dev`. In DevTools console:

```javascript
await window.api.log.error('boom', { where: 'smoke' })
```

Quit. Then:

```bash
grep "\[renderer\] boom" ~/.acornvo/logs/main-*.log
```

Expected: one line with `[error]` level, message `[renderer] boom`, plus the `{ where: 'smoke' }` context.

- [ ] **Step 3: Commit only if a fix was needed**

```bash
git add electron/ipc/handlers.ts
git commit -m "fix(phase-01): renderer log handler prefixes [renderer]"
```

---

<!-- openspec-task: 7.1 -->

### Task 6: `src/main.tsx` — React root with `<MemoryRouter>` and error boundary

**Files:**

- Create: `src/main.tsx`
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/index.css`
- Modify: `src/index.html` (add React mount + script tag)

- [ ] **Step 1: Create `src/components/ErrorBoundary.tsx`**

Create with:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Forward to main-process log via preload API.
    void window.api?.log?.error(error.message, {
      componentStack: info.componentStack ?? ''
    })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 24 }}>
          <h1>Something went wrong</h1>
          <pre>{this.state.error.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Create `src/index.css`**

Create with:

```css
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

html[data-theme='dark'] {
  background: #1e1e1e;
  color: #eaeaea;
}

html[data-theme='light'] {
  background: #fafafa;
  color: #1e1e1e;
}

body {
  margin: 0;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
}
```

- [ ] **Step 3: Create `src/main.tsx`**

Create with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element not found in src/index.html')
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ErrorBoundary>
  </StrictMode>
)
```

> `./App` and `./i18n` are created in later tasks in this plan. TypeScript will flag missing modules — that is expected until Tasks 7–11 land. After Task 11 the error clears.

- [ ] **Step 4: Update `src/index.html` to mount React**

Replace the `<body>` of `src/index.html` with:

```html
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
```

- [ ] **Step 5: Typecheck (may fail temporarily)**

Run:

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: FAIL with `Cannot find module './App'` / `'./i18n'`. That is expected — subsequent tasks create those files.

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx src/components/ErrorBoundary.tsx src/index.css src/index.html
git commit -m "feat(phase-01): React root mounts with MemoryRouter and ErrorBoundary"
```

---

<!-- openspec-task: 7.2 -->

### Task 7: `src/App.tsx` — route table with placeholders

**Files:**

- Create: `src/App.tsx`
- Create: `src/pages/Home.tsx`
- Create: `src/pages/Placeholder.tsx`

- [ ] **Step 1: Create `src/pages/Placeholder.tsx`**

Create with:

```tsx
type Props = { name: string }

export function Placeholder({ name }: Props): JSX.Element {
  return (
    <div style={{ padding: 24 }}>
      <h2>{name}</h2>
      <p>This route is a placeholder. It will be implemented in a later phase.</p>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/Home.tsx`**

Create with:

```tsx
export function Home(): JSX.Element {
  return (
    <div style={{ padding: 24 }}>
      <h1>Hello Acornvo</h1>
    </div>
  )
}
```

> Plan 5 Task 2 (label 7.7) extends `Home` with the ping button.

- [ ] **Step 3: Create `src/App.tsx` with the full route table**

Create with:

```tsx
import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Placeholder } from './pages/Placeholder'

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/picker" element={<Placeholder name="picker" />} />
      <Route path="/library" element={<Placeholder name="library" />} />
      <Route path="/editor/:path" element={<Placeholder name="editor" />} />
      <Route path="/browser" element={<Placeholder name="browser" />} />
      <Route path="/chat" element={<Placeholder name="chat" />} />
      <Route path="/settings" element={<Placeholder name="settings" />} />
    </Routes>
  )
}
```

- [ ] **Step 4: Typecheck (still may fail on `./i18n`)**

Run:

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: FAIL only on `Cannot find module './i18n'` (Task 10 adds it). If other errors appear, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/Home.tsx src/pages/Placeholder.tsx
git commit -m "feat(phase-01): route table with Home and Placeholder pages"
```

---

<!-- openspec-task: 7.3 -->

### Task 8: Zustand root store with `theme` and `locale`

**Files:**

- Create: `src/stores/root.ts`

- [ ] **Step 1: Create `src/stores/root.ts`**

Create with:

```typescript
import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type Locale = 'zh-CN' | 'en-US'

export type RootState = {
  theme: Theme
  locale: Locale
  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
}

export const useRootStore = create<RootState>((set) => ({
  theme: 'system',
  locale: 'zh-CN',
  setTheme: (theme) => set({ theme }),
  setLocale: (locale) => set({ locale })
}))
```

> The theme side-effect (writing `data-theme`, subscribing to `matchMedia`) is added in Task 9 — keeping this task focused on the store shape.

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: same as before — still failing on `./i18n` only.

- [ ] **Step 3: Delete `src/stores/.gitkeep`**

Run:

```bash
rm -f src/stores/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/root.ts src/stores/.gitkeep
git commit -m "feat(phase-01): root Zustand store with theme and locale"
```

---

<!-- openspec-task: 7.4 -->

### Task 9: `setTheme` side-effect — write `data-theme` + subscribe to system scheme

**Files:**

- Modify: `src/stores/root.ts` (extend setters with side effects; expose `applyThemeEffect`)

- [ ] **Step 1: Extend `src/stores/root.ts` with theme effect logic**

Replace the full contents with:

```typescript
import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type Locale = 'zh-CN' | 'en-US'

export type RootState = {
  theme: Theme
  locale: Locale
  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
}

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.dataset.theme = effective
}

let mediaListenerBound = false
let mediaQuery: MediaQueryList | null = null

function bindSystemThemeListener(store: { getState: () => RootState }): void {
  if (mediaListenerBound || typeof window === 'undefined') return
  mediaListenerBound = true
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (store.getState().theme === 'system') {
      applyThemeToDocument('system')
    }
  })
}

export const useRootStore = create<RootState>((set) => ({
  theme: 'system',
  locale: 'zh-CN',
  setTheme: (theme) => {
    set({ theme })
    applyThemeToDocument(theme)
  },
  setLocale: (locale) => set({ locale })
}))

// One-time setup — called from src/main.tsx after store is imported.
export function initThemeEffect(): void {
  applyThemeToDocument(useRootStore.getState().theme)
  bindSystemThemeListener(useRootStore)
}
```

- [ ] **Step 2: Call `initThemeEffect()` from `src/main.tsx` once**

In `src/main.tsx`, add the import:

```typescript
import { initThemeEffect } from './stores/root'
```

And call it before `createRoot(...)`:

```typescript
initThemeEffect()

createRoot(container)
  .render
  // ... unchanged
  ()
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: still failing only on `./i18n` — the next task clears that.

- [ ] **Step 4: Commit**

```bash
git add src/stores/root.ts src/main.tsx
git commit -m "feat(phase-01): setTheme writes data-theme and subscribes to prefers-color-scheme"
```

---

<!-- openspec-task: 7.5 -->

### Task 10: i18next init with `zh-CN`

**Files:**

- Create: `src/i18n/index.ts`
- Create: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Create `src/i18n/locales/zh-CN.json`**

Create with:

```json
{
  "app": {
    "title": "Acornvo",
    "greeting": "你好，Acornvo"
  },
  "common": {
    "loading": "加载中…",
    "error": "发生错误"
  },
  "nav": {
    "home": "首页",
    "picker": "项目选择",
    "library": "理果",
    "editor": "编辑器",
    "browser": "拾果",
    "chat": "松语",
    "settings": "设置"
  }
}
```

- [ ] **Step 2: Create `src/i18n/index.ts`**

Create with:

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN }
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false
  },
  returnNull: false
})

export { i18n }
```

- [ ] **Step 3: Ensure `tsconfig.web.json` allows JSON imports**

Run:

```bash
grep resolveJsonModule tsconfig.web.json || echo 'needs add'
```

If `needs add`, edit `tsconfig.web.json` and add to `compilerOptions`:

```json
    "resolveJsonModule": true,
```

(Leave the rest of the file untouched.)

- [ ] **Step 4: Typecheck — should now fully PASS**

Run:

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: PASS. All cross-file references resolved.

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS (unchanged).

- [ ] **Step 5: Delete `src/i18n/.gitkeep`**

Run:

```bash
rm -f src/i18n/.gitkeep
```

- [ ] **Step 6: Smoke — launch and confirm the renderer boots**

Run `npm run dev`. Expected:

- Main Electron window opens.
- Shows "Hello Acornvo" in a plain page (no ping button yet — that lands in Plan 5).
- DevTools console shows no red errors.
- `document.documentElement.dataset.theme` is `'light'` or `'dark'` depending on system scheme.

Quit the app.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/zh-CN.json src/i18n/.gitkeep tsconfig.web.json
git commit -m "feat(phase-01): i18next initialized with zh-CN resource"
```

---

## Plan 4 Wrap-up

After Task 10, the repo should have:

- `electron/services/logger.ts` using `electron-log` with rotated files at `~/.acornvo/logs/main-YYYY-MM-DD.log`, 10 MB limit, 14-day cleanup.
- React renderer mounting: `src/main.tsx`, `src/App.tsx`, route placeholders, `src/components/ErrorBoundary.tsx`.
- Zustand root store with theme side-effects wired via `initThemeEffect()`.
- i18next initialized with `zh-CN`.

`npm run dev` should show a styled React window with "Hello Acornvo". `npx tsc --noEmit` passes for both projects.

Next plan: Plan 5 (tasks 7.6–8.7) exposes the typed `ipc` client, wires the ping button, and runs the full acceptance checklist including `openspec validate --strict`.
