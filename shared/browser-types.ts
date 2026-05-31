// shared/browser-types.ts
// Types shared between main, preload, and renderer for the in-app browser.

export type TabId = string

export interface Tab {
  id: TabId
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  suspended: boolean // true when WebContents has been destroyed (LRU)
  savedUrl: string // last-known url; used to restore on resume
  isClipped: boolean // phase-12: checked on did-navigate via clips.getByUrl
}

export type TabPatch = Partial<
  Pick<Tab, 'url' | 'title' | 'favicon' | 'loading' | 'canGoBack' | 'canGoForward' | 'isClipped'>
>

export interface TabStateChangedPayload {
  tabId: TabId
  patch: TabPatch
}

export interface SetViewportArgs {
  x: number
  y: number
  width: number
  height: number
}

export interface Bookmark {
  id: number
  url: string
  title: string | null
  favicon: string | null
  tags: string[] // parsed from tags_json
  createdAt: string
  updatedAt: string
}

export interface BookmarkInput {
  url: string
  title?: string | null
  favicon?: string | null
  tags?: string[]
}

export interface BookmarkListOpts {
  q?: string
  tag?: string
  limit: number
  offset: number
}

export interface BookmarkListResult {
  items: Bookmark[]
  total: number
}

// Error code returned by bookmarks.create when url already exists.
// This rides on top of the existing IpcErrorCode union via the standard envelope.
export interface BookmarkDuplicateDetail {
  existingId: number
}
