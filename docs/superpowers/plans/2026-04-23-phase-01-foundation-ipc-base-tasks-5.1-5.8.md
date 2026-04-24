# Phase-01 Foundation IPC Base — Plan 3/5 (Tasks 5.1–5.8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `electron/main.ts` — the main-process entry that boots the logger, creates the `BrowserWindow` with locked-down security, attaches CSP, intercepts external navigation, registers IPC handlers, manages platform-specific window lifecycle, and exposes `onBeforeQuit` / `onWindowResume` subscriber hooks.

**Architecture:** `main.ts` is the orchestrator. A small `electron/app-lifecycle.ts` module owns the subscriber arrays for `onBeforeQuit` and `onWindowResume` so later phases can register hooks without editing `main.ts`. Security is enforced at three layers: `webPreferences` (contextIsolation + sandbox + nodeIntegration=false), a CSP header injected via `session.webRequest.onHeadersReceived`, and navigation guards on the window's `webContents`.

**Tech Stack:** Electron 39 (`app`, `BrowserWindow`, `session`, `shell`, `powerMonitor`), electron-vite dev URL, existing stub logger.

---

## File Structure Map

| Path | Role |
|------|------|
| `electron/main.ts` | Main process entry |
| `electron/app-lifecycle.ts` | Subscriber hooks (`onBeforeQuit`, `onWindowResume`) |
| `electron/security/csp.ts` | CSP header injection |
| `electron/security/external-links.ts` | `setWindowOpenHandler` + `will-navigate` guards |
| `src/index.html` | Renderer HTML entry (minimal — Plan 4 wires React) |

> The dev-server URL comes from `process.env['ELECTRON_RENDERER_URL']` (set by electron-vite in dev). In production, `BrowserWindow.loadFile('src/index.html')` is used — we compute the path against `__dirname` via `@electron-toolkit/utils` helper `is` + `MAIN_WINDOW_VITE_DEV_SERVER_URL` pattern that electron-vite installs. We use the electron-vite idiom: `if (process.env['ELECTRON_RENDERER_URL']) loadURL(...) else loadFile(...)`.

---

<!-- openspec-task: 5.1 -->
### Task 1: Call `initLogger()` before `app.whenReady()`

**Files:**
- Create: `electron/main.ts`
- Create: `src/index.html` (minimal placeholder; expanded in Plan 4)

- [ ] **Step 1: Create `src/index.html` as a minimal page**

Create `src/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acornvo</title>
  </head>
  <body>
    <div id="root">Acornvo booting…</div>
  </body>
</html>
```

- [ ] **Step 2: Create `electron/main.ts` with `initLogger` pre-ready call**

Create `electron/main.ts` with:

```typescript
import { app } from 'electron'
import { initLogger, logger } from './services/logger'

async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  logger.info('app whenReady fired')
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err)
  process.exit(1)
})
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 4: Smoke — launch the app to confirm it reaches `whenReady`**

Run:
```bash
npm run dev
```
Expected: electron-vite starts, main process launches, console logs "app whenReady fired", then exits cleanly on `Ctrl+C` (no window is created yet — next task adds that).

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts src/index.html
git commit -m "feat(phase-01): electron/main.ts boots logger before app.whenReady"
```

---

<!-- openspec-task: 5.2 -->
### Task 2: Create `BrowserWindow` with locked-down `webPreferences`

**Files:**
- Modify: `electron/main.ts` (add window creation)

- [ ] **Step 1: Extend `electron/main.ts` with `createMainWindow`**

Replace the entire `electron/main.ts` with:

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { initLogger, logger } from './services/logger'

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      preload: join(__dirname, '../preload/preload.js')
    }
  })

  win.once('ready-to-show', () => {
    win.show()
    logger.info('app started', {
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron
    })
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  mainWindow = createMainWindow()
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err)
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 3: Smoke — launch and confirm a window appears**

Run:
```bash
npm run dev
```
Expected:
- An Electron window opens, 1280×800, centered.
- Shows "Acornvo booting…" text from `src/index.html`.
- DevTools may or may not open (fine either way).
- Console prints "app started" with version/platform/electron info.

Quit with `Cmd+Q` (macOS) or `Alt+F4` (Win/Linux).

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-01): create 1280x800 main BrowserWindow with sandbox + contextIsolation"
```

---

<!-- openspec-task: 5.3 -->
### Task 3: Inject CSP via `session.webRequest.onHeadersReceived`

**Files:**
- Create: `electron/security/csp.ts`
- Modify: `electron/main.ts` (call `installCsp()` before window creation)

- [ ] **Step 1: Create `electron/security/csp.ts`**

Create `electron/security/csp.ts` with:

```typescript
import { session } from 'electron'

/**
 * Baseline CSP for the main window. Intentionally permissive on script/style
 * inline to accommodate Vite dev HMR and future vditor/tailwind injection.
 * `vditor-editor-autosave` (phase-03) can tighten this further.
 */
const CSP_BASELINE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: http://localhost:* https://localhost:*"
].join('; ')

export function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_BASELINE]
      }
    })
  })
}
```

- [ ] **Step 2: Call `installCsp()` in `bootstrap()` before creating the window**

In `electron/main.ts`, add an import at the top:

```typescript
import { installCsp } from './security/csp'
```

And modify `bootstrap` to:

```typescript
async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  installCsp()
  mainWindow = createMainWindow()
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 4: Smoke — open DevTools and verify no CSP violation reports**

Run:
```bash
npm run dev
```
Open DevTools (menu View → Toggle Developer Tools, or `Cmd+Opt+I` / `Ctrl+Shift+I`).

Go to the **Network** tab, reload (`Cmd+R`). Click the top document request. Confirm the **Response Headers** panel shows `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...`.

In the **Console** tab, confirm **no** red CSP violation errors. (Warnings about `unsafe-eval` in dev-only contexts are acceptable.)

Quit the app.

- [ ] **Step 5: Commit**

```bash
git add electron/security/csp.ts electron/main.ts
git commit -m "feat(phase-01): install baseline CSP via webRequest.onHeadersReceived"
```

---

<!-- openspec-task: 5.4 -->
### Task 4: `setWindowOpenHandler` — deny and forward to system browser

**Files:**
- Create: `electron/security/external-links.ts`
- Modify: `electron/main.ts` (call after window creation)

- [ ] **Step 1: Create `electron/security/external-links.ts`**

Create `electron/security/external-links.ts` with:

```typescript
import { shell, type BrowserWindow } from 'electron'
import { logger } from '../services/logger'

/**
 * URLs that may be navigated to inside the app window.
 * Currently only the local renderer. Expanded when in-app tabs land.
 */
function isInternalUrl(url: string): boolean {
  return (
    url.startsWith('file://') ||
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:')
  )
}

export function installExternalLinkGuards(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) {
      void shell.openExternal(url).catch((err) => {
        logger.warn('shell.openExternal failed', { url, error: String(err) })
      })
    }
    return { action: 'deny' }
  })
}
```

- [ ] **Step 2: Install the guard after window creation**

In `electron/main.ts`, add the import:

```typescript
import { installExternalLinkGuards } from './security/external-links'
```

And at the end of `createMainWindow`, right before `return win`, add:

```typescript
  installExternalLinkGuards(win)
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 4: Smoke — confirm external links open in system browser**

Run `npm run dev`. In DevTools console:

```javascript
window.open('https://example.com', '_blank')
```

Expected:
- Main Electron window does **not** navigate away.
- System default browser opens `https://example.com` (or the tab that was previously active becomes visible).
- Main-process console logs nothing problematic.

Quit the app.

- [ ] **Step 5: Commit**

```bash
git add electron/security/external-links.ts electron/main.ts
git commit -m "feat(phase-01): setWindowOpenHandler denies + forwards externals to shell.openExternal"
```

---

<!-- openspec-task: 5.5 -->
### Task 5: Guard `will-navigate` against in-window external nav

**Files:**
- Modify: `electron/security/external-links.ts` (extend `installExternalLinkGuards`)

- [ ] **Step 1: Extend the guard to cover `will-navigate`**

Replace the body of `installExternalLinkGuards` in `electron/security/external-links.ts` with:

```typescript
export function installExternalLinkGuards(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) {
      void shell.openExternal(url).catch((err) => {
        logger.warn('shell.openExternal failed', { url, error: String(err) })
      })
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url).catch((err) => {
        logger.warn('shell.openExternal failed', { url, error: String(err) })
      })
    }
  })
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 3: Smoke — confirm in-window nav to external URL is blocked**

Run `npm run dev`. In DevTools console:

```javascript
location.href = 'https://example.com'
```

Expected:
- Main window stays on the Acornvo page (does not navigate).
- System browser opens `https://example.com`.

Quit the app.

- [ ] **Step 4: Commit**

```bash
git add electron/security/external-links.ts
git commit -m "feat(phase-01): block will-navigate to external URLs, forward to shell.openExternal"
```

---

<!-- openspec-task: 5.6 -->
### Task 6: Wire `registerHandlers(ipcHandlers)` into bootstrap

**Files:**
- Modify: `electron/main.ts` (add `registerHandlers` call)

- [ ] **Step 1: Import and register handlers**

In `electron/main.ts`, add the imports:

```typescript
import { registerHandlers } from './ipc/router'
import { ipcHandlers } from './ipc/handlers'
```

Modify `bootstrap()` to register before creating the window:

```typescript
async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  installCsp()
  registerHandlers(ipcHandlers)
  mainWindow = createMainWindow()
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 3: Smoke — confirm `ping.echo` works from DevTools**

Run `npm run dev`. Open DevTools → Console:

```javascript
await window.api.ping.echo('hello')
```

Expected: returns `'hello'`. No red errors.

```javascript
await window.api.log.info('smoke from renderer', { tag: 'test' })
```

Expected: resolves to `undefined`. In the main-process terminal, a log line `[renderer] smoke from renderer { tag: 'test' }` appears (stub logger uses `console.info`).

Quit the app.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-01): register ping + log IPC handlers at bootstrap"
```

---

<!-- openspec-task: 5.7 -->
### Task 7: Platform lifecycle — macOS `Cmd+W` hides, Dock activates, Win/Linux closes

**Files:**
- Modify: `electron/main.ts` (add platform event handlers)

- [ ] **Step 1: Add lifecycle state and handlers to `electron/main.ts`**

Add a module-level flag below existing imports:

```typescript
let isQuitting = false
```

Append the following **after** the `bootstrap().catch(...)` block at the bottom of the file (but inside the module top level):

```typescript
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  // macOS: do nothing — app stays alive with no windows.
})

app.on('activate', () => {
  // macOS: Dock click — re-show hidden window or recreate it.
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    return
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
})
```

Then modify `createMainWindow` — add a `close` handler that hides on macOS when not quitting. Insert **before** `installExternalLinkGuards(win)` near the end of the function:

```typescript
  win.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 3: Smoke — macOS `Cmd+W` hides, Dock click re-shows**

On macOS:

Run `npm run dev`. With the Acornvo window focused, press `Cmd+W`. Expected: window disappears, app stays in Dock.

Click the Acornvo icon in the Dock. Expected: window reappears with the same content.

Press `Cmd+Q`. Expected: app exits cleanly.

On Windows/Linux:

Run `npm run dev`. Close the window with the X button. Expected: app exits cleanly.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-01): platform lifecycle - macOS Cmd+W hides, Dock re-shows, Win/Linux closes"
```

---

<!-- openspec-task: 5.8 -->
### Task 8: Expose `appLifecycle.onBeforeQuit` / `onWindowResume` subscribers

**Files:**
- Create: `electron/app-lifecycle.ts`
- Modify: `electron/main.ts` (wire subscribers into `before-quit` and `powerMonitor.resume`)

- [ ] **Step 1: Create `electron/app-lifecycle.ts`**

Create `electron/app-lifecycle.ts` with:

```typescript
import { logger } from './services/logger'

type Handler = () => Promise<void> | void

const beforeQuitHandlers: Handler[] = []
const windowResumeHandlers: Handler[] = []

function subscribe(list: Handler[], handler: Handler): () => void {
  list.push(handler)
  return () => {
    const idx = list.indexOf(handler)
    if (idx !== -1) list.splice(idx, 1)
  }
}

async function runSerial(list: Handler[], label: string): Promise<void> {
  for (const handler of list) {
    try {
      await handler()
    } catch (err) {
      logger.error(`${label} handler threw`, {
        message: err instanceof Error ? err.message : String(err)
      })
      // Do not rethrow — one bad subscriber must not block the others.
    }
  }
}

export const appLifecycle = {
  onBeforeQuit: (handler: Handler) => subscribe(beforeQuitHandlers, handler),
  onWindowResume: (handler: Handler) => subscribe(windowResumeHandlers, handler),
  _runBeforeQuit: () => runSerial(beforeQuitHandlers, 'before-quit'),
  _runWindowResume: () => runSerial(windowResumeHandlers, 'window-resume')
}
```

- [ ] **Step 2: Wire the runners in `electron/main.ts`**

Add imports:

```typescript
import { powerMonitor } from 'electron'
import { appLifecycle } from './app-lifecycle'
```

Replace the existing `app.on('before-quit', ...)` handler with:

```typescript
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void appLifecycle._runBeforeQuit().finally(() => {
    app.quit()
  })
})
```

And append a `powerMonitor` wiring below the existing `app.on('activate', ...)`:

```typescript
powerMonitor.on('resume', () => {
  void appLifecycle._runWindowResume()
})
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS.

- [ ] **Step 4: Smoke — register a test subscriber and confirm it runs**

Temporarily modify `bootstrap()` to register a test subscriber right after `registerHandlers`:

```typescript
appLifecycle.onBeforeQuit(async () => {
  logger.info('test before-quit subscriber fired')
})
```

Run `npm run dev`. Quit with `Cmd+Q` (macOS) or `Alt+F4` (Win/Linux). Expected: main-process terminal shows `test before-quit subscriber fired` before the process exits.

Also test that one failing subscriber does not stop others — temporarily register two:

```typescript
appLifecycle.onBeforeQuit(async () => { throw new Error('first fails') })
appLifecycle.onBeforeQuit(async () => { logger.info('second ran') })
```

Run and quit. Expected: `first fails` error is logged, then `second ran` is logged, then process exits.

Remove both test subscribers (revert the temporary edits to `bootstrap()`).

- [ ] **Step 5: Commit**

```bash
git add electron/app-lifecycle.ts electron/main.ts
git commit -m "feat(phase-01): expose appLifecycle.onBeforeQuit and onWindowResume subscriber hooks"
```

---

## Plan 3 Wrap-up

After Task 8, `electron/main.ts` should:
- Init logger → wait for `whenReady` → install CSP → register IPC handlers → create locked-down window.
- Handle `Cmd+W` on macOS to hide instead of close.
- Route external links via `shell.openExternal`.
- Serialise subscriber hooks through `appLifecycle._runBeforeQuit` / `_runWindowResume`.

`npm run dev` should open a functional Electron window showing "Acornvo booting…", `window.api.ping.echo('hi')` should return `'hi'` in DevTools, and `window.require` should be `undefined`.

**Still missing before acceptance:** real electron-log (stub is still in place), renderer React app, i18n, store. Those land in Plan 4 + Plan 5.

Next plan: Plan 4 (tasks 6.1–7.5) replaces the logger stub with electron-log and lays down the React renderer base (router, store, i18n init).
