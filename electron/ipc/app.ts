import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getBootstrapResult } from '../bootstrap'

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
