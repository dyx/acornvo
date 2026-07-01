import { webContents } from 'electron'
import type { GroveSummary } from '@shared/grove'
import { onChange } from './grove'
import { logger } from '../obs/logger'
import { sendEvent } from '../ipc/events'

const CHANNEL = 'project:changed'

/**
 * Subscribe to grove.onChange and fan out to every live `webContents`.
 * Returns an unsubscribe; call it at app shutdown.
 */
export function installGroveBroadcaster(): () => void {
  return onChange((payload: GroveSummary | null) => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue
      try {
        sendEvent(wc, CHANNEL, payload)
      } catch (err) {
        logger().warn('grove', {
          msg: 'project:changed send failed',
          meta: { id: wc.id, message: err instanceof Error ? err.message : String(err) }
        })
      }
    }
  })
}
