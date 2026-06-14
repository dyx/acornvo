import { shell } from 'electron'
import { ack as ackCrash } from '../obs/crashReporter'
import { getLogDir } from '../obs/logger'

export const crashHandlers = {
  async ack(file: string) {
    ackCrash(file)
  },
  async openLogsFolder() {
    await shell.openPath(getLogDir())
  }
}
