import type { WebContents } from 'electron'
import type { IpcEventChannel, IpcEventContract } from '@shared/ipc-contract'

/**
 * Strongly typed helper for sending IPC events from main to renderer.
 */
export function sendEvent<K extends IpcEventChannel>(
  wc: WebContents,
  channel: K,
  ...args: IpcEventContract[K] extends void ? [payload?: undefined] : [payload: IpcEventContract[K]]
): void {
  const payload = args[0]
  if (!wc.isDestroyed()) {
    wc.send(channel, payload)
  }
}
