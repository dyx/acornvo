import { OpenAIEmbeddings } from '@langchain/openai'
import { OllamaEmbeddings } from '@langchain/ollama'
import { Embeddings } from '@langchain/core/embeddings'
import type { ResolvedProfile } from './model-factory'
import { logger } from '../obs/logger'
import { settingsStore } from '../settings/store'
import { getGlobalDb } from '../services/global-db'
import { getProviderApiKey } from '../settings/provider-key'
import { IpcError } from '../../shared/ipc-contract'

export function buildEmbeddings(profile: ResolvedProfile): Embeddings {
  const customFetch = async (url: any, init?: RequestInit) => {
    return fetch(url, init)
  }
  const finalBaseUrl = profile.baseUrl

  switch (profile.provider) {
    case 'ollama':
      return new OllamaEmbeddings({ model: profile.model, baseUrl: finalBaseUrl || undefined })
    case 'openai-compatible':
    case 'openrouter':
    case 'deepseek':
      return new OpenAIEmbeddings({
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        configuration: { fetch: customFetch, baseURL: finalBaseUrl || undefined }
      })
    case 'local' as any:
      return new LocalEmbeddings({ modelName: profile.model })
    default: {
      const _x: never = profile.provider as never
      throw new Error(`unsupported embedding provider: ${_x}`)
    }
  }
}

function resolveEmbeddingProfile(modelIdParam: string): ResolvedProfile & { embeddingDim: number } {
  const db = getGlobalDb()
  const query = `
    SELECT
      p.id as provider_id,
      p.type as provider_type,
      p.base_url,
      m.name,
      m.context_window,
      m.embedding_dim
    FROM ai_model m
    JOIN ai_provider p ON m.provider_id = p.id
    WHERE m.id = ?
  `
  const p = db.prepare(query).get(modelIdParam) as any | undefined

  if (!p) throw new IpcError('E_MISSING_PROFILE', `model not found: ${modelIdParam}`)

  const apiKey = getProviderApiKey(p.provider_id)
  return {
    id: p.provider_id,
    provider: p.provider_type as ResolvedProfile['provider'],
    model: p.name,
    apiKey,
    baseUrl: p.base_url ?? undefined,
    dbModelId: modelIdParam,
    contextWindow: p.context_window ?? 128000,
    embeddingDim: p.embedding_dim ?? 512
  }
}

export class LocalEmbeddings extends Embeddings {
  modelName: string

  constructor(opts: { modelName: string }) {
    super({})
    this.modelName = opts.modelName
  }

  async embedDocuments(_documents: string[]): Promise<number[][]> {
    throw new Error('Local embeddings must be handled via the embedding worker')
  }

  async embedQuery(_document: string): Promise<number[]> {
    throw new Error('Local embeddings must be handled via the embedding worker')
  }
}

export interface ResolvedEmbeddings {
  model: Embeddings | null // null means local worker should be used
  dim: number
  modelId: string
  isLocal: boolean
}

export function resolveEmbeddings(): ResolvedEmbeddings {
  const id = settingsStore.get('ai')?.defaultEmbeddingModelId
  if (id && id !== 'local:bge-small-zh') {
    try {
      const profile = resolveEmbeddingProfile(id)
      return {
        model: buildEmbeddings(profile),
        dim: profile.embeddingDim,
        modelId: id,
        isLocal: false
      }
    } catch (err) {
      logger().warn('ai', {
        msg: 'failed to resolve embedding profile, falling back to local',
        meta: { id, error: String(err) }
      })
    }
  }
  // isLocal: true => use embedWorker, so model can be null here to avoid loading onnx in main thread
  return { model: null, dim: 512, modelId: 'local:bge-small-zh', isLocal: true }
}
