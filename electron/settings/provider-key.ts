// electron/settings/provider-key.ts
import { getGlobalDb } from '../services/global-db'
import { deobfuscate } from './obfuscate'
import { logger } from '../obs/logger'

export function getProviderApiKey(providerId: string): string | null {
  const db = getGlobalDb()
  const row = db.prepare('SELECT api_key FROM ai_provider WHERE id = ?').get(providerId) as
    | { api_key: string | null }
    | undefined
  if (!row) {
    logger().warn('settings', {
      msg: '[getProviderApiKey] provider row not found',
      meta: { providerId }
    })
    return null
  }
  if (!row.api_key) {
    logger().debug('settings', { msg: '[getProviderApiKey] no api_key set', meta: { providerId } })
    return null
  }

  const key = deobfuscate(row.api_key)
  const hasKey = key != null && key.length > 0
  if (!hasKey) {
    logger().warn('settings', {
      msg: '[getProviderApiKey] deobfuscation returned empty/null',
      meta: { providerId }
    })
  }
  return key
}
