import { nativeTheme } from 'electron'
import { mainWindow } from '../main'
import { OVERLAY_DARK, OVERLAY_LIGHT } from '../window/title-bar-theme'

export const windowHandlers = {
  async themeApplied(effective: 'light' | 'dark') {
    nativeTheme.themeSource = effective
    if (process.platform !== 'win32') return
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setTitleBarOverlay(effective === 'dark' ? OVERLAY_DARK : OVERLAY_LIGHT)
  }
}
