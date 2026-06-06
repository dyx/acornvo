// shared/settings-types.ts
/**
 * Phase-13 settings — single source of truth for cross-process types.
 *
 * The four namespaces (general / appearance / ai / browser) match the
 * settings table's ns column. Each namespace has a fixed shape; unknown
 * keys passed through set() are rejected by the store.
 */

export type Locale = 'zh-CN' | 'en-US'
export type Theme = 'system' | 'light' | 'dark'
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'baidu'
export type AiProviderKind = 'deepseek' | 'openai-compatible' | 'openrouter' | 'ollama'

export interface GeneralSettings {
  locale: Locale
  autoBackup: 'off' | 'daily' | 'weekly'
  defaultMenu: '/browser' | '/library' | '/chat'
}

export interface AppearanceSettings {
  theme: Theme
  fontScale: number
  editorFont: string
}

export interface AiSettings {
  defaultChatModelId: string | null
  defaultReviewerModelId: string | null
  bodyMax: number
}

export interface BrowserSettings {

  clipImagesLocalize: boolean
  searchEngine: SearchEngine
}

export interface UpdateSettings {
  autoCheck: boolean
}


export type SettingsTab = 'general' | 'ai' | 'browser' | 'observability' | 'about'

export type SettingsNamespace = 'general' | 'appearance' | 'ai' | 'browser' | 'update'

export type SettingsByNs = {
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
  update: UpdateSettings
}

export interface AiProvider {
  id: string
  name: string
  type: AiProviderKind
  baseUrl: string | null
  apiKeyRef: string | null
  createdAt: string
  updatedAt: string
}

export interface AiModel {
  id: string
  providerId: string
  name: string
  displayName: string
  enabled: boolean
  contextWindow: number
  createdAt: string
  updatedAt: string
}

export interface ProviderCreateInput {
  name: string
  type: AiProviderKind
  baseUrl?: string | null
  apiKey?: string
}

export interface ProviderUpdateInput {
  name?: string
  baseUrl?: string | null
  /** non-empty string → overwrite secret; '' → delete secret; undefined → leave alone */
  apiKey?: string
}

export interface ModelCreateInput {
  providerId: string
  name: string
  displayName: string
  contextWindow?: number
}

export interface ModelUpdateInput {
  name?: string
  displayName?: string
  enabled?: boolean
  contextWindow?: number
}

/** Payload for the 'settings:changed' IPC event. */
export interface SettingsChangedPayload {
  ns: SettingsNamespace
  key: string
  newValue: unknown
}
