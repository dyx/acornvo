// electron/settings/profile-key.ts
import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'
import { logger } from '../services/logger'

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
    logger.warn('[getProfileDecryptedKey] profile row not found', { profileId })
    return null
  }
  if (!row.api_key_ref) {
    logger.debug('[getProfileDecryptedKey] no api_key_ref set (e.g. Ollama)', { profileId })
    return null
  }
  try {
    const key = secretsStore.get(row.api_key_ref)
    const hasKey = key != null && key.length > 0
    logger.debug('[getProfileDecryptedKey] decrypted', {
      profileId,
      ref: row.api_key_ref,
      hasKey,
      keyLen: key?.length ?? 0
    })
    if (!hasKey) {
      logger.warn('[getProfileDecryptedKey] keychain returned empty/null for ref', {
        profileId,
        ref: row.api_key_ref
      })
    }
    return key
  } catch (err) {
    logger.error('[getProfileDecryptedKey] keychain decryption failed', {
      profileId,
      ref: row.api_key_ref,
      error: (err as Error)?.message?.slice(0, 300)
    })
    return null
  }
}
