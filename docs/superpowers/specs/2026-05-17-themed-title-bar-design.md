# Themed Title Bar with Grove Switcher — Design

**Date:** 2026-05-17
**Author:** dyx
**Status:** Approved, ready for implementation plan

## Problem

The app currently renders two stacked title bars on macOS: the OS-native bar (showing "Acornvo") and a custom `TitleBar.tsx` (38px, showing a dynamic title from `useTitleStore`). The custom bar duplicates the native one and on most pages displays a meaningless string like `果仓 · —` because no caller writes the title. The window is configured with default OS framing (no `titleBarStyle` / `frame` overrides in `electron/main.ts`), so the custom bar adds visual noise without contributing function — it doesn't replace the OS bar, just coexists with it.

Separately, the existing `GroveSwitcher` component is fully implemented but never imported or rendered anywhere. Switching the active grove currently requires navigating to `/picker` via the 🌰 button in `AppRail`.

## Goal

Replace the redundant `TitleBar` with a single themed title bar that:

1. Hides the OS-native bar via Electron's `titleBarStyle: 'hiddenInset'` (Mac) and `titleBarOverlay` (Win), so the window has one bar styled in the app's warm paper/ink palette.
2. Hosts the unused `GroveSwitcher` as its only widget, turning grove switching from a multi-step (`AppRail → /picker → select`) flow into a one-click dropdown reachable from any page.
3. Keeps the `AppRail` 🌰 button as a passive status indicator whose background tints to match the active grove's color (still navigates to `/picker` for full management).

Out of scope: refactoring `EditorTitleBar`, fixing the pre-existing `theme: 'system'` matchMedia gap in `settings-effects.ts`, Linux fallback window controls.

## Architecture

```
┌─ Electron main process (electron/main.ts) ──────────────┐
│  BrowserWindow:                                          │
│    titleBarStyle: 'hiddenInset'      // Mac              │
│    titleBarOverlay: {                // Win (not on Mac/ │
│      color: paper-2 hex,             //   Linux)         │
│      symbolColor: ink-2 hex,                             │
│      height: 28                                          │
│    }                                                     │
│  + nativeTheme.on('updated') → setTitleBarOverlay()      │
│  + ipcMain.on('window:themeApplied') → setTitleBarOverlay│
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─ Renderer (src/App.tsx) ─────────────────────────────────┐
│   <TitleBar />          ← 28px, drag region, centered    │
│     └─ <GroveSwitcher /> ← no-drag, flat, hover bg       │
│   <CrashBanner /> <UpdateBanner />                       │
│   <AppRail />  <main><Outlet /></main>                   │
│   <StatusBar />                                          │
└──────────────────────────────────────────────────────────┘
```

### Cross-platform behavior

| Platform | Native bar | Custom paint | Min/Max/Close |
|---|---|---|---|
| macOS | hidden via `hiddenInset` | full | inset traffic lights (OS-drawn) |
| Windows | hidden via `titleBarOverlay` | full | Win 10/11 overlay (OS-drawn, themed) |
| Linux | not hidden (no overlay support) | full | WM gestures (right-click / double-click) |

Linux gets no native window controls inside our bar. This is an accepted compromise per the "smallest scope" principle agreed during design. Linux users use window-manager gestures.

## Components

### `src/components/TitleBar.tsx` (rewritten)

```tsx
import type { JSX } from 'react'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  return (
    <header
      className="relative flex h-7 shrink-0 items-center justify-center
                 bg-[color:var(--color-paper-2)]
                 border-b border-[color:var(--color-line)]
                 [-webkit-app-region:drag]"
      data-testid="titlebar"
    >
      <GroveSwitcher />
    </header>
  )
}
```

**Removed from current implementation:**
- `useTitleStore` dependency
- `useLocation` / `borderless on /picker` branch
- Traffic-light placeholder (`pl-[60px]`) — `hiddenInset` handles spacing
- Centered dynamic title text
- Right-side empty slot
- `useTranslation` (no text rendered here anymore)

Height: `h-7` (28px). Centered layout (matches user preference). Drag region covers the whole bar; `GroveSwitcher`'s trigger sets `[-webkit-app-region:no-drag]` so clicks reach it.

### `src/components/GroveSwitcher.tsx` (rewritten — compact title-bar variant)

Trigger button changes (dropdown content unchanged):

```tsx
<DropdownMenuTrigger asChild>
  <button
    type="button"
    aria-label={t('switcher.ariaLabel')}
    className="[-webkit-app-region:no-drag]
               inline-flex items-center gap-1.5
               h-6 px-2 rounded
               text-[12.5px] text-[color:var(--color-ink)]
               hover:bg-[color:var(--color-paper-3)]
               transition-colors"
  >
    {current ? (
      <>
        <span className="h-2 w-2 rounded-[2px]"
              style={{ background: dotColor[current.color] }} />
        <span className="font-serif">{current.name}</span>
      </>
    ) : (
      <span className="text-[color:var(--color-ink-3)]">
        {t('switcher.selectGrove')}
      </span>
    )}
    <ChevronDown className="h-3 w-3 text-[color:var(--color-ink-3)]" />
  </button>
</DropdownMenuTrigger>
```

**Changes from current implementation:**
- Remove `border` + `bg-[color:var(--color-paper)]` + `px-2.5 py-1` (button-like styling)
- Add `h-6 px-2` + hover-only background (flat, breathing-room in title bar)
- Font size `14 → 12.5`, color dot `10×10 → 8×8 px` with `rounded-[2px]`
- `font-serif` applied only to the name (preserves brand feel)
- **Delete** `if (location.pathname === '/picker') return null` — switcher now renders on `/picker` too, showing the "select grove" placeholder when `current === null`
- Add `[-webkit-app-region:no-drag]` to the trigger button so the drag region above doesn't eat clicks
- Dropdown content (recent 5, separator, + new, 📂 open) is unchanged

### `src/components/AppRail.tsx` (minor change)

Tint the 🌰 button background with the active grove's color at ~20% alpha:

```tsx
<button
  onClick={() => navigate('/picker')}
  title={current ? `${current.name} — 切换果仓` : '切换果仓'}
  className="mb-3 flex h-11 w-11 ... rounded-xl border ..."
  style={current ? { background: `${dotColor[current.color]}33` } : undefined}
>
  <span className="text-[24px]">🌰</span>
</button>
```

`dotColor` (the `Record<GroveColor, string>` currently defined inside `GroveSwitcher.tsx`) becomes a named export from the same file; `AppRail.tsx` imports it. The grove color tokens (`--color-acorn`, `--color-leaf`, `--color-berry`, `--color-sky`) are oklch in `index.css`, so hex-suffix `'33'` does not work directly. Use `color-mix(in oklch, var(--color-acorn) 20%, transparent)` (and equivalents per color) instead. Design intent: subtle warm tint, ~20% alpha.

### Removed files / call sites

| File | Action |
|---|---|
| `src/stores/title.ts` | Delete file entirely |
| `src/pages/Library.tsx` | Remove `useTitleStore` import + `setTitle` effect (lines ~14, 16-18) |
| `src/components/history/HistoryLayout.tsx` | Remove `useTitleStore` import + `setTitle` effect (lines ~10, 28, 32-36) |

## Electron main process

### `electron/main.ts`

Add theme-aware overlay configuration in `createMainWindow()`:

```ts
import { app, BrowserWindow, nativeTheme, powerMonitor } from 'electron'

// Sync with --color-paper-2 / --color-ink-2 in src/index.css.
// If those tokens change, update these constants too.
const OVERLAY_LIGHT = { color: '#f0eadc', symbolColor: '#5a534a', height: 28 }
const OVERLAY_DARK  = { color: '#322d27', symbolColor: '#bfb5a9', height: 28 }

function getOverlayForTheme(): Electron.TitleBarOverlay {
  return nativeTheme.shouldUseDarkColors ? OVERLAY_DARK : OVERLAY_LIGHT
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    center: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'win32'
      ? { titleBarOverlay: getOverlayForTheme() }
      : {}),
    webPreferences: { /* unchanged */ }
  })

  const onThemeChanged = (): void => {
    if (process.platform === 'win32' && !win.isDestroyed()) {
      win.setTitleBarOverlay(getOverlayForTheme())
    }
  }
  nativeTheme.on('updated', onThemeChanged)
  win.on('closed', () => nativeTheme.off('updated', onThemeChanged))

  // ... existing ready-to-show, close, installExternalLinkGuards
  return win
}
```

Hex constants are intentionally hardcoded because `titleBarOverlay` does not accept CSS variables. They MUST be kept in sync with `--color-paper-2` and `--color-ink-2` in `src/index.css`. The comment above them documents this contract; if a future change drifts the values, the title bar overlay on Windows will visually mismatch the rest of the chrome.

The oklch values currently defined are:
- Light: `--color-paper-2: oklch(0.955 0.015 82)`, `--color-ink-2: oklch(0.4 0.015 62)`
- Dark: `--color-paper-2: oklch(0.22 0.018 60)`, `--color-ink-2: oklch(0.78 0.008 70)`

Hex equivalents above are approximate (oklch → sRGB conversion). Implementer should verify with a color tool before committing.

## Theme sync (renderer → main)

The renderer drives the effective theme via `data-theme` in `src/stores/settings-effects.ts:applyTheme()`. We add an IPC notification at the end of that function so the main process can update Windows' `titleBarOverlay` colors when the user changes themes in Settings.

### New IPC contract

In `shared/ipc-contract.ts`:

```ts
// renderer → main, one-way notification
'window:themeApplied': (effective: 'light' | 'dark') => void
```

### Renderer side (`src/stores/settings-effects.ts`)

```ts
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.dataset.theme = effective
  ipc.window.themeApplied(effective)   // new
}
```

### Main side (`electron/ipc/handlers.ts` or appropriate handler module)

```ts
ipcMain.on('window:themeApplied', (_evt, effective: 'light' | 'dark') => {
  if (process.platform !== 'win32') return
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  win.setTitleBarOverlay(effective === 'dark' ? OVERLAY_DARK : OVERLAY_LIGHT)
})
```

### Preload (`src/ipc/client.ts` and its preload counterpart)

Expose a `window.themeApplied(effective)` method. Exact shape follows the existing client conventions in `src/ipc/client.ts`.

### Pre-existing bug (out of scope)

`settings-effects.ts` does not listen to `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)`, so when `theme: 'system'` is selected and the OS toggles dark mode, the renderer's `data-theme` does not update. The main-side `nativeTheme.on('updated')` handler in this design will correctly update the Windows overlay, but the renderer's CSS variables remain on whatever value was applied at load time. This bug exists today and is independent of the title bar work. Recommend filing a separate issue.

## i18n

Add `switcher.selectGrove` key in `src/i18n/` for `zh-CN` and `en-US`:
- zh: `选择果仓`
- en: `Select grove`

## Testing

### Unit / integration

**Rewrite** `src/components/TitleBar.test.tsx`:
- Renders `<TitleBar />` with `<GroveSwitcher />` as a child
- Header element has `[-webkit-app-region:drag]` in its className
- No dependency on `useTitleStore` (the import shouldn't exist)

**Add** `src/components/GroveSwitcher.test.tsx`:
- When `current === null`, displays "选择果仓" placeholder
- Dropdown trigger has `[-webkit-app-region:no-drag]`
- Lists up to 5 recent groves and dispatches `switchTo()` on click
- Shows "+ 新建" and "📂 打开" items
- Renders on `/picker` route (regression — previously hid)

**Remove / update**:
- Any acceptance test asserting on the old `TitleBar` title-text content (likely in `tests/acceptance/phase-10/history-integration.test.tsx`)
- Any test importing `useTitleStore`

### Manual acceptance (Electron)

After running the app:
- Mac: traffic lights present, switcher centered, full bar drags the window
- Mac: open Settings → toggle light/dark → bar background updates immediately
- Win: native min/max/close buttons appear top-right in app's paper color
- Switcher renders on Library, Browser, Chat, Editor, and Picker
- Clicking switcher shows recent groves; selecting one navigates to `/library`
- `AppRail` 🌰 button tints with active grove's color

## Implementation Phases

For the plan-writing step, suggested sequencing:

1. Electron main: add `titleBarStyle` + `titleBarOverlay` + `nativeTheme` handler. App launches with hidden native bar but the current 38px TitleBar still on top — verify red/yellow/green inset position.
2. Rewrite `TitleBar.tsx` to 28px + center `<GroveSwitcher />`. Remove `useTitleStore` import.
3. Rewrite `GroveSwitcher.tsx` trigger to compact flat style. Add `selectGrove` i18n key. Drop the `/picker` early-return.
4. Add IPC contract + preload + handler + `settings-effects` send. Test theme toggle live.
5. Tint AppRail 🌰 button via inline `style.background`.
6. Delete `src/stores/title.ts`; remove `setTitle` call sites in `Library.tsx` and `HistoryLayout.tsx`. Update / delete affected tests.
7. Verify on Mac (primary); smoke-test on Win if available.
