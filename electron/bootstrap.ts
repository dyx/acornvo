import { existsSync } from 'node:fs'
import type { IpcEventContract } from '@shared/ipc-contract'
import * as recent from './services/recent'
import * as grove from './services/grove'
import { logger } from './services/logger'

export type BootstrapResult = IpcEventContract['bootstrap:ready']

const TIMEOUT_MS = 2000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('bootstrap timeout')), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err) => {
        clearTimeout(t)
        reject(err)
      }
    )
  })
}

async function decide(): Promise<BootstrapResult> {
  const file = await recent.load()
  const items = file.items.map((item) => ({
    ...item,
    valid: existsSync(item.path)
  }))

  const firstValid = items.find((i) => i.valid) ?? null
  if (!firstValid) {
    return { initialRoute: '/picker', recent: items }
  }

  const outcome = await grove.openGrove(firstValid.path)
  if (outcome.status === 'opened') {
    return { initialRoute: '/library', recent: items }
  }
  // Locked → Picker with the first item flagged.
  return {
    initialRoute: '/picker',
    recent: items,
    locked: { path: firstValid.path, holder: outcome.holder }
  }
}

export async function runBootstrap(): Promise<BootstrapResult> {
  try {
    return await withTimeout(decide(), TIMEOUT_MS)
  } catch (err) {
    logger.warn('bootstrap fell back to Picker', {
      message: err instanceof Error ? err.message : String(err)
    })
    try {
      const file = await recent.load()
      const items = file.items.map((item) => ({
        ...item,
        valid: existsSync(item.path)
      }))
      return { initialRoute: '/picker', recent: items }
    } catch {
      return { initialRoute: '/picker', recent: [] }
    }
  }
}
