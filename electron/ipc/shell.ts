import { shell } from 'electron'

const ALLOWED = /^https?:\/\//

export const shellHandlers = {
  async openExternal(url: string) {
    if (!ALLOWED.test(url)) throw new Error('shell.openExternal: only http(s) urls allowed')
    await shell.openExternal(url)
  }
}
