import { create } from 'zustand'
import type { Frontmatter } from '@shared/frontmatter-schema'
import type { ConflictState } from '@shared/conflict-types'
import { ipc } from '@/ipc/client'
import { IpcError } from '@shared/ipc-contract'

export type EditorReadyState = {
  kind: 'ready'
  path: string
  clipId?: number | null
  rawYaml: string
  frontmatter: Frontmatter
  body: string
  savedFrontmatter: Frontmatter
  savedBody: string
  savedMtimeMs: number
  baseFrontmatter: Frontmatter
  baseBody: string
  baseMtimeMs: number
  dirty: boolean
  saving: boolean
  lastError: string | null
  saveErrorCount: number
  persistentFailure: boolean
  conflictState: ConflictState
  pendingNavigateTo?: string
  aiRerunInflight?: boolean
}

export type EditorState =
  | { kind: 'idle' }
  | { kind: 'loading'; path: string }
  | EditorReadyState
  | { kind: 'error'; path: string; error: string }

export type EditorActions = {
  open: (path: string) => Promise<void>
  setBody: (newBody: string) => void
  save: () => Promise<void>
  flushSave: () => Promise<void>
  close: () => Promise<void>
  reloadFromDisk: () => Promise<void>
  ignoreExternalChange: () => void
  keepLocal: () => Promise<void>
  saveAsCopy: () => Promise<void>
  dismissDialog: () => void
  applyAiSuggestedTitle: () => void
  mergeAiTags: () => void
  acceptAiReview: () => void
  rejectAiReview: () => void
  setAiRerunInflight: (v: boolean) => void
}

type EditorStore = { state: EditorState } & EditorActions

const SAVE_DEBOUNCE_MS = 1000
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _inflight: Promise<void> | null = null

/** Cancels any pending debounce timer. Exported for tests + flushSave. */
export function _cancelDebounce(): void {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }
}

// ── phase-09 watcher: index:fileChanged → silent reload (clean) or banner (dirty) ──
let _editorSubscriberInstalled = false

/** Returns an unsubscribe function. Exported for tests. */
export function installEditorSubscriber(): () => void {
  if (_editorSubscriberInstalled) return () => {}
  _editorSubscriberInstalled = true

  const offChanged = ipc.on('index:fileChanged', (payload) => {
    const cur = useEditorStore.getState().state
    if (cur.kind !== 'ready') return
    if (cur.path !== payload.path) return
    if (payload.mtime <= cur.savedMtimeMs) return // self-write or stale event

    if (cur.dirty) {
      // Banner path: show externalModified
      useEditorStore.setState((prev) => {
        if (prev.state.kind !== 'ready' || prev.state.path !== payload.path) return prev
        return {
          ...prev,
          state: {
            ...prev.state,
            conflictState: {
              kind: 'externalModified',
              remoteMtimeMs: payload.mtime
            }
          }
        }
      })
    } else {
      // Silent reload path
      void (async () => {
        try {
          const fresh = await ipc.file.readParsed(cur.path)
          useEditorStore.setState((prev2) => {
            if (prev2.state.kind !== 'ready' || prev2.state.path !== cur.path) return prev2
            if (prev2.state.dirty) return prev2 // dirty in the meantime → don't overwrite
            return {
              ...prev2,
              state: {
                kind: 'ready',
                path: cur.path,
                clipId: fresh.clipId ?? null,
                rawYaml: fresh.rawYaml,
                frontmatter: fresh.frontmatter,
                body: fresh.body,
                savedFrontmatter: fresh.frontmatter,
                savedBody: fresh.body,
                savedMtimeMs: fresh.mtimeMs,
                baseFrontmatter: fresh.frontmatter,
                baseBody: fresh.body,
                baseMtimeMs: fresh.mtimeMs,
                dirty: false,
                saving: false,
                lastError: null,
                saveErrorCount: 0,
                persistentFailure: false,
                conflictState: { kind: 'none' }
              }
            }
          })
        } catch (_) {
          /* ignore read errors during silent reload */
        }
      })()
    }
  })

  const offProject = ipc.on('project:changed', () => {
    // Project changed from under us (e.g. backend swapped).
    // Force reset state to avoid saving to the new project.
    _cancelDebounce()
    useEditorStore.setState({ state: { kind: 'idle' } })
  })

  return () => {
    _editorSubscriberInstalled = false
    offChanged()
    offProject()
  }
}
export function _resetEditorSubscriber(): void {
  _editorSubscriberInstalled = false
}

// ── phase-15: AI review job subscription ──
let _jobsUnsubscribe: (() => void) | null = null

function isBlockedByConflict(s: EditorState): boolean {
  if (s.kind !== 'ready') return false
  return s.conflictState.kind === 'externalModified' || s.conflictState.kind === 'saveConflict'
}

function _scheduleSave(): void {
  if (isBlockedByConflict(useEditorStore.getState().state)) return
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    void useEditorStore.getState().save()
  }, SAVE_DEBOUNCE_MS)
}

async function _doSave(): Promise<void> {
  const cur = useEditorStore.getState().state
  if (cur.kind !== 'ready') return
  if (cur.saving) return
  if (!cur.dirty) return

  const bodyAtSendTime = cur.body
  const mtimeAtSendTime = cur.savedMtimeMs
  const path = cur.path
  const frontmatter = cur.frontmatter

  useEditorStore.setState((prev) => ({
    ...prev,
    state: prev.state.kind === 'ready' ? { ...prev.state, saving: true } : prev.state
  }))

  try {
    const r = await ipc.file.writeParsed(path, frontmatter, bodyAtSendTime, {
      expectedMtime: mtimeAtSendTime,
      rawYaml: cur.rawYaml
    } as any)
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    const newDirty = next.body !== bodyAtSendTime
    useEditorStore.setState({
      state: {
        ...next,
        savedBody: bodyAtSendTime,
        savedMtimeMs: r.mtimeMs,
        saving: false,
        dirty: newDirty,
        lastError: null,
        saveErrorCount: 0,
        persistentFailure: false
      }
    })
    if (newDirty) {
      setTimeout(() => {
        void useEditorStore.getState().save()
      }, 0)
    }
  } catch (err) {
    if (err instanceof IpcError && err.code === 'E_NOT_FOUND') {
      useEditorStore.setState({
        state: { kind: 'error', path: cur.path, error: 'E_NOT_FOUND' }
      })
      return
    }
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    if (err instanceof IpcError && err.code === 'E_MTIME_MISMATCH') {
      // Phase-09: enter saveConflict state instead of toast
      try {
        const fresh = await ipc.files.get(path)
        useEditorStore.setState((prev) => {
          if (prev.state.kind !== 'ready' || prev.state.path !== path) return prev
          return {
            ...prev,
            state: {
              ...prev.state,
              saving: false,
              conflictState: {
                kind: 'saveConflict',
                remoteMtimeMs:
                  (err.context?.remoteMtimeMs as number | undefined) ?? fresh.summary.mtime,
                remoteBody: fresh.body,
                remoteFrontmatter: fresh.frontmatter
              }
            }
          }
        })
      } catch (_refetchErr) {
        // Even if remote fetch fails, surface error
        useEditorStore.setState((prev) => {
          if (prev.state.kind !== 'ready') return prev
          return {
            ...prev,
            state: {
              ...prev.state,
              saving: false,
              lastError: 'E_MTIME_MISMATCH'
            }
          }
        })
      }
      return // do NOT count toward retry counter
    }
    const code = err instanceof IpcError ? err.code : String(err)
    const newCount = next.saveErrorCount + 1
    useEditorStore.setState({
      state: {
        ...next,
        saving: false,
        lastError: code,
        saveErrorCount: newCount,
        persistentFailure: newCount >= 3
      }
    })
  }
}

/**
 * Minimal markdown frontmatter + body composer for conflict snapshot texts.
 * Produces ---\n<yaml>\n---\n<body> when frontmatter is non-empty, else plain body.
 */
function stringify(fm: Frontmatter, body: string): string {
  if (!fm || Object.keys(fm).length === 0) return body
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        if (typeof item === 'string' && (item.includes(':') || item.includes('#'))) {
          lines.push(`  - "${item}"`)
        } else {
          lines.push(`  - ${item}`)
        }
      }
    } else if (typeof value === 'string' && value.includes('\n')) {
      lines.push(`${key}: |`)
      for (const line of value.split('\n')) {
        lines.push(`  ${line}`)
      }
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${value}`)
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  lines.push('---', '', body)
  return lines.join('\n')
}

function buildCopyPath(originalPath: string, ts: string): string {
  const dotIdx = originalPath.lastIndexOf('.')
  const slashIdx = originalPath.lastIndexOf('/')
  const stem = dotIdx > slashIdx ? originalPath.slice(0, dotIdx) : originalPath
  const ext = dotIdx > slashIdx ? originalPath.slice(dotIdx) : '.md'
  return `${stem}.conflict.${ts}${ext}`
}

async function findFreeCopyPath(basePath: string): Promise<string> {
  // Check if ipc.file.exists is available; if not, probe by trying to read
  if (typeof (ipc.file as any).exists === 'function') {
    if (!(await (ipc.file as any).exists(basePath))) return basePath
  }
  for (let i = 1; i < 100; i++) {
    const dotIdx = basePath.lastIndexOf('.')
    const stem = basePath.slice(0, dotIdx)
    const ext = basePath.slice(dotIdx)
    const cand = `${stem}-${i}${ext}`
    if (typeof (ipc.file as any).exists === 'function') {
      if (!(await (ipc.file as any).exists(cand))) return cand
    } else {
      // Fallback: always use first candidate if exists not available
      return i === 1 ? basePath : cand
    }
  }
  throw new Error(`no free copy slot for ${basePath}`)
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  state: { kind: 'idle' },

  async open(path) {
    // Subscribe to AI review job completion for this path
    _jobsUnsubscribe?.()
    _jobsUnsubscribe = ipc.on('jobs:changed', (job) => {
      if (job.kind !== 'ai-review-clip') return
      if (job.status !== 'done' && job.status !== 'failed') return
      const p = (job.payload as Record<string, unknown> | undefined)?.path as string | undefined
      const cur = get().state
      if (cur.kind !== 'ready') return
      if (p && p === cur.path) {
        if (job.status === 'done') void get().reloadFromDisk()
        get().setAiRerunInflight(false)
      }
    })

    set({ state: { kind: 'loading', path } })
    try {
      const r = await ipc.file.readParsed(path)
      set({
        state: {
          kind: 'ready',
          path,
          clipId: r.clipId ?? null,
          rawYaml: r.rawYaml,
          frontmatter: r.frontmatter,
          body: r.body,
          savedFrontmatter: r.frontmatter,
          savedBody: r.body,
          savedMtimeMs: r.mtimeMs,
          baseFrontmatter: r.frontmatter,
          baseBody: r.body,
          baseMtimeMs: r.mtimeMs,
          dirty: false,
          saving: false,
          lastError: null,
          saveErrorCount: 0,
          persistentFailure: false,
          conflictState: { kind: 'none' }
        }
      })
    } catch (err) {
      const code = err instanceof IpcError ? err.code : String(err)
      set({ state: { kind: 'error', path, error: code } })
    }
  },

  setBody(newBody) {
    const cur = get().state
    if (cur.kind !== 'ready') return
    const isDirty = newBody !== cur.savedBody
    set({
      state: {
        ...cur,
        body: newBody,
        dirty: isDirty
      }
    })
    if (isDirty) _scheduleSave()
  },

  async save() {
    if (isBlockedByConflict(get().state)) return
    if (_inflight) return _inflight
    const p = _doSave().finally(() => {
      _inflight = null
    })
    _inflight = p
    return p
  },
  async flushSave() {
    if (isBlockedByConflict(get().state)) return
    _cancelDebounce()
    if (_inflight) {
      await _inflight
    }
    const cur = get().state
    if (cur.kind !== 'ready') return
    if (cur.dirty) {
      await get().save()
    }
  },
  async reloadFromDisk() {
    const cur = get().state
    if (cur.kind !== 'ready') return
    const isBanner = cur.conflictState.kind === 'externalModified'
    const resolvedBy = isBanner ? 'load_remote_banner' : 'load_remote'
    const fresh = await ipc.file.readParsed(cur.path)
    const localText = stringify(cur.frontmatter, cur.body)
    const remoteText = stringify(fresh.frontmatter, fresh.body)
    const baseText = stringify(cur.baseFrontmatter, cur.baseBody)
    await ipc.conflict.writeSnapshot({
      path: cur.path,
      baseText,
      localText,
      remoteText,
      resolvedBy
    })
    set({
      state: {
        kind: 'ready',
        path: cur.path,
        clipId: fresh.clipId ?? null,
        rawYaml: fresh.rawYaml,
        frontmatter: fresh.frontmatter,
        body: fresh.body,
        savedFrontmatter: fresh.frontmatter,
        savedBody: fresh.body,
        savedMtimeMs: fresh.mtimeMs,
        baseFrontmatter: fresh.frontmatter,
        baseBody: fresh.body,
        baseMtimeMs: fresh.mtimeMs,
        dirty: false,
        saving: false,
        lastError: null,
        saveErrorCount: 0,
        persistentFailure: false,
        conflictState: { kind: 'none' }
      }
    })
  },

  ignoreExternalChange: () => {
    const cur = get().state
    if (cur.kind !== 'ready') return
    set({
      state: { ...cur, conflictState: { kind: 'none' } }
    })
  },

  async keepLocal() {
    const s = get().state
    if (s.kind !== 'ready' || s.conflictState.kind !== 'saveConflict') return
    const remote = s.conflictState
    const localText = stringify(s.frontmatter, s.body)
    const remoteText = stringify(remote.remoteFrontmatter, remote.remoteBody)
    const baseText = stringify(s.baseFrontmatter, s.baseBody)
    await ipc.conflict.writeSnapshot({
      path: s.path,
      baseText,
      localText,
      remoteText,
      resolvedBy: 'keep_local'
    })
    const result = await ipc.file.write(s.path, localText, { force: true })
    set((cur2) => {
      if (cur2.state.kind !== 'ready' || cur2.state.path !== s.path) return cur2
      return {
        ...cur2,
        state: {
          ...cur2.state,
          savedBody: cur2.state.body,
          savedFrontmatter: cur2.state.frontmatter,
          savedMtimeMs: result.mtimeMs,
          saving: false,
          conflictState: { kind: 'none' }
        }
      }
    })
  },

  async close() {
    await get().flushSave()
    _cancelDebounce()
    _jobsUnsubscribe?.()
    _jobsUnsubscribe = null
    set({ state: { kind: 'idle' } })
  },

  dismissDialog: () => {
    const cur = get().state
    if (cur.kind !== 'ready' || cur.conflictState.kind !== 'saveConflict') return
    set({
      state: {
        ...cur,
        conflictState: { kind: 'externalModified', remoteMtimeMs: cur.conflictState.remoteMtimeMs }
      }
    })
  },

  async saveAsCopy() {
    const cur = get().state
    if (cur.kind !== 'ready' || cur.conflictState.kind !== 'saveConflict') return
    const remote = cur.conflictState
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const desired = buildCopyPath(cur.path, ts)
    const newPath = await findFreeCopyPath(desired)

    const localText = stringify(cur.frontmatter, cur.body)
    const remoteText = stringify(remote.remoteFrontmatter, remote.remoteBody)
    const baseText = stringify(cur.baseFrontmatter, cur.baseBody)
    // Write the new file FIRST so the snapshot's winner_path points to a real file
    await ipc.file.write(newPath, localText)
    await ipc.conflict.writeSnapshot({
      path: cur.path,
      baseText,
      localText,
      remoteText,
      resolvedBy: 'save_as',
      winnerPath: newPath
    })
    // Set pendingNavigateTo — Editor page watches this and navigates
    set((cur2) => {
      if (cur2.state.kind !== 'ready') return cur2
      return {
        ...cur2,
        state: {
          ...cur2.state,
          conflictState: { kind: 'none' },
          pendingNavigateTo: newPath
        }
      }
    })
  },

  // ── phase-15: AI review actions ──

  applyAiSuggestedTitle: () => {
    const s = get().state
    if (s.kind !== 'ready') return
    const next = String(s.frontmatter.ai_suggested_title ?? '')
    if (!next || next === s.frontmatter.title) return
    set({
      state: {
        ...s,
        frontmatter: { ...s.frontmatter, title: next },
        dirty: true
      }
    })
    _scheduleSave()
  },

  mergeAiTags: () => {
    const s = get().state
    if (s.kind !== 'ready') return
    const ai = Array.isArray(s.frontmatter.ai_tags) ? (s.frontmatter.ai_tags as string[]) : []
    const cur = Array.isArray(s.frontmatter.tags) ? (s.frontmatter.tags as string[]) : []
    const merged = Array.from(new Set([...cur, ...ai]))
    if (merged.length === cur.length) return
    set({
      state: {
        ...s,
        frontmatter: { ...s.frontmatter, tags: merged },
        dirty: true
      }
    })
    _scheduleSave()
  },

  acceptAiReview: () => {
    const s = get().state
    if (s.kind !== 'ready') return
    const titleNext = String(s.frontmatter.ai_suggested_title ?? s.frontmatter.title ?? '')
    const aiTags = Array.isArray(s.frontmatter.ai_tags) ? (s.frontmatter.ai_tags as string[]) : []
    const curTags = Array.isArray(s.frontmatter.tags) ? (s.frontmatter.tags as string[]) : []
    const mergedTags = Array.from(new Set([...curTags, ...aiTags]))
    set({
      state: {
        ...s,
        frontmatter: {
          ...s.frontmatter,
          title: titleNext,
          tags: mergedTags,
          rating: typeof s.frontmatter.ai_rating === 'number' ? s.frontmatter.ai_rating : s.frontmatter.rating,
          category: typeof s.frontmatter.ai_category === 'string' && s.frontmatter.ai_category ? s.frontmatter.ai_category : s.frontmatter.category,
          ai_review_accepted_at: new Date().toISOString()
        },
        dirty: true
      }
    })
    _scheduleSave()
  },

  rejectAiReview: () => {
    const s = get().state
    if (s.kind !== 'ready') return
    set({
      state: {
        ...s,
        frontmatter: { ...s.frontmatter, ai_review_accepted_at: new Date().toISOString() },
        dirty: true
      }
    })
    _scheduleSave()
  },

  setAiRerunInflight: (v: boolean) => {
    const s = get().state
    if (s.kind !== 'ready') return
    set({ state: { ...s, aiRerunInflight: v } })
  }
}))
