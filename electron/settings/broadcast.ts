// electron/settings/broadcast.ts
import { webContents } from 'electron'
import { logger } from '../services/logger'
import { settingsStore } from './store'

const CHANNEL = 'settings:changed'

export function installSettingsBroadcaster(): () => void {
  return settingsStore.onChange(({ ns, key, newValue }) => {
    const payload = { ns, key, newValue }
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue
      try {
        wc.send(CHANNEL, payload)
      } catch (err) {
        logger.warn('settings:changed send failed', {
          id: wc.id,
          message: err instanceof Error ? err.message : String(err)
        })
      }
    }
  })
}
