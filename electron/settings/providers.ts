// electron/settings/providers.ts
import { v4 as uuidv4 } from 'uuid'
import { IpcError } from '@shared/ipc-contract'
import type {
  AiProvider,
  AiModel,
  ProviderCreateInput,
  ProviderUpdateInput,
  ModelCreateInput,
  ModelUpdateInput
} from '@shared/settings-types'
import { AI_PROVIDER_DEFAULTS } from '@shared/ai-provider-defaults'

import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'
import { settingsStore } from './store'

interface ProviderRow {
  id: string
  name: string
  type: string
  base_url: string | null
  api_key_ref: string | null
  created_at: string
  updated_at: string
}

interface ModelRow {
  id: string
  provider_id: string
  model_id: string
  display_name: string
  enabled: number
  created_at: string
  updated_at: string
}

function rowToProvider(row: ProviderRow): AiProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AiProvider['type'],
    baseUrl: row.base_url,
    apiKeyRef: row.api_key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToModel(row: ModelRow): AiModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// --- Providers ---

function listProviders(): AiProvider[] {
  const db = getGlobalDb()
  const rows = db.prepare('SELECT * FROM ai_provider ORDER BY created_at ASC').all() as ProviderRow[]
  return rows.map(rowToProvider)
}

function createProvider(input: ProviderCreateInput): { id: string } {
  const db = getGlobalDb()
  const exists = db.prepare('SELECT 1 FROM ai_provider WHERE name = ?').get(input.name)
  if (exists) {
    throw new IpcError('E_DUPLICATE_NAME', `E_DUPLICATE_NAME: name "${input.name}" is already in use`)
  }

  const id = uuidv4()
  const apiKeyRef = input.apiKey && input.apiKey.length > 0 ? `ai.key.${id}` : null
  const now = new Date().toISOString()

  if (apiKeyRef) {
    secretsStore.set(apiKeyRef, input.apiKey!)
  }

  try {
    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO ai_provider
          (id, name, type, base_url, api_key_ref, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(id, input.name, input.type, input.baseUrl ?? null, apiKeyRef, now, now)

      // Automatically populate built-in models
      const defs = AI_PROVIDER_DEFAULTS[input.type]
      if (defs && defs.models && defs.models.length > 0) {
        const insertModel = db.prepare(
          `INSERT INTO ai_model (id, provider_id, model_id, display_name, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`
        )
        for (const m of defs.models) {
          insertModel.run(uuidv4(), id, m.id, m.displayName, now, now)
        }
      }
    })()
  } catch (err) {
    if (apiKeyRef) secretsStore.delete(apiKeyRef)
    throw err
  }

  return { id }
}

function updateProvider(id: string, patch: ProviderUpdateInput): void {
  const db = getGlobalDb()
  const row = db.prepare('SELECT * FROM ai_provider WHERE id = ?').get(id) as ProviderRow | undefined
  if (!row) throw new IpcError('E_NOT_FOUND', `E_NOT_FOUND: provider ${id} not found`)

  if (patch.name !== undefined && patch.name !== row.name) {
    const conflict = db.prepare('SELECT 1 FROM ai_provider WHERE name = ? AND id != ?').get(patch.name, id)
    if (conflict) {
      throw new IpcError('E_DUPLICATE_NAME', `E_DUPLICATE_NAME: name "${patch.name}" is already in use`)
    }
  }

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
    UPDATE ai_provider SET
      name = COALESCE(?, name),
      base_url = COALESCE(?, base_url),
      api_key_ref = ?,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    patch.name ?? null,
    patch.baseUrl ?? null,
    newApiKeyRef,
    now,
    id
  )
}

function deleteProvider(id: string): void {
  const db = getGlobalDb()
  const row = db.prepare('SELECT api_key_ref FROM ai_provider WHERE id = ?').get(id) as { api_key_ref: string | null } | undefined
  if (!row) throw new IpcError('E_NOT_FOUND', `E_NOT_FOUND: provider ${id} not found`)

  if (row.api_key_ref) {
    try {
      secretsStore.delete(row.api_key_ref)
    } catch {
      // ignore
    }
  }

  db.transaction(() => {
    // Determine all models belonging to this provider
    const models = db.prepare('SELECT id FROM ai_model WHERE provider_id = ?').all(id) as { id: string }[]
    const modelIds = models.map(m => m.id)
    
    db.prepare('DELETE FROM ai_provider WHERE id = ?').run(id)
    // ai_model is ON DELETE CASCADE, so it should delete automatically

    // Clean up settings if default models were deleted
    const ai = settingsStore.get('ai')
    let defaultChat = ai.defaultChatModelId
    let defaultReviewer = ai.defaultReviewerModelId
    let changed = false
    
    if (defaultChat && modelIds.includes(defaultChat)) {
      defaultChat = null
      changed = true
    }
    if (defaultReviewer && modelIds.includes(defaultReviewer)) {
      defaultReviewer = null
      changed = true
    }
    if (changed) {
      settingsStore.set('ai', { defaultChatModelId: defaultChat, defaultReviewerModelId: defaultReviewer })
    }
  })()
}

// --- Models ---

function listModels(): AiModel[] {
  const db = getGlobalDb()
  const rows = db.prepare('SELECT * FROM ai_model ORDER BY created_at ASC').all() as ModelRow[]
  return rows.map(rowToModel)
}

function createModel(input: ModelCreateInput): { id: string } {
  const db = getGlobalDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO ai_model (id, provider_id, model_id, display_name, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run(id, input.providerId, input.modelId, input.displayName, now, now)
  return { id }
}

function updateModel(id: string, patch: ModelUpdateInput): void {
  const db = getGlobalDb()
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE ai_model SET
       model_id = COALESCE(?, model_id),
       display_name = COALESCE(?, display_name),
       enabled = COALESCE(?, enabled),
       updated_at = ?
     WHERE id = ?`
  ).run(
    patch.modelId ?? null,
    patch.displayName ?? null,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : null,
    now,
    id
  )
}

function deleteModel(id: string): void {
  const db = getGlobalDb()
  db.transaction(() => {
    db.prepare('DELETE FROM ai_model WHERE id = ?').run(id)
    
    const ai = settingsStore.get('ai')
    let defaultChat = ai.defaultChatModelId
    let defaultReviewer = ai.defaultReviewerModelId
    let changed = false
    
    if (defaultChat === id) {
      defaultChat = null
      changed = true
    }
    if (defaultReviewer === id) {
      defaultReviewer = null
      changed = true
    }
    if (changed) {
      settingsStore.set('ai', { defaultChatModelId: defaultChat, defaultReviewerModelId: defaultReviewer })
    }
  })()
}

export const providersStore = {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  createModel,
  updateModel,
  deleteModel
}
