// electron/settings/providers.ts
import { v4 as uuidv4 } from 'uuid'
import { IpcError } from '@shared/ipc-contract'
import type {
  AiProvider,
  AiModel,
  ProviderCreateInput,
  ProviderUpdateInput,
  ModelCreateInput,
  ModelUpdateInput,
  AiProviderKind
} from '@shared/settings-types'
import { AI_PROVIDER_DEFAULTS } from '@shared/ai-provider-defaults'

import { getGlobalDb } from '../services/global-db'
import { secretsStore } from './secrets'
import { settingsStore } from './store'
import { getProviderDecryptedKey } from './provider-key'

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
  name: string
  display_name: string
  enabled: number
  context_window: number
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
    name: row.name,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    contextWindow: row.context_window,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// --- Providers ---

function listProviders(): AiProvider[] {
  const db = getGlobalDb()
  const rows = db
    .prepare('SELECT * FROM ai_provider ORDER BY created_at ASC')
    .all() as ProviderRow[]
  return rows.map(rowToProvider)
}

async function syncOllamaModels(providerId: string, baseUrl?: string) {
  const db = getGlobalDb()
  // Ensure we get the pure host, then append /api/tags
  let url = baseUrl || AI_PROVIDER_DEFAULTS['ollama']?.baseUrl
  if (!url) return
  url = url.replace(/\/(?:api|v1)\/?$/, '').replace(/\/+$/, '') + '/api/tags'

  try {
    const res = await fetch(url)
    if (!res.ok) return
    const data = await res.json()
    if (data && Array.isArray(data.models)) {
      const modelsToInsert = data.models.slice(0, 10)
      const now = new Date().toISOString()

      const insertModel = db.prepare(
        `INSERT INTO ai_model (id, provider_id, name, display_name, enabled, context_window, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 128000, ?, ?)
         ON CONFLICT(provider_id, name) DO UPDATE SET
           updated_at = excluded.updated_at`
      )

      db.transaction(() => {
        for (const m of modelsToInsert) {
          insertModel.run(uuidv4(), providerId, m.model, m.name, now, now)
        }
      })()
    }
  } catch (err) {
    // silently fail
  }
}

async function createProvider(input: ProviderCreateInput): Promise<{ id: string }> {
  const db = getGlobalDb()
  const exists = db.prepare('SELECT 1 FROM ai_provider WHERE name = ?').get(input.name)
  if (exists) {
    throw new IpcError(
      'E_DUPLICATE_NAME',
      `E_DUPLICATE_NAME: name "${input.name}" is already in use`
    )
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
          `INSERT INTO ai_model (id, provider_id, name, display_name, enabled, context_window, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
        )
        for (const m of defs.models) {
          insertModel.run(uuidv4(), id, m.name, m.displayName, m.contextWindow ?? 128000, now, now)
        }
      }
    })()
  } catch (err) {
    if (apiKeyRef) secretsStore.delete(apiKeyRef)
    throw err
  }

  if (input.type === 'ollama') {
    await syncOllamaModels(id, input.baseUrl || undefined)
  }

  return { id }
}

async function updateProvider(id: string, patch: ProviderUpdateInput): Promise<void> {
  const db = getGlobalDb()
  const row = db.prepare('SELECT * FROM ai_provider WHERE id = ?').get(id) as
    | ProviderRow
    | undefined
  if (!row) throw new IpcError('E_NOT_FOUND', `E_NOT_FOUND: provider ${id} not found`)

  if (patch.name !== undefined && patch.name !== row.name) {
    const conflict = db
      .prepare('SELECT 1 FROM ai_provider WHERE name = ? AND id != ?')
      .get(patch.name, id)
    if (conflict) {
      throw new IpcError(
        'E_DUPLICATE_NAME',
        `E_DUPLICATE_NAME: name "${patch.name}" is already in use`
      )
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
  ).run(patch.name ?? null, patch.baseUrl ?? null, newApiKeyRef, now, id)

  if (row.type === 'ollama') {
    await syncOllamaModels(id, (patch.baseUrl ?? row.base_url) || undefined)
  }
}

function deleteProvider(id: string): void {
  const db = getGlobalDb()
  const row = db.prepare('SELECT api_key_ref FROM ai_provider WHERE id = ?').get(id) as
    | { api_key_ref: string | null }
    | undefined
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
    const models = db.prepare('SELECT id FROM ai_model WHERE provider_id = ?').all(id) as {
      id: string
    }[]
    const modelIds = models.map((m) => m.id)

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
      settingsStore.set('ai', {
        defaultChatModelId: defaultChat,
        defaultReviewerModelId: defaultReviewer
      })
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
  try {
    db.prepare(
      `INSERT INTO ai_model (id, provider_id, name, display_name, enabled, context_window, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      id,
      input.providerId,
      input.name,
      input.displayName,
      input.contextWindow ?? 128000,
      now,
      now
    )
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      if (
        err.message.includes('ai_model.name') ||
        err.message.includes('idx_ai_model_provider_name')
      ) {
        throw new IpcError(
          'E_DUPLICATE_NAME',
          `E_DUPLICATE_NAME: model name "${input.name}" is already in use`
        )
      }
      if (
        err.message.includes('ai_model.display_name') ||
        err.message.includes('idx_ai_model_provider_display_name')
      ) {
        throw new IpcError(
          'E_DUPLICATE_DISPLAY_NAME',
          `E_DUPLICATE_DISPLAY_NAME: display name "${input.displayName}" is already in use`
        )
      }
    }
    throw err
  }
  return { id }
}

function updateModel(id: string, patch: ModelUpdateInput): void {
  const db = getGlobalDb()
  const now = new Date().toISOString()
  try {
    db.prepare(
      `UPDATE ai_model SET
         name = COALESCE(?, name),
         display_name = COALESCE(?, display_name),
         enabled = COALESCE(?, enabled),
         context_window = COALESCE(?, context_window),
         updated_at = ?
       WHERE id = ?`
    ).run(
      patch.name ?? null,
      patch.displayName ?? null,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : null,
      patch.contextWindow ?? null,
      now,
      id
    )
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      if (
        err.message.includes('ai_model.name') ||
        err.message.includes('idx_ai_model_provider_name')
      ) {
        throw new IpcError(
          'E_DUPLICATE_NAME',
          `E_DUPLICATE_NAME: model name "${patch.name}" is already in use`
        )
      }
      if (
        err.message.includes('ai_model.display_name') ||
        err.message.includes('idx_ai_model_provider_display_name')
      ) {
        throw new IpcError(
          'E_DUPLICATE_DISPLAY_NAME',
          `E_DUPLICATE_DISPLAY_NAME: display name "${patch.displayName}" is already in use`
        )
      }
    }
    throw err
  }
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
      settingsStore.set('ai', {
        defaultChatModelId: defaultChat,
        defaultReviewerModelId: defaultReviewer
      })
    }
  })()
}

async function testConnection(input: {
  baseUrl?: string
  apiKey?: string
  providerId?: string
  testPath?: string
}): Promise<{ ok: boolean; message?: string }> {
  try {
    let key = input.apiKey
    if (!key && input.providerId) {
      key = getProviderDecryptedKey(input.providerId) ?? undefined
    }

    if (!input.baseUrl) {
      return { ok: false, message: 'Base URL is required for testing connection' }
    }

    // Construct the test URL
    let url = input.baseUrl

    // Sanitize base URL for Ollama or similar if testPath already includes /api
    if (input.testPath && input.testPath.startsWith('/api') && url.match(/\/(?:api|v1)\/?$/)) {
      url = url.replace(/\/(?:api|v1)\/?$/, '')
    }

    if (input.testPath) {
      // Ensure no double slashes
      url =
        url.replace(/\/$/, '') +
        (input.testPath.startsWith('/') ? input.testPath : '/' + input.testPath)
    }
    const headers: Record<string, string> = {}
    if (key) {
      headers['Authorization'] = `Bearer ${key}`
    }

    const res = await fetch(url, {
      method: 'GET',
      headers
    })

    if (res.ok) {
      return { ok: true }
    } else {
      let bodyStr = ''
      try {
        const body = await res.json()
        bodyStr = body.error?.message || body.message || JSON.stringify(body)
      } catch {
        bodyStr = await res.text().catch(() => '')
      }

      let errMsg = `HTTP ${res.status} ${res.statusText}`
      if (res.status === 401 || res.status === 403) {
        errMsg = `鉴权失败 (HTTP ${res.status})，请检查 API Key 是否正确`
      } else if (res.status === 404) {
        errMsg = `地址不存在 (HTTP 404)，请检查 Base URL`
      }
      return { ok: false, message: `${errMsg}${bodyStr ? ' - ' + bodyStr : ''}`.trim() }
    }
  } catch (err: any) {
    if (err && err.code === 'E_KEYCHAIN_UNAVAILABLE') {
      throw err;
    }
    if (err.message === 'fetch failed') {
      return { ok: false, message: '网络请求失败，请检查 Base URL 是否正确或网络是否连通。' }
    }
    return { ok: false, message: err.message || String(err) }
  }
}

export async function checkBalance(
  providerId: string
): Promise<{ ok: boolean; message?: string; balance?: string }> {
  try {
    const db = getGlobalDb()
    const row = db
      .prepare('SELECT type, base_url FROM ai_provider WHERE id = ?')
      .get(providerId) as { type: string; base_url: string | null } | undefined
    if (!row) {
      return { ok: false, message: 'Provider not found' }
    }

    const type = row.type as AiProviderKind
    const defs = AI_PROVIDER_DEFAULTS[type]
    const balancePath = defs?.balancePath
    if (!balancePath) {
      return { ok: false, message: 'Balance check not supported' }
    }

    const key = getProviderDecryptedKey(providerId)
    if (!key) {
      return { ok: false, message: 'API Key not configured' }
    }

    const baseUrl = row.base_url || defs.baseUrl
    if (!baseUrl) {
      return { ok: false, message: 'Base URL not configured' }
    }

    const url =
      baseUrl.replace(/\/$/, '') + (balancePath.startsWith('/') ? balancePath : '/' + balancePath)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`
    }

    const res = await fetch(url, { method: 'GET', headers })
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` }
    }

    const body = await res.json()
    if (type === 'deepseek') {
      const info = body.balance_infos?.[0]
      if (info && info.total_balance && info.currency) {
        const val = parseFloat(info.total_balance)
        let symbol = ''
        if (info.currency === 'CNY') symbol = '¥'
        else if (info.currency === 'USD') symbol = '$'
        else symbol = info.currency + ' '

        return { ok: true, balance: `${symbol}${isNaN(val) ? info.total_balance : val.toFixed(2)}` }
      }
    } else if (type === 'openrouter') {
      const credits = body.data?.total_credits
      if (typeof credits === 'number') {
        return { ok: true, balance: `$${credits.toFixed(2)}` }
      }
    }

    return { ok: false, message: 'Failed to parse balance response' }
  } catch (err: any) {
    return { ok: false, message: err.message || String(err) }
  }
}

export const providersStore = {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  createModel,
  updateModel,
  deleteModel,
  testConnection,
  checkBalance
}
