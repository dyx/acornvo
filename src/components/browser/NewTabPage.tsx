// src/components/browser/NewTabPage.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { useBrowserStore } from '@/stores/browser'
import type { Bookmark } from '@shared/browser-types'

export function NewTabPage(): JSX.Element {
  const { t } = useTranslation()
  const tab = useBrowserStore((s) => s.getActiveTab())
  const navigate = useBrowserStore((s) => s.navigate)

  const [recent, setRecent] = useState<Bookmark[]>([])

  useEffect(() => {
    void ipc.bookmarks.list({ limit: 6, offset: 0 }).then((r) => setRecent(r.items))
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-[color:var(--color-ink)]">
      <h1 className="serif text-3xl font-semibold">{t('browser.new_tab.welcome', '拾果')}</h1>
      <p className="text-sm text-[color:var(--color-ink-3)]">
        {t('browser.new_tab.hint', 'Type a URL or search term in the address bar.')}
      </p>
      {recent.length > 0 && (
        <section className="w-full max-w-2xl">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-ink-3)]">
            {t('browser.new_tab.recent', 'Recent bookmarks')}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {recent.map((b) => (
              <li key={b.id}>
                <a
                  role="link"
                  className="block cursor-pointer truncate rounded border border-[color:var(--color-line)] p-2 text-sm hover:bg-[color:var(--color-bg-3)]"
                  onClick={() => {
                    if (tab) void navigate(tab.id, b.url)
                  }}
                >
                  <div className="truncate font-medium">{b.title || b.url}</div>
                  <div className="truncate text-[10px] text-[color:var(--color-ink-3)]">
                    {new URL(b.url).hostname}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
