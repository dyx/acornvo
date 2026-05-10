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
export type SearchEngine = 'google' | 'bing' | 'duckduckgo'
export type AiProviderKind = 'openai' | 'anthropic' | 'ollama' | 'openai-compatible'

export interface GeneralSettings {
  locale: Locale
  autoBackup: 'off' | 'daily' | 'weekly'
}

export interface AppearanceSettings {
  theme: Theme
  fontScale: number
  editorFont: string
}

export interface AiSettings {
  defaultProfileId: string | null
}

export interface BrowserSettings {
  blockAds: boolean
  clipImagesLocalize: boolean
  searchEngine: SearchEngine
}

export interface UpdateSettings {
  autoCheck: boolean
}

export interface TelemetrySettings {
  enabled: boolean
}

export type SettingsNamespace = 'general' | 'appearance' | 'ai' | 'browser' | 'update' | 'telemetry'

export type SettingsByNs = {
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
  update: UpdateSettings
  telemetry: TelemetrySettings
}

/**
 * Profile shape over the IPC boundary. NEVER contains apiKey plaintext —
 * only the opaque apiKeyRef pointer into settings_secrets.
 */
export interface AiProviderProfile {
  id: string
  name: string
  provider: AiProviderKind
  baseUrl: string | null
  model: string
  temperature: number
  topP: number
  maxTokens: number | null
  apiKeyRef: string | null
  createdAt: string
  updatedAt: string
}

/** Input shape for profiles.create / profiles.update. Plaintext apiKey IS
 *  allowed here (renderer → main only); main encrypts before storage. */
export interface ProfileCreateInput {
  name: string
  provider: AiProviderKind
  baseUrl?: string | null
  model: string
  temperature?: number
  topP?: number
  maxTokens?: number | null
  apiKey?: string
}

export interface ProfileUpdateInput {
  name?: string
  provider?: AiProviderKind
  baseUrl?: string | null
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number | null
  /** non-empty string → overwrite secret; '' → delete secret; undefined → leave alone */
  apiKey?: string
}

/** Payload for the 'settings:changed' IPC event. */
export interface SettingsChangedPayload {
  ns: SettingsNamespace
  key: string
  newValue: unknown
}
