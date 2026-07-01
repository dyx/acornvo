// electron/settings/broadcast.ts
import { webContents } from 'electron'
import { logger } from '../obs/logger'
import { settingsStore } from './store'
import { sendEvent } from '../ipc/events'

const CHANNEL = 'settings:changed'

export function installSettingsBroadcaster(): () => void {
  return settingsStore.onChange(({ ns, key, newValue }) => {
    const payload = { ns, key, newValue }
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue
      try {
        sendEvent(wc, CHANNEL, payload)
      } catch (err) {
        logger().warn('settings', {
          msg: 'settings:changed send failed',
          meta: { id: wc.id, message: err instanceof Error ? err.message : String(err) }
        })
      }
    }
  })
}
