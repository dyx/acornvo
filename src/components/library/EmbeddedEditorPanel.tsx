import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Star, ChevronDown, ChevronRight } from 'lucide-react'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'
import { VditorEditor } from '@/components/editor/VditorEditor'
import { EditorErrorState } from '@/components/editor/EditorErrorState'
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
import { ConflictDialog } from '@/components/editor/ConflictDialog'
import { cn } from '@/lib/utils'
import { ipc } from '@/ipc/client'

function EditorPropertiesPanel(): JSX.Element {
  const fm = useEditorStore((s) => s.state.kind === 'ready' ? s.state.frontmatter : null)
  const detail = useLibraryStore((s) => s.selectedPath ? (s.detailsByPath.get(s.selectedPath) ?? null) : null)
  const defaultProfileId = useSettingsStore((s) => s.ai.defaultProfileId)
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [profileName, setProfileName] = useState<string | null>(null)

  useEffect(() => {
    if (!defaultProfileId) { setProfileName(null); return }
    void ipc.settings.aiProfilesList().then((profiles) => {
      const p = profiles.find((pr) => pr.id === defaultProfileId)
      setProfileName(p?.name ?? null)
    }).catch(() => setProfileName(null))
  }, [defaultProfileId])

  if (!detail || !fm) return <div />

  const { summary, body } = detail
  const wordCount = body.length
  const highlights = (fm.highlights ?? []) as string[]

  return (
    <div className="border-b-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-8 py-5">
      <div className="flex items-center gap-2 font-mono text-[11px] text-[color:var(--color-ink-3)]">
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="flex items-center justify-center p-0.5 hover:bg-[color:var(--color-bg-2)] rounded text-[color:var(--color-ink-3)] transition-colors">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {summary.category ? <span>{summary.category}</span> : null}
        {summary.category && summary.site ? <span>·</span> : null}
        {summary.site ? <span>{summary.site}</span> : null}
        {(summary.category || summary.site) && wordCount > 0 ? <span>·</span> : null}
        {wordCount > 0 ? <span>{wordCount.toLocaleString()} 字</span> : null}
        {summary.rating !== null ? (
          <div className="ml-2 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={11} className={cn(
                i < (summary.rating ?? 0) ? 'fill-[color:var(--color-acorn)] text-[color:var(--color-acorn)]' : 'text-[color:var(--color-line-2)]'
              )} />
            ))}
          </div>
        ) : null}
      </div>

      <h1 className={cn("serif font-semibold leading-tight tracking-tight text-[color:var(--color-ink)]", collapsed ? "mt-1 mb-0 text-[18px]" : "mt-2 mb-4 text-[22px]")}>
        {summary.title ?? summary.path}
      </h1>

      {!collapsed && (
        <div className="mt-4">
          {fm.summary || fm.ai_summary ? (
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] px-4 py-4">
              <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--color-acorn-2)]">
                <Sparkles size={11} className="text-[color:var(--color-acorn)]" /> 理果 · Summary
              </div>
              <p className="serif m-0 text-[14px] leading-[1.75] text-[color:var(--color-ink-2)]">
                {(fm.summary || fm.ai_summary) as string}
              </p>
              {highlights.length > 0 ? (
                <ul className="mt-3 list-disc pl-5 text-[13px] leading-[1.7] text-[color:var(--color-ink-2)]">
                  {highlights.map((h, i) => <li key={i} className="mb-1">{h}</li>)}
                </ul>
              ) : null}
            </div>
          ) : summary.review_status === 'running' ? (
            <div data-testid="preview-reviewing-loader" className="flex items-center gap-2.5 rounded-[10px] border-[0.5px] border-dashed border-[color:var(--color-acorn)] bg-[color:var(--color-acorn-bg)] p-4">
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-[color:var(--color-acorn)] border-t-transparent" />
              <span className="serif text-[13px]">{t('library.reviewing')} · {profileName ?? 'AI'}</span>
            </div>
          ) : summary.review_status === 'pending' ? (
            <div data-testid="preview-pending-loader" className="flex items-center gap-2.5 rounded-[10px] border-[0.5px] border-dashed border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] p-4">
              <span className="serif text-[13px] text-[color:var(--color-ink-4)]">{t('library.review_pending')}</span>
            </div>
          ) : summary.review_status === 'failed' ? (
            <div data-testid="preview-review-failed" className="flex items-center gap-2.5 rounded-[10px] border-[0.5px] border-dashed border-[color:var(--color-berry)] bg-[color:var(--color-paper-2)] p-4">
              <span className="text-[13px]">⚠️</span>
              <span className="serif text-[13px] text-[color:var(--color-berry)]">{t('library.review_failed')}</span>
            </div>
          ) : summary.rating === null ? (
            <div className="rounded-[10px] border-[0.5px] border-dashed border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] p-4">
              <span className="serif text-[13px] text-[color:var(--color-ink-4)]">{t('library.unreviewed')}</span>
            </div>
          ) : null}

          {summary.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {summary.tags.map((tag) => (
                <span key={tag} className="rounded-full border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-leaf-bg)] px-2.5 py-0.5 font-mono text-[11px] text-[color:var(--color-ink-2)]">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function EmbeddedEditorPanel(): JSX.Element {
  const { t } = useTranslation()
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const kind = useEditorStore((s) => s.state.kind)

  useEffect(() => {
    if (!selectedPath) return
    void useEditorStore.getState().open(selectedPath)
    return () => {
      // Intentionally not closing so it can be resumed or handled by store
    }
  }, [selectedPath])

  useEffect(() => {
    function handler(): void {
      if (document.visibilityState === 'hidden') {
        void useEditorStore.getState().flushSave()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    if (kind !== 'ready') return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 's' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        void useEditorStore.getState().flushSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind])

  if (!selectedPath) {
    return (
      <div data-testid="preview-empty" className="flex h-full flex-col items-center justify-center text-sm text-[color:var(--color-ink-3)]">
        {t('library.empty_preview')}
      </div>
    )
  }

  if (kind === 'idle' || kind === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
        {t('editor.loading')}
      </div>
    )
  }

  if (kind === 'error') {
    return <EditorErrorState />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-none">
        <ExternalModifiedBanner />
        <ConflictDialog />
        <EditorPropertiesPanel />
      </div>
      <div className="flex-1 overflow-auto bg-[color:var(--color-bg-1)]">
        <VditorEditor />
      </div>
    </div>
  )
}
