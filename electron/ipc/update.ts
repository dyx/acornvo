import { autoUpdater } from 'electron-updater'
import { checkForUpdatesManual } from '../update/updater'

export const updateHandlers = {
  async checkManual() {
    return checkForUpdatesManual()
  },
  async installNow() {
    autoUpdater.quitAndInstall()
  }
}
