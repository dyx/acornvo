// electron/window/title-bar-theme.ts
import { nativeTheme } from 'electron'

// MUST stay in sync with --color-paper-3 (background) and --color-ink-3 (symbol)
// in src/index.css to match the bottom status bar.
// Source oklch values:
//   light: paper-3 = oklch(0.935 0.018 80)  ink-3 = oklch(0.48 0.018 65)
//   dark:  paper-3 = oklch(0.28 0.02 60)    ink-3 = oklch(0.68 0.01 70)
export const OVERLAY_LIGHT = {
  color: '#f0e9df',
  symbolColor: '#80776a',
  height: 28
} as const

export const OVERLAY_DARK = {
  color: '#4d4a46',
  symbolColor: '#b1a99e',
  height: 28
} as const

export function getOverlayForTheme(): typeof OVERLAY_LIGHT | typeof OVERLAY_DARK {
  return nativeTheme.shouldUseDarkColors ? OVERLAY_DARK : OVERLAY_LIGHT
}
