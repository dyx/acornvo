import { app } from 'electron'
import { getBootstrapResult } from '../bootstrap'

declare const __GIT_HASH__: string | undefined

export const appHandlers = {
  async runtimeInfo() {
    return {
      appVersion: app.getVersion(),
      gitHash: typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev',
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      platform: process.platform,
      arch: process.arch
    }
  },
  getBootstrap() {
    return getBootstrapResult()
  }
}
