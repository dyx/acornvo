import { nativeTheme } from 'electron'
import { mainWindow } from '../main'
import { OVERLAY_DARK, OVERLAY_LIGHT } from '../window/title-bar-theme'

export const windowHandlers = {
  async themeApplied(theme: 'light' | 'dark' | 'system') {
    nativeTheme.themeSource = theme
    if (process.platform !== 'win32') return
    if (!mainWindow || mainWindow.isDestroyed()) return
    const effective =
      theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme
    mainWindow.setTitleBarOverlay(effective === 'dark' ? OVERLAY_DARK : OVERLAY_LIGHT)
  }
}
