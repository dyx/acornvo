// electron/settings/profile-key.ts
import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'

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
  if (!row) return null
  if (!row.api_key_ref) return null
  return secretsStore.get(row.api_key_ref)
}
