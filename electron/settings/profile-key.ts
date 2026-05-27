// electron/settings/profile-key.ts
import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'
import { logger } from '../obs/logger'

/**
 * Returns the decrypted API key for a profile, or null if the profile has
 * no key (e.g. a local Ollama profile) or doesn't exist.
 *
 * MAIN-PROCESS ONLY. This function MUST NOT be re-exported through any
 * preload contextBridge or IPC handler. Phase 15 (reviewer) and phase 16
 * (chat agent) will call it directly when constructing LLM requests in main.
 */
export function getProfileDecryptedKey(profileId: string): string | null {
  const db = getGlobalDb()
  const row = db
    .prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id = ?')
    .get(profileId) as { api_key_ref: string | null } | undefined
  if (!row) {
    logger().warn('settings', { msg: '[getProfileDecryptedKey] profile row not found', meta: { profileId } })
    return null
  }
  if (!row.api_key_ref) {
    logger().debug('settings', { msg: '[getProfileDecryptedKey] no api_key_ref set (e.g. Ollama)', meta: { profileId } })
    return null
  }
  try {
    const key = secretsStore.get(row.api_key_ref)
    const hasKey = key != null && key.length > 0
    logger().debug('settings', {
      msg: '[getProfileDecryptedKey] decrypted',
      meta: { profileId, ref: row.api_key_ref, hasKey, keyLen: key?.length ?? 0 }
    })
    if (!hasKey) {
      logger().warn('settings', {
        msg: '[getProfileDecryptedKey] keychain returned empty/null for ref',
        meta: { profileId, ref: row.api_key_ref }
      })
    }
    return key
  } catch (err) {
    logger().error('settings', {
      msg: '[getProfileDecryptedKey] keychain decryption failed',
      meta: { profileId, ref: row.api_key_ref, error: (err as Error)?.message?.slice(0, 300) }
    })
    return null
  }
}
