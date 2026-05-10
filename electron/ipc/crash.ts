import { shell, app } from 'electron'
import { join } from 'node:path'
import { ack as ackCrash } from '../obs/crashReporter'

export const crashHandlers = {
  async ack(file: string) { ackCrash(file) },
  async openLogsFolder() { await shell.openPath(join(app.getPath('userData'), 'logs')) }
}
