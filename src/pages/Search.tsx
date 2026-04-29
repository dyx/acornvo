import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FullTextResultList } from '@/components/search/FullTextResultList'
import { useSearchStore } from '@/stores/search'
import { useIndexBannerStore } from '@/stores/indexBanner'

const FULL_TEXT_DEBOUNCE_MS = 200

function SearchResults({ q }: { q: string }): JSX.Element {
  const { t } = useTranslation()
  const items = useSearchStore((s) => s.fullText.items)
  const total = useSearchStore((s) => s.fullText.total)
  const pending = useSearchStore((s) => s.fullText.pending)
  const syntaxError = useSearchStore((s) => s.fullText.syntaxError)
  const runFullText = useSearchStore((s) => s.fullText.runFullText)
  const recentSearches = useSearchStore((s) => s.fullText.recentSearches)
  const rebuildVisible = useIndexBannerStore((s) => s.rebuildVisible)
  const prevRebuildVisible = useRef(rebuildVisible)

  useEffect(() => {
    void runFullText(q)
  }, [q, runFullText])

  useEffect(() => {
    if (prevRebuildVisible.current && !rebuildVisible && q.length > 0) {
      void runFullText(q)
    }
    prevRebuildVisible.current = rebuildVisible
  }, [rebuildVisible, q, runFullText])

  if (q.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted-foreground">
          {t('search.empty_q')}
        </div>
        {recentSearches.length > 0 ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t('search.recent_searches')}
            </div>
            <ul className="flex flex-col gap-1">
              {recentSearches.map((rq) => (
                <li key={rq} className="text-sm">
                  <a
                    className="text-primary hover:underline cursor-pointer"
                    href={`/search?q=${encodeURIComponent(rq)}`}
                  >
                    {rq}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    )
  }

  if (pending) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('search.pending')}
      </div>
    )
  }

  if (syntaxError) {
    return (
      <div className="text-sm text-destructive">
        {t('search.syntax_error')}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('search.no_results_full')}
      </div>
    )
  }

  return <FullTextResultList items={items} q={q} total={total} />
}

export default function Search(): JSX.Element {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // URL → state when navigating externally (back/forward)
  useEffect(() => {
    setQ(urlQ)
  }, [urlQ])

  // state → URL (debounced)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (q.length === 0) next.delete('q')
      else next.set('q', q)
      setParams(next, { replace: true })
    }, FULL_TEXT_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [q, params, setParams])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <input
          type="search"
          role="searchbox"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder_full')}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          aria-label={t('search.placeholder_full')}
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {t('search.phrase_hint')}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <SearchResults q={q} />
      </div>
    </div>
  )
}
