// electron/window/title-bar-theme.ts
import { nativeTheme } from 'electron'

// MUST stay in sync with --color-paper-2 (background) and --color-ink-2 (symbol)
// in src/index.css. If the design tokens change there, update these hex values.
// Source oklch values (2026-05-17):
//   light: paper-2 = oklch(0.955 0.015 82)  ink-2 = oklch(0.4 0.015 62)
//   dark:  paper-2 = oklch(0.22 0.018 60)   ink-2 = oklch(0.78 0.008 70)
export const OVERLAY_LIGHT = {
  color: '#f0eadc',
  symbolColor: '#5a534a',
  height: 28
} as const

export const OVERLAY_DARK = {
  color: '#322d27',
  symbolColor: '#bfb5a9',
  height: 28
} as const

export function getOverlayForTheme(): typeof OVERLAY_LIGHT | typeof OVERLAY_DARK {
  return nativeTheme.shouldUseDarkColors ? OVERLAY_DARK : OVERLAY_LIGHT
}
