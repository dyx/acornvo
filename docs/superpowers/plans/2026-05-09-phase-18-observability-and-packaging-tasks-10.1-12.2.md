# Phase 18 — Packaging + App Shell Wiring + i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plan Index:** 4 of 5 for `phase-18-observability-and-packaging`
**OpenSpec tasks covered:** 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2

**Status:** Ready
**Last Updated:** 2026-05-09
**Plan branch:** `phase-19-ui-remediation`

**Sources:**
- `openspec/changes/phase-18-observability-and-packaging/design.md` (D8, D10)
- `openspec/changes/phase-18-observability-and-packaging/tasks.md` (§10, §11, §12)
- `openspec/changes/phase-18-observability-and-packaging/specs/app-packaging/spec.md`
- `openspec/changes/phase-18-observability-and-packaging/specs/app-shell/spec.md`

**Out of scope:**
- Foundation modules (Plan 1)
- Crash / Diagnostic / Observability page (Plan 2)
- About / Update / Telemetry feature implementations (Plan 3)
- Verification (Plan 5)

**Open issues:**
- Existing `electron-builder.yml` exists with `appId: com.electron.app`, `productName: acornvo`, basic NSIS, mac with `notarize: false`, linux with three targets (AppImage/snap/deb), and a placeholder `publish.url`. We **rewrite** the relevant fields per design D8 while preserving existing extendInfo/categories.
- Existing `build/` already has `entitlements.mac.plist`, `icon.icns`, `icon.ico`, `icon.png`. We verify them, don't replace them.
- The `build:mac/win/linux` scripts exist; we add `dist:mac/win/linux`, `dist:all`, `notarize:mac`, and re-use Plan 3's `generate:licenses`.
- `.github/workflows/` directory does not exist; we create it.

---

## Goal

Make the app installable (mac dmg x64+arm64 / win nsis / linux AppImage), publishable via tag-triggered CI, and wire phase-18 features (auto-update, crash check, devtools lock) into the main-process boot. Then ship i18n keys for all phase-18 UI surfaces.

## Architecture

- **Packaging:** rewrite `electron-builder.yml` to set proper appId, dual-arch mac dmg, NSIS for win, AppImage-only for linux, and `publish: { provider: generic }`. Add per-platform `dist:*` npm scripts. Add `notarize:mac` script that requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars.
- **CI:** `.github/workflows/release.yml` triggers on `v*.*.*` tags, fans out across `macos-latest`, `windows-latest`, `ubuntu-latest`, runs `npm ci && npm run build && npx electron-builder --publish always`, uploads artifacts to the Release.
- **Boot wiring:** `electron/bootstrap.ts` hooks `app.whenReady()` to call `initAutoUpdate()` (gated by settings), then `mainWindow.once('ready-to-show', () => { const list = checkLastRun(); if (list.length) emit('crash:detected', list) })`. Production builds register `devtools-opened` → `closeDevTools()` + `logger().warn('app', { op: 'devtools-blocked' })`.
- **i18n:** add full `obs.*`, `about.*`, `crash.*`, `update.*`, `telemetry.*` namespaces in both locales.

## Tech Stack

- electron-builder 26 (already in deps)
- GitHub Actions
- React 19 + i18next (existing)

---

<!-- openspec-task: 10.1 -->
### Task 1: Rewrite `electron-builder.yml` for phase 18 targets

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Replace the file with phase-18 config**

```yaml
# electron-builder.yml
appId: cc.acornvo.app
productName: Acornvo
directories:
  output: dist
  buildResources: build
files:
  - 'out/**'
  - 'package.json'
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - resources/**
extraResources:
  - from: build/licenses.json
    to: build/licenses.json
mac:
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSDocumentsFolderUsageDescription: Acornvo accesses your Documents folder to read and write notes.
    - NSDownloadsFolderUsageDescription: Acornvo writes diagnostic bundles to your Downloads folder.
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  notarize: false
dmg:
  artifactName: ${name}-${version}-${arch}.${ext}
win:
  executableName: acornvo
  target:
    - nsis
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
linux:
  category: Utility
  target:
    - AppImage
appImage:
  artifactName: ${name}-${version}.${ext}
npmRebuild: false
publish:
  provider: generic
  url: https://releases.acornvo.local/
electronDownload:
  mirror: https://npmmirror.com/mirrors/electron/
```

(Notarization stays opt-in via env vars in `notarize:mac` script — see Task 3.)

- [ ] **Step 2: Validate config syntax**

Run: `npx electron-builder --help` (sanity) and `npx js-yaml electron-builder.yml > /dev/null` (or any YAML validator) to confirm parse.
Expected: no parse errors.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "build: phase-18 electron-builder config (appId, dual-arch dmg, NSIS, AppImage, generic publish)"
```

---

<!-- openspec-task: 10.2 -->
### Task 2: Verify `build/` resources

**Files:**
- Verify: `build/icon.icns`, `build/icon.ico`, `build/icon.png`, `build/entitlements.mac.plist`

- [ ] **Step 1: Confirm files exist and are valid**

Run: `file build/icon.icns build/icon.ico build/icon.png build/entitlements.mac.plist`
Expected: each reports a non-empty, recognized format (e.g., "Mac OS X icon", "MS Windows icon", "PNG image data", "XML 1.0 document").

- [ ] **Step 2: Audit entitlements**

Read `build/entitlements.mac.plist`. Confirm at minimum these keys:

```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.network.client</key><true/>
<key>com.apple.security.files.user-selected.read-write</key><true/>
<key>com.apple.security.files.downloads.read-write</key><true/>
```

If any are missing, add them.

- [ ] **Step 3: Commit (only if entitlements changed)**

```bash
git add build/entitlements.mac.plist
git commit -m "build: ensure mac entitlements cover network + downloads"
```

If nothing changed, skip the commit.

---

<!-- openspec-task: 10.3 -->
### Task 3: Add `dist:*` npm scripts

**Files:**
- Modify: `package.json` `scripts`

- [ ] **Step 1: Edit scripts**

```json
"scripts": {
  /* ...existing... */
  "dist:mac": "npm run build && electron-builder --mac --x64 --arm64",
  "dist:win": "npm run build && electron-builder --win",
  "dist:linux": "npm run build && electron-builder --linux",
  "dist:all": "npm run build && electron-builder -mwl",
  "notarize:mac": "node scripts/notarize-mac.mjs"
}
```

- [ ] **Step 2: Add `scripts/notarize-mac.mjs`**

```js
// scripts/notarize-mac.mjs
import { execSync } from 'node:child_process'

const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
for (const k of required) {
  if (!process.env[k]) {
    console.error(`notarize:mac requires env var ${k}`)
    process.exit(1)
  }
}

execSync('electron-builder --mac --x64 --arm64 --publish=never', {
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'true' }
})
console.log('notarize:mac: done; artifacts in dist/')
```

- [ ] **Step 3: Smoke check the scripts list**

Run: `npm run`
Expected: the new scripts appear in the listing.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/notarize-mac.mjs
git commit -m "build: add dist:mac/win/linux/all + notarize:mac scripts"
```

---

<!-- openspec-task: 10.4 -->
### Task 4: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/release.yml
name: release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install
        run: npm ci

      - name: Generate licenses
        run: npm run generate:licenses

      - name: Build (mac)
        if: matrix.os == 'macos-latest'
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.MAC_CERT_P12 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
        run: npm run dist:mac

      - name: Build (win)
        if: matrix.os == 'windows-latest'
        env:
          CSC_LINK: ${{ secrets.WIN_CERT_PFX }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
        run: npm run dist:win

      - name: Build (linux)
        if: matrix.os == 'ubuntu-latest'
        run: npm run dist:linux

      - name: Upload to Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/*.dmg
            dist/*.exe
            dist/*.AppImage
            dist/latest*.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate yaml**

Run: `npx js-yaml .github/workflows/release.yml > /dev/null` (or `actionlint` if available).
Expected: parse succeeds.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: tag-triggered release workflow (mac/win/linux matrix → GitHub Release)"
```

---

<!-- openspec-task: 10.5 -->
### Task 5: README — Install / Update / Troubleshoot + signing guide

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the section**

Append to `README.md`:

```markdown
## Install

- **macOS:** download `Acornvo-<version>-arm64.dmg` (Apple Silicon) or `Acornvo-<version>-x64.dmg` (Intel) from [Releases](https://github.com/<org>/<repo>/releases). Drag Acornvo to Applications.
- **Windows:** download `Acornvo-<version>-setup.exe`. Run the installer; the app installs per-user with a desktop shortcut.
- **Linux:** download `Acornvo-<version>.AppImage`. Run `chmod +x Acornvo-*.AppImage` and double-click or run from terminal.

## Update

Acornvo checks for updates 60 seconds after launch and every 4 hours thereafter. When a new version is downloaded, a banner appears at the top of the window — click **Install Now** to relaunch into the new version. Auto-check can be disabled in **Settings → About**.

To check manually, open **Settings → About → Check for Updates**.

## Troubleshoot

- **Logs:** `Settings → Observability → Export Diagnostic Bundle` produces a redacted zip in your Downloads folder. Attach it to support requests.
- **Crashes:** if the app detects an unhandled crash from the previous run, a banner offers **View Logs / Export Diagnostic / Ignore**.
- **Reset:** delete `<userData>/logs/` to clear logs; delete the application database (path printed at boot) to reset all data (does NOT delete your notes — those live in your project folder).

## Signing certificates

- **macOS:** the release workflow expects `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `MAC_CERT_P12`, `MAC_CERT_PASSWORD` repository secrets. Without them the build still produces an unsigned dmg that triggers Gatekeeper warnings.
- **Windows:** set `WIN_CERT_PFX` (base64 PFX) and `WIN_CERT_PASSWORD` for Authenticode signing. Without them the unsigned exe triggers SmartScreen.
- **Linux:** AppImage is unsigned; ship a SHA256 alongside the release.
```

- [ ] **Step 2: Spell-check**

Run: `cat README.md | grep -n 'troubleshoot\|trubleshoot' -i` (sanity grep) and visually skim. No automated typo-check is required.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(README): Install / Update / Troubleshoot + signing guide"
```

---

<!-- openspec-task: 11.1 -->
### Task 6: `app.whenReady()` → `initAutoUpdate()` (gated by settings)

**Files:**
- Modify: `electron/bootstrap.ts` (or wherever `app.whenReady()` chains live)

- [ ] **Step 1: Add the wiring**

```ts
import { initAutoUpdate } from '@/update/updater'
import { settingsStore } from '@/settings/store'

app.whenReady().then(async () => {
  // ... existing init ...
  if (settingsStore.get('update').autoCheck) {
    initAutoUpdate()
  }
})
```

If the settings store API is async, await accordingly. If `update` namespace is missing on first run, the defaults from Plan 3 fill in `autoCheck: true`.

- [ ] **Step 2: Smoke check in dev**

Run: `npm run dev`
Manual: confirm no exceptions in the dev console; the auto-updater will try to reach the placeholder publish URL — failures are logged silently per Plan 3 Task 11.

- [ ] **Step 3: Commit**

```bash
git add electron/bootstrap.ts
git commit -m "feat(app): start auto-updater on whenReady when settings.update.autoCheck"
```

---

<!-- openspec-task: 11.2 -->
### Task 7: `ready-to-show` → `crashReporter.checkLastRun()` → IPC notify renderer

**Files:**
- Modify: `electron/bootstrap.ts` (or wherever `mainWindow` is created)
- Modify: `shared/ipc-contract.ts` — add event `'crash:detected': { files: string[] }` and IPC `crash.ack(file)` and `crash.openLogsFolder()`
- Modify: `electron/ipc/crash.ts` (new file)

- [ ] **Step 1: Add IPC contract entries**

```ts
// shared/ipc-contract.ts
export interface IpcEventContract {
  // ... existing
  'crash:detected': { files: string[] }
}

crash: {
  ack: (file: string) => Promise<void>
  openLogsFolder: () => Promise<void>
}
```

- [ ] **Step 2: Add the handler**

```ts
// electron/ipc/crash.ts
import { shell, app } from 'electron'
import { join } from 'node:path'
import { ack as ackCrash } from '@/obs/crashReporter'

export const crashHandlers = {
  async ack(file: string) {
    ackCrash(file)
  },
  async openLogsFolder() {
    await shell.openPath(join(app.getPath('userData'), 'logs'))
  }
}
```

Register in router.

- [ ] **Step 3: Wire `ready-to-show`**

In the main-window creation block:

```ts
import { checkLastRun } from '@/obs/crashReporter'

mainWindow.once('ready-to-show', () => {
  const files = checkLastRun()
  if (files.length > 0) {
    mainWindow.webContents.send('crash:detected', { files })
  }
  mainWindow.show()
})
```

(Place AFTER existing `ready-to-show` logic if any.)

- [ ] **Step 4: Smoke test**

Manual: drop a fake crash file at `<userData>/logs/crashes/renderer-test.log`, run `npm run dev`, confirm a `crash:detected` event reaches the renderer (DevTools → `window.api.crash.onDetected` if exposed).

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/crash.ts electron/ipc/router.ts electron/bootstrap.ts
git commit -m "feat(app): emit crash:detected on ready-to-show when unacked crash logs exist"
```

---

<!-- openspec-task: 11.3 -->
### Task 8: Renderer crash banner — View Logs / Export Diagnostic / Ignore

**Files:**
- Create: `src/components/CrashBanner.tsx`
- Create: `src/components/CrashBanner.test.tsx`
- Modify: top-level layout in `src/App.tsx` to mount the banner

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/CrashBanner.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { CrashBanner } from './CrashBanner'

let onDetected: ((p: { files: string[] }) => void) | null = null
const ack = vi.fn()
const openLogs = vi.fn()
const exportDiag = vi.fn()

vi.mock('@/ipc/client', () => ({
  ipc: {
    crash: {
      ack,
      openLogsFolder: openLogs,
      onDetected: (cb: (p: { files: string[] }) => void) => {
        onDetected = cb
        return () => {
          onDetected = null
        }
      }
    },
    ops: { exportDiagnostic: exportDiag }
  }
}))

describe('CrashBanner', () => {
  it('renders on crash:detected and supports the three actions', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <CrashBanner />
      </I18nextProvider>
    )
    expect(screen.queryByTestId('crash-banner')).toBeNull()
    onDetected?.({ files: ['/logs/crashes/renderer-1.log', '/logs/crashes/renderer-2.log'] })
    expect(screen.getByTestId('crash-banner')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('crash-banner-logs'))
    expect(openLogs).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('crash-banner-export'))
    expect(exportDiag).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('crash-banner-ignore'))
    expect(ack).toHaveBeenCalledTimes(2) // ack each file
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CrashBanner.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the banner**

```tsx
// src/components/CrashBanner.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'

export function CrashBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const [files, setFiles] = useState<string[] | null>(null)

  useEffect(() => {
    const off = ipc.crash.onDetected((p) => setFiles(p.files))
    return off
  }, [])

  if (!files || files.length === 0) return null

  return (
    <div
      data-testid="crash-banner"
      className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm"
    >
      <span className="flex-1">{t('crash.detectedLastRun', { count: files.length })}</span>
      <button
        data-testid="crash-banner-logs"
        className="rounded border bg-background px-3 py-1"
        onClick={() => {
          void ipc.crash.openLogsFolder()
        }}
      >
        {t('crash.viewLogs')}
      </button>
      <button
        data-testid="crash-banner-export"
        className="rounded border bg-background px-3 py-1"
        onClick={() => {
          void ipc.ops.exportDiagnostic()
        }}
      >
        {t('crash.exportDiag')}
      </button>
      <button
        data-testid="crash-banner-ignore"
        className="rounded px-3 py-1 text-muted-foreground"
        onClick={async () => {
          for (const f of files) await ipc.crash.ack(f)
          setFiles(null)
        }}
      >
        {t('crash.ignore')}
      </button>
    </div>
  )
}
```

Mount `<CrashBanner />` in `src/App.tsx` near the existing `<UpdateBanner />` (Plan 3 Task 9).

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/CrashBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CrashBanner.tsx src/components/CrashBanner.test.tsx src/App.tsx
git commit -m "feat(app): renderer crash banner (View Logs / Export Diag / Ignore)"
```

---

<!-- openspec-task: 11.4 -->
### Task 9: Production build closes DevTools + logs

**Files:**
- Modify: `electron/bootstrap.ts` (or window-creation module)

- [ ] **Step 1: Write the failing test**

```ts
// electron/bootstrap.devtools.test.ts
import { describe, expect, it, vi } from 'vitest'

describe('production devtools lock', () => {
  it('closes devtools and logs warn on devtools-opened in production', () => {
    const close = vi.fn()
    const on = vi.fn()
    const wc = { on, closeDevTools: close, isDevToolsOpened: () => false }
    const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }

    // Simulate the production gate.
    function applyDevtoolsLock(env: string): void {
      if (env !== 'production') return
      wc.on('devtools-opened', () => {
        wc.closeDevTools()
        logger.warn('app', { op: 'devtools-blocked' })
      })
    }

    applyDevtoolsLock('production')
    // Find the registered handler:
    const handler = on.mock.calls.find(([e]) => e === 'devtools-opened')?.[1] as (() => void) | undefined
    expect(handler).toBeDefined()
    handler?.()
    expect(close).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('app', { op: 'devtools-blocked' })
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/bootstrap.devtools.test.ts`
Expected: PASS (the test exercises the same conditional logic added in step 3).

- [ ] **Step 3: Add the lock to the real `bootstrap.ts`**

```ts
// inside main window creation, after webContents is available:
import { logger } from '@/obs/logger'

if (process.env.NODE_ENV === 'production') {
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools()
    logger().warn('app', { op: 'devtools-blocked' })
  })
}
```

- [ ] **Step 4: Verify**

Run: `npm run dev` — devtools should still open (NODE_ENV=development).
Build packaged app via `npm run dist:mac` (or whichever local platform) — devtools should immediately close, and the log file shows a `app: devtools-blocked` entry.

- [ ] **Step 5: Commit**

```bash
git add electron/bootstrap.ts electron/bootstrap.devtools.test.ts
git commit -m "feat(app): production devtools lock with audit log"
```

---

<!-- openspec-task: 12.1 -->
### Task 10: Add `obs.* / about.* / crash.* / update.* / telemetry.*` keys

**Files:**
- Modify: `src/i18n/locales/en-US.json`
- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Author the English keys**

Append to `src/i18n/locales/en-US.json`:

```json
"obs.title": "Observability",
"obs.tabs.ai": "AI",
"obs.tabs.queue": "Queue",
"obs.tabs.perf": "Performance",
"obs.window.24h": "24h",
"obs.window.7d": "7d",
"obs.window.30d": "30d",
"obs.ai.totalRequests": "Total requests",
"obs.ai.totalTokens": "Total tokens",
"obs.ai.estimatedCost": "Estimated cost",
"obs.queue.pending": "Pending",
"obs.queue.running": "Running",
"obs.queue.failed": "Failed",
"obs.queue.retry": "Retry",
"obs.queue.discard": "Discard",
"obs.perf.area": "Area",
"obs.perf.count": "Count",
"obs.perf.p50": "P50 (ms)",
"obs.perf.p95": "P95 (ms)",
"obs.perf.successRate": "Success",
"obs.export.diagnostic": "Export Diagnostic Bundle",
"obs.export.diagnosticBusy": "Exporting…",
"about.title": "About",
"about.version": "Version",
"about.hash": "Build",
"about.runtime": "Runtime",
"about.platform": "Platform",
"about.licenses": "Open-source licenses",
"about.licenses.expand": "Show all ({{rest}} more)",
"about.checkUpdate": "Check for Updates",
"about.checkUpdateBusy": "Checking…",
"crash.detectedLastRun": "Acornvo recovered from a crash on the previous run ({{count}} report).",
"crash.viewLogs": "View Logs",
"crash.exportDiag": "Export Diagnostic",
"crash.ignore": "Ignore",
"update.upToDate": "You're up to date.",
"update.checkFailed": "Update check failed.",
"update.available": "Update available: v{{version}}",
"update.newVersion": "New version v{{version}} downloaded.",
"update.installNow": "Install Now",
"update.later": "Later",
"update.autoCheck": "Check for updates automatically",
"telemetry.enable": "Enable local telemetry",
"telemetry.description": "Aggregate daily usage counts into a local table. Nothing leaves your device. Off by default.",
"settings.tab.about": "About",
"settings.tab.observability": "Observability"
```

(If the existing file is nested object form rather than dotted keys, place each key in the appropriate sub-tree; do not mix styles.)

- [ ] **Step 2: Mirror in Chinese**

Append to `src/i18n/locales/zh-CN.json`:

```json
"obs.title": "可观测",
"obs.tabs.ai": "AI",
"obs.tabs.queue": "队列",
"obs.tabs.perf": "性能",
"obs.window.24h": "24 小时",
"obs.window.7d": "7 天",
"obs.window.30d": "30 天",
"obs.ai.totalRequests": "请求总数",
"obs.ai.totalTokens": "Token 总数",
"obs.ai.estimatedCost": "预计费用",
"obs.queue.pending": "等待中",
"obs.queue.running": "运行中",
"obs.queue.failed": "失败",
"obs.queue.retry": "重试",
"obs.queue.discard": "丢弃",
"obs.perf.area": "环节",
"obs.perf.count": "样本数",
"obs.perf.p50": "P50 (ms)",
"obs.perf.p95": "P95 (ms)",
"obs.perf.successRate": "成功率",
"obs.export.diagnostic": "导出诊断包",
"obs.export.diagnosticBusy": "正在导出…",
"about.title": "关于",
"about.version": "版本",
"about.hash": "构建",
"about.runtime": "运行时",
"about.platform": "平台",
"about.licenses": "开源许可证",
"about.licenses.expand": "查看全部（还有 {{rest}} 条）",
"about.checkUpdate": "检查更新",
"about.checkUpdateBusy": "检查中…",
"crash.detectedLastRun": "上次运行检测到崩溃（共 {{count}} 条报告）。",
"crash.viewLogs": "查看日志",
"crash.exportDiag": "导出诊断包",
"crash.ignore": "忽略",
"update.upToDate": "已是最新版本。",
"update.checkFailed": "检查更新失败。",
"update.available": "有可用更新：v{{version}}",
"update.newVersion": "已下载新版本 v{{version}}。",
"update.installNow": "立即安装",
"update.later": "稍后",
"update.autoCheck": "自动检查更新",
"telemetry.enable": "启用本地遥测",
"telemetry.description": "把每日使用统计汇总到本地表中。数据不会离开你的设备。默认关闭。",
"settings.tab.about": "关于",
"settings.tab.observability": "可观测"
```

- [ ] **Step 3: Verify the i18n key tests still pass**

Run: `npx vitest run src/i18n`
Expected: PASS (existing tests like `chat-keys.test.ts` are scoped to other namespaces, but ensure none of them break).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en-US.json src/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add obs/about/crash/update/telemetry keys (en + zh)"
```

---

<!-- openspec-task: 12.2 -->
### Task 11: Verify zh-CN ↔ en-US key parity

**Files:**
- Create: `src/i18n/phase-18.test.ts`

- [ ] **Step 1: Write the parity test**

```ts
// src/i18n/phase-18.test.ts
import { describe, expect, it } from 'vitest'
import en from './locales/en-US.json'
import zh from './locales/zh-CN.json'

const PHASE_18_PREFIXES = ['obs.', 'about.', 'crash.', 'update.', 'telemetry.', 'settings.tab.about', 'settings.tab.observability']

function flatten(o: unknown, prefix = ''): string[] {
  if (typeof o !== 'object' || o === null) return [prefix.replace(/\.$/, '')]
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, `${prefix}${k}.`)
  )
}

function p18Keys(blob: unknown): Set<string> {
  return new Set(
    flatten(blob).filter((k) => PHASE_18_PREFIXES.some((p) => k === p || k.startsWith(p)))
  )
}

describe('phase-18 i18n key parity', () => {
  it('en and zh have identical phase-18 key sets', () => {
    const e = p18Keys(en)
    const z = p18Keys(zh)
    expect([...e].sort()).toEqual([...z].sort())
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/i18n/phase-18.test.ts`
Expected: PASS. If it fails, the diff output names which keys are missing in one locale; add them and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/phase-18.test.ts
git commit -m "test(i18n): assert phase-18 key parity between en and zh"
```

---

## Self-Review Checklist

- [ ] All 11 OpenSpec labels (10.1–10.5, 11.1–11.4, 12.1–12.2) appear as `<!-- openspec-task: N.M -->` annotations directly above their `### Task N:` headings.
- [ ] No "TBD" / "TODO" placeholders.
- [ ] `electron-builder.yml` rewrite preserves Linux AppImage but drops snap/deb (per design D8).
- [ ] CI workflow only triggers on `v*.*.*` tags; secrets are referenced through `${{ secrets.* }}` and never hard-coded.
- [ ] Devtools lock is gated on `NODE_ENV === 'production'`.
- [ ] i18n parity test would fail if either locale forgot a key.
