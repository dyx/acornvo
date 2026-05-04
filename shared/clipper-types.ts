// shared/clipper-types.ts
// Types shared between main, preload, and renderer for the phase-12 web clipper.
// Pipeline state names mirror those used by `src/stores/clipper.ts` (Plan 3 task 6.1).

export type ClipRunId = string

/**
 * Result of the Readability extraction pass that runs inside the tab WebContents.
 * Returned from main-side `extract(webContents)`.
 */
export interface ExtractResult {
  ok: boolean
  /** When ok=false this carries the cause; otherwise omitted. */
  error?: ClipErrorCode
  /** True when fallback path used (Readability returned null). */
  degraded?: boolean
  /** Article title; falls back to `document.title` when Readability is empty. */
  title?: string
  /** Raw byline string from Readability ("By X" prefix not yet stripped). */
  byline?: string
  /** Article HTML body (or `document.body.innerHTML` when degraded). */
  content?: string
  /** Plain-text rendition (Readability.textContent). */
  textContent?: string
  /** Plain-text length in characters. */
  length?: number
  /** Readability-suggested excerpt. */
  excerpt?: string
  /** Site name from `<meta property="og:site_name">` etc. */
  siteName?: string
  /** Article language (lang attribute). */
  lang?: string
  /** ISO 8601 publishedTime when the page exposes it. */
  publishedTime?: string
  /** location.href of the tab at extraction time. */
  url?: string
}

/**
 * Output of enrich(extractResult). Pure function; no IO.
 * Keys may be omitted when the source had nothing usable.
 */
export interface EnrichedResult {
  url: string
  site: string
  title?: string
  author?: string
  publishedTime?: string
  lang?: string
  excerpt?: string
  /** True iff the upstream extract was degraded. */
  degraded: boolean
  /** The article HTML body to feed into the transformer. */
  content: string
  /** Plain-text length (if known). */
  length?: number
}

/**
 * Error codes returned by the clipper subsystem. Carried inside the standard
 * IPC envelope (`ok: false, error: { code, message }`). Distinct from the
 * generic IpcErrorCode set in shared/ipc-contract.ts to keep the union readable.
 */
export type ClipErrorCode =
  | 'E_UNSUPPORTED_SCHEME'
  | 'E_ALREADY_CLIPPED'
  | 'E_EXTRACT_TIMEOUT'
  | 'E_EXTRACT_EMPTY'
  | 'E_TRANSFORM_FAILED'
  | 'E_WRITE_FAILED'
  | 'E_INDEX_FAILED'
  | 'E_DUPLICATE'

/**
 * What the renderer sends to `clipper.saveClip` after editing the preview.
 */
export interface ClipInput {
  /** Pipeline run id that produced the preview; main correlates back to its in-flight state. */
  runId: ClipRunId
  /** Final, possibly edited title. */
  title: string
  /** Final, possibly edited tags (frontmatter `tags: []`). */
  tags: string[]
  /** Final, possibly edited excerpt. */
  excerpt?: string
}

/**
 * Successful clip outcome. Returned to renderer after the save+index+record stage.
 */
export interface ClipResult {
  id: number
  /** Relative-to-vault path of the written markdown file. */
  path: string
  url: string
  title: string
  degraded: boolean
}

/**
 * Pipeline stage names. Used both for IPC error.stage and for the renderer
 * Zustand state machine (Plan 3 task 6.1).
 */
export type ClipStage =
  | 'idle'
  | 'precheck'
  | 'extracting'
  | 'transforming'
  | 'previewing'
  | 'saving'
  | 'indexing'
  | 'done'
  | 'error'
  | 'canceled'

/**
 * Error envelope used inside `{ ok:false, error: { code, message, stage, details? } }`.
 */
export interface ClipErrorEnvelope {
  code: ClipErrorCode
  message: string
  stage: ClipStage
  /** When code='E_ALREADY_CLIPPED', this carries the existing clip pointer. */
  existingId?: number
  existingPath?: string
}

/**
 * What the preview modal receives when extract+transform succeed. Plan 2 task 4.3
 * builds it; this type lives in shared/ so renderer can import.
 */
export interface ClipPreview {
  runId: ClipRunId
  title: string
  url: string
  site: string
  author?: string
  publishedTime?: string
  lang?: string
  excerpt?: string
  /** Markdown body, full length. Renderer truncates to 2000 chars for preview pane. */
  body: string
  /** Suggested target path relative to vault. */
  suggestedPath: string
  /** Default frontmatter tags (always [] at this stage). */
  tags: string[]
  degraded: boolean
}
