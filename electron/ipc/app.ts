import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  }
}

export const licensesHandlers = {
  async read() {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'build/licenses.json')
      : join(process.cwd(), 'build/licenses.json')
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as {
        id: string
        license: string
        repository: string | null
        publisher: string | null
      }[]
    } catch {
      return []
    }
  }
}
