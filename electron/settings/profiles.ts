// electron/settings/profiles.ts
import { v4 as uuidv4 } from 'uuid'
import { IpcError } from '@shared/ipc-contract'
import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput
} from '@shared/settings-types'

import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'
import { settingsStore } from './store'

interface ProfileRow {
  id: string
  name: string
  provider: string
  base_url: string | null
  model: string
  temperature: number
  top_p: number
  max_tokens: number | null
  api_key_ref: string | null
  created_at: string
  updated_at: string
}

function rowToProfile(row: ProfileRow): AiProviderProfile {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as AiProviderProfile['provider'],
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    topP: row.top_p,
    maxTokens: row.max_tokens,
    apiKeyRef: row.api_key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function list(): AiProviderProfile[] {
  const db = getGlobalDb()
  const rows = db
    .prepare('SELECT * FROM ai_provider_profiles ORDER BY created_at ASC')
    .all() as ProfileRow[]
  return rows.map(rowToProfile)
}

function create(input: ProfileCreateInput): { id: string } {
  const db = getGlobalDb()
  const exists = db.prepare('SELECT 1 FROM ai_provider_profiles WHERE name = ?').get(input.name)
  if (exists)
    throw new IpcError(
      'E_DUPLICATE_NAME',
      `E_DUPLICATE_NAME: name "${input.name}" is already in use`
    )

  const id = uuidv4()
  const apiKeyRef = input.apiKey && input.apiKey.length > 0 ? `ai.key.${id}` : null
  const now = new Date().toISOString()

  // Save secret BEFORE writing the row so a keychain failure doesn't leave an
  // orphan profile pointing at a missing secret.
  if (apiKeyRef) {
    secretsStore.set(apiKeyRef, input.apiKey!)
  }

  try {
    db.prepare(
      `
      INSERT INTO ai_provider_profiles
        (id, name, provider, base_url, model, temperature, top_p, max_tokens, api_key_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.name,
      input.provider,
      input.baseUrl ?? null,
      input.model,
      input.temperature ?? 0.7,
      input.topP ?? 1.0,
      input.maxTokens ?? null,
      apiKeyRef,
      now,
      now
    )
  } catch (err) {
    if (apiKeyRef) secretsStore.delete(apiKeyRef)
    throw err
  }

  // If this is the first profile (or no default is set), make it the default
  const ai = settingsStore.get('ai')
  const defaultExists = ai.defaultProfileId
    ? db.prepare('SELECT 1 FROM ai_provider_profiles WHERE id = ?').get(ai.defaultProfileId)
    : null
  if (!ai.defaultProfileId || !defaultExists) {
    settingsStore.set('ai', { defaultProfileId: id })
  }

  return { id }
}

function update(id: string, patch: ProfileUpdateInput): void {
  const db = getGlobalDb()
  const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(id) as
    | ProfileRow
    | undefined
  if (!row)
    throw new IpcError('E_PROFILE_NOT_FOUND', `E_PROFILE_NOT_FOUND: profile ${id} not found`)

  if (patch.name !== undefined && patch.name !== row.name) {
    const conflict = db
      .prepare('SELECT 1 FROM ai_provider_profiles WHERE name = ? AND id != ?')
      .get(patch.name, id)
    if (conflict)
      throw new IpcError(
        'E_DUPLICATE_NAME',
        `E_DUPLICATE_NAME: name "${patch.name}" is already in use`
      )
  }

  // Determine new api_key_ref from patch.apiKey semantics
  let newApiKeyRef = row.api_key_ref
  if (patch.apiKey !== undefined) {
    if (patch.apiKey === '') {
      if (row.api_key_ref) secretsStore.delete(row.api_key_ref)
      newApiKeyRef = null
    } else {
      const ref = row.api_key_ref ?? `ai.key.${id}`
      secretsStore.set(ref, patch.apiKey)
      newApiKeyRef = ref
    }
  }

  const now = new Date().toISOString()
  db.prepare(
    `
    UPDATE ai_provider_profiles SET
      name = COALESCE(?, name),
      provider = COALESCE(?, provider),
      base_url = COALESCE(?, base_url),
      model = COALESCE(?, model),
      temperature = COALESCE(?, temperature),
      top_p = COALESCE(?, top_p),
      max_tokens = COALESCE(?, max_tokens),
      api_key_ref = ?,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    patch.name ?? null,
    patch.provider ?? null,
    patch.baseUrl ?? null,
    patch.model ?? null,
    patch.temperature ?? null,
    patch.topP ?? null,
    patch.maxTokens ?? null,
    newApiKeyRef,
    now,
    id
  )

  // Any field change can affect the cached LangChain model instance (temperature
  // and maxTokens are baked in at construction time), so invalidate unconditionally.

}

function deleteProfile(id: string): void {
  const db = getGlobalDb()
  const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id = ?').get(id) as
    | { api_key_ref: string | null }
    | undefined
  if (!row)
    throw new IpcError('E_PROFILE_NOT_FOUND', `E_PROFILE_NOT_FOUND: profile ${id} not found`)

  // Delete secret first, then the row.
  if (row.api_key_ref) {
    try {
      secretsStore.delete(row.api_key_ref)
    } catch {
      // delete is no-throw per its contract, but be defensive
    }
  }
  db.prepare('DELETE FROM ai_provider_profiles WHERE id = ?').run(id)

  // If this was the default profile, fall back to the first remaining or null
  const ai = settingsStore.get('ai')
  if (ai.defaultProfileId === id) {
    const next = db
      .prepare('SELECT id FROM ai_provider_profiles ORDER BY created_at ASC LIMIT 1')
      .get() as { id: string } | undefined
    settingsStore.set('ai', { defaultProfileId: next?.id ?? null })
  }


}

export const profilesStore = {
  list,
  create,
  update,
  delete: deleteProfile
}
