// electron/settings/provider-key.ts
import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'
import { logger } from '../obs/logger'

export function getProviderDecryptedKey(providerId: string): string | null {
  const db = getGlobalDb()
  const row = db
    .prepare('SELECT api_key_ref FROM ai_provider WHERE id = ?')
    .get(providerId) as { api_key_ref: string | null } | undefined
  if (!row) {
    logger().warn('settings', { msg: '[getProviderDecryptedKey] provider row not found', meta: { providerId } })
    return null
  }
  if (!row.api_key_ref) {
    logger().debug('settings', { msg: '[getProviderDecryptedKey] no api_key_ref set', meta: { providerId } })
    return null
  }
  try {
    const key = secretsStore.get(row.api_key_ref)
    const hasKey = key != null && key.length > 0
    if (!hasKey) {
      logger().warn('settings', {
        msg: '[getProviderDecryptedKey] keychain returned empty/null for ref',
        meta: { providerId, ref: row.api_key_ref }
      })
    }
    return key
  } catch (err) {
    logger().error('settings', {
      msg: '[getProviderDecryptedKey] keychain decryption failed',
      meta: { providerId, ref: row.api_key_ref, error: (err as Error)?.message?.slice(0, 300) }
    })
    return null
  }
}
